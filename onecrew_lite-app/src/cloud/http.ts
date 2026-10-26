import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { getRequestListener } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { assertShopifyStoreOwner, createShopifyClient, type ShopifyConfiguration, type VerifiedShopifySession } from "../shopify/client.ts";
import { ShopifyInstallationStore, shopifyWebhookTopic } from "../shopify/installation-store.ts";
import { CLOUD_PLATFORMS } from "./platforms.ts";
import { CloudHttpError } from "./http-error.ts";
import { ShopifyUninstallProcessor } from "../shopify/uninstall-processor.ts";
import { ShopBrowserManager } from "./shop-browser-manager.ts";
import { cloudCreatorSearch } from "./platforms.ts";
import { OpenCliError } from "../platforms/opencli/errors.ts";
import { RemoteBrowserGateway } from "./remote-browser-gateway.ts";
import { cloudPlatform } from "./platforms.ts";
import { attachCloudWeb } from "./web-assets.ts";
import { cloudBrowserRead } from "./browser-operations.ts";
import { stringifyApplicationJson } from "../contracts/application-json.ts";
import { ShopDataService } from "./shop-data.ts";
import { ShopLibraryService } from "./shop-library.ts";
import { TableDataError } from "onecrew_lite_tables/embedded";
import { CloudCampaignService } from "./campaign-service.ts";
import { CampaignJobStore, createCloudCampaign, startCloudCampaign } from "./campaign-jobs.ts";
import { generateFromTemplate, saveCampaignTemplate } from "./campaign-templates.ts";
import { AccountChangedError } from "../identity/account-context.ts";
import { AccessVerificationError } from "../identity/access-verification.ts";
import { MailAccessError } from "../mail/access-mail-client.ts";
import type { CloudMailService } from "./mail-service.ts";

interface CloudHttpOptions {
  readonly shopify: ShopifyConfiguration;
  readonly installations: ShopifyInstallationStore;
  readonly uninstalls: ShopifyUninstallProcessor;
  readonly browsers?: ShopBrowserManager;
  readonly connections?: RemoteBrowserGateway;
  readonly webDirectory?: string;
  readonly data?: ShopDataService;
  readonly library?: ShopLibraryService;
  readonly campaigns?: CloudCampaignService;
  readonly campaignJobs?: CampaignJobStore;
  readonly mail?: CloudMailService;
  readonly reportFailure: (failure: { requestId: string; code: string; errorClass: string }) => void;
}
type HttpEnvironment = { Variables: { requestId: string; identity: VerifiedShopifySession } };
const productsQuery = z.strictObject({ first: z.coerce.number().int().min(1).max(100).default(25), after: z.string().min(1).max(4096).optional() });
const mailDraft = z.strictObject({ mailbox_ref_id: z.string().min(1), subject: z.string(), body: z.string(),
  recipients: z.array(z.strictObject({ email: z.string(), source: z.string() })).min(1).max(100) });

export function createCloudHttpApp(options: CloudHttpOptions) {
  const client = createShopifyClient(options.shopify);
  const origin = new URL(options.shopify.applicationUrl).origin;
  const app = new Hono<HttpEnvironment>();
  const store = options.installations;

  app.use("*", async (context, next) => {
    const requestId = randomUUID();
    context.set("requestId", requestId);
    context.header("X-Request-ID", requestId);
    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    const requestOrigin = context.req.header("origin");
    if (requestOrigin !== undefined && requestOrigin !== origin) throw new CloudHttpError("cloud.origin_invalid", 403);
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: context => context.json({ error: { code: "request.too_large" }, request_id: context.get("requestId") }, 413) }));
  app.get("/healthz", context => context.json({ service: "onecrew_cloud", status: "listening" }));

  app.use("/api/*", async (context, next) => {
    context.set("identity", await client.authenticate(context.req.header("authorization") ?? null));
    await next();
  });
  function assertInstalled(shop: string, revision?: number) {
    const workspace = store.workspace(shop);
    if (!workspace || workspace.uninstalled_at !== null) throw new CloudHttpError("shopify.installation_required", 409);
    if (revision !== undefined && store.lifecycleRevision(shop) !== revision) throw new CloudHttpError("shopify.installation_changed", 409);
    return workspace;
  }
  async function campaignAccess(context: Context<HttpEnvironment>) {
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    const session = await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    return { identity, session, assertCurrent: () => { assertInstalled(identity.shop, revision); } };
  }
  async function privacyAccess(context: Context<HttpEnvironment>) {
    const access = await campaignAccess(context);
    assertShopifyStoreOwner(access.session);
    return access;
  }
  function campaigns() { if (!options.campaigns) throw new CloudHttpError("cloud.campaigns_not_configured", 503); return options.campaigns; }
  function mail() { if (!options.mail) throw new CloudHttpError("cloud.mail_not_configured", 503); return options.mail; }
  function browserAvailable(shop: string) { if (options.campaignJobs?.busy(shop)) throw new CloudHttpError("cloud.campaign_busy", 409); }
  app.post("/api/shopify/install", async context => {
    options.uninstalls.assertHealthy();
    const identity = context.get("identity");
    const revision = store.lifecycleRevision(identity.shop);
    const authorization = context.req.header("authorization")!;
    // 商品访问使用成员 online scope，后台 offline token 不用于提升成员权限。
    await client.exchangeOnlineSession(authorization);
    const session = await client.exchangeOfflineSession(authorization);
    const workspace = store.install(session, revision, identity.issuedAt);
    return context.json({ workspace, platforms: CLOUD_PLATFORMS });
  });
  app.get("/api/workspace", context => {
    const identity = context.get("identity");
    return context.json({ workspace: assertInstalled(identity.shop), member_id: identity.userId, platforms: CLOUD_PLATFORMS });
  });
  app.get("/api/products", async context => {
    const query = productsQuery.parse(context.req.query());
    const identity = context.get("identity");
    assertInstalled(identity.shop);
    const revision = store.lifecycleRevision(identity.shop);
    const session = await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const products = await client.products(session, query.first, query.after ?? null);
    assertInstalled(identity.shop, revision);
    return context.json(products);
  });
  app.get("/api/campaigns", async context => {
    if (!options.data) throw new CloudHttpError("cloud.data_not_configured", 503);
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const campaigns = await options.data.recentCampaigns(identity.shop);
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson({ campaigns }), 200, { "content-type": "application/json" });
  });
  app.get("/api/campaigns/:id", async context => {
    if (!options.data) throw new CloudHttpError("cloud.data_not_configured", 503);
    const id = z.string().min(1).max(128).parse(context.req.param("id"));
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const campaign = await options.data.campaign(identity.shop, id);
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson({ campaign }), 200, { "content-type": "application/json" });
  });
  app.post("/api/campaigns", async context => {
    const service = campaigns(), input = createCloudCampaign.parse(await context.req.json());
    const access = await campaignAccess(context);
    const job = await service.create(access.identity.shop, input, async id => { const product = await client.product(access.session, id); access.assertCurrent(); return product; });
    access.assertCurrent();
    return context.json({ job }, 202);
  });
  app.get("/api/campaigns/:id/results", async context => {
    if (!options.data || !options.library) throw new CloudHttpError("cloud.data_not_configured", 503);
    const id = z.string().regex(/^[A-Za-z\d_-]{1,128}$/u).parse(context.req.param("id"));
    const query = z.strictObject({ after_hit_id: z.string().min(1).max(128).optional(), after_candidate_id: z.string().min(1).max(128).optional() }).parse(context.req.query());
    const access = await campaignAccess(context);
    const results = await options.data.results(access.identity.shop, id, query.after_hit_id ?? null, query.after_candidate_id ?? null);
    const library = await options.library.campaignResults(access.identity.shop, id);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ ...results, library }), 200, { "content-type": "application/json" });
  });
  app.get("/api/campaigns/:id/hits/:hit/material", async context => {
    if (!options.data) throw new CloudHttpError("cloud.data_not_configured", 503);
    const id = z.string().regex(/^[A-Za-z\d_-]{1,128}$/u).parse(context.req.param("id")), hit = z.string().min(1).max(128).parse(context.req.param("hit"));
    const query = z.strictObject({ revision: z.coerce.number().int().positive().max(4294967295) }).parse(context.req.query());
    const access = await campaignAccess(context);
    const material = await options.data.reviewMaterial(access.identity.shop, id, hit, query.revision);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ material }), 200, { "content-type": "application/json" });
  });
  app.get("/api/campaign-templates", async context => {
    const service = campaigns(), access = await campaignAccess(context);
    const templates = await service.templates(access.identity.shop);
    access.assertCurrent();
    return context.json({ templates });
  });
  app.post("/api/campaign-templates", async context => {
    const service = campaigns(), input = saveCampaignTemplate.parse(await context.req.json()), access = await campaignAccess(context);
    const template = await service.saveTemplate(access.identity.shop, input);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ template }), 201, { "content-type": "application/json" });
  });
  app.get("/api/campaign-templates/:id", async context => {
    const service = campaigns(), id = z.uuid().parse(context.req.param("id")), access = await campaignAccess(context);
    const template = await service.template(access.identity.shop, id);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ template }), 200, { "content-type": "application/json" });
  });
  app.post("/api/campaign-templates/:id/generate", async context => {
    const service = campaigns(), id = z.uuid().parse(context.req.param("id")), input = generateFromTemplate.parse(await context.req.json()), access = await campaignAccess(context);
    const job = await service.createFromTemplate(access.identity.shop, id, input, async productId => { const product = await client.product(access.session, productId); access.assertCurrent(); return product; });
    access.assertCurrent();
    return context.json({ job }, 202);
  });
  app.get("/api/campaign-jobs", async context => {
    const service = campaigns(), access = await campaignAccess(context);
    const jobs = await service.recent(access.identity.shop);
    access.assertCurrent();
    return context.json({ jobs });
  });
  app.get("/api/campaign-jobs/:id", async context => {
    const service = campaigns(), id = z.uuid().parse(context.req.param("id"));
    const access = await campaignAccess(context);
    const status = await service.status(access.identity.shop, id);
    access.assertCurrent();
    return context.body(stringifyApplicationJson(status), 200, { "content-type": "application/json" });
  });
  app.post("/api/campaign-jobs/:id/cancel", async context => {
    const service = campaigns(), id = z.uuid().parse(context.req.param("id"));
    z.strictObject({}).parse(await context.req.json());
    const access = await campaignAccess(context), job = await service.cancelDraft(access.identity.shop, id);
    access.assertCurrent();
    return context.json({ job }, 202);
  });
  app.post("/api/campaigns/:id/approve", async context => {
    const service = campaigns(), id = z.string().min(1).max(128).parse(context.req.param("id"));
    const input = z.strictObject({ expected_revision: z.number().int().positive() }).parse(await context.req.json());
    const access = await campaignAccess(context);
    const campaign = await service.approve(access.identity.shop, id, input.expected_revision);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ campaign }), 200, { "content-type": "application/json" });
  });
  app.post("/api/campaigns/:id/start", async context => {
    const service = campaigns(), id = z.string().min(1).max(128).parse(context.req.param("id"));
    const input = startCloudCampaign.parse(await context.req.json()), access = await campaignAccess(context);
    const job = await service.start(access.identity.shop, id, input);
    access.assertCurrent();
    return context.json({ job }, 202);
  });
  app.post("/api/campaigns/:id/pause", async context => {
    const service = campaigns(), id = z.string().min(1).max(128).parse(context.req.param("id"));
    z.strictObject({}).parse(await context.req.json());
    const access = await campaignAccess(context), execution = await service.pause(access.identity.shop, id);
    access.assertCurrent();
    return context.body(stringifyApplicationJson({ execution }), 200, { "content-type": "application/json" });
  });
  app.get("/api/library", async context => {
    if (!options.library) throw new CloudHttpError("cloud.library_not_configured", 503);
    const query = z.strictObject({ page: z.coerce.number().int().positive().default(1), size: z.coerce.number().int().min(1).max(100).default(25) }).parse(context.req.query());
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const tables = await options.library.list(identity.shop, query.page, query.size);
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson(tables), 200, { "content-type": "application/json" });
  });
  app.get("/api/library/:id", async context => {
    if (!options.library) throw new CloudHttpError("cloud.library_not_configured", 503);
    const id = z.string().min(1).max(128).parse(context.req.param("id"));
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const table = await options.library.table(identity.shop, id);
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson({ table }), 200, { "content-type": "application/json" });
  });
  app.get("/api/library/:id/creators", async context => {
    if (!options.library) throw new CloudHttpError("cloud.library_not_configured", 503);
    const id = z.string().min(1).max(128).parse(context.req.param("id"));
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const creators = await options.library.creators(identity.shop, id);
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson(creators), 200, { "content-type": "application/json" });
  });
  app.post("/api/search", async context => {
    if (!options.browsers) throw new CloudHttpError("cloud.browsers_not_configured", 503);
    const input = cloudCreatorSearch.parse(await context.req.json());
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    browserAvailable(identity.shop);
    const workspace = assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const hits = await options.browsers.search(workspace, input, context.req.raw.signal).then(value => value, error => { if (error instanceof OpenCliError) throw new CloudHttpError(error.code, error.code === "opencli_cancelled" ? 409 : 502); throw error; });
    assertInstalled(identity.shop, revision);
    return context.json({ hits });
  });
  app.post("/api/connections", async context => {
    if (!options.connections) throw new CloudHttpError("cloud.browsers_not_configured", 503);
    const { platform } = z.strictObject({ platform: cloudPlatform }).parse(await context.req.json());
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    browserAvailable(identity.shop);
    const workspace = assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    return context.json(options.connections.issue(workspace, identity.userId, platform));
  });
  app.post("/api/read", async context => {
    if (!options.browsers) throw new CloudHttpError("cloud.browsers_not_configured", 503);
    const input = cloudBrowserRead.parse(await context.req.json());
    const identity = context.get("identity"), revision = store.lifecycleRevision(identity.shop);
    browserAvailable(identity.shop);
    const workspace = assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    assertInstalled(identity.shop, revision);
    const data = await options.browsers.read(workspace, input, context.req.raw.signal).then(value => value, error => { if (error instanceof OpenCliError) throw new CloudHttpError(error.code, error.code === "opencli_cancelled" ? 409 : 502); throw error; });
    assertInstalled(identity.shop, revision);
    return context.body(stringifyApplicationJson({ data }), 200, { "content-type": "application/json" });
  });
  app.post("/api/connections/close", async context => {
    if (!options.browsers) throw new CloudHttpError("cloud.browsers_not_configured", 503);
    const identity = context.get("identity");
    browserAvailable(identity.shop);
    assertInstalled(identity.shop);
    await client.exchangeOnlineSession(context.req.header("authorization")!);
    await options.browsers.closeShop(identity.shop);
    return context.json({ saved: true });
  });
  app.post("/api/connections/disconnect", async context => {
    if (!options.browsers) throw new CloudHttpError("cloud.browsers_not_configured", 503);
    const { platform } = z.strictObject({ platform: cloudPlatform }).parse(await context.req.json());
    const access = await campaignAccess(context);
    browserAvailable(access.identity.shop);
    const workspace = assertInstalled(access.identity.shop);
    const receipt = await options.browsers.disconnect(workspace, platform, context.req.raw.signal);
    access.assertCurrent();
    return context.json(receipt);
  });
  app.get("/api/privacy/requests", async context => {
    const access = await privacyAccess(context);
    return context.json({ requests: store.privacyRequests(access.identity.shop) });
  });
  app.get("/api/privacy/requests/:id/export", async context => {
    const id = z.uuid().parse(context.req.param("id")), access = await privacyAccess(context);
    const report = store.customerDataExport(access.identity.shop, id);
    try { return context.body(report.toString("utf8"), 200, { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="onecrew-customer-data-${id}.json"` }); }
    finally { report.fill(0); }
  });
  app.post("/api/privacy/requests/:id/delivered", async context => {
    const id = z.uuid().parse(context.req.param("id"));
    z.strictObject({}).parse(await context.req.json());
    const access = await privacyAccess(context);
    store.confirmCustomerDataDelivery(access.identity.shop, id);
    return context.json({ delivered: true });
  });
  app.get("/mail/pairing/callback", async context => {
    const input = z.strictObject({ code: z.string().regex(/^reacher_pairing_v1\.[A-Za-z0-9_-]{43}$/u), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).parse(context.req.query());
    await mail().complete(input.code, input.state);
    context.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    return context.text("OneCrew 授权完成。请返回 Shopify 页面，刷新邮箱连接。");
  });
  app.get("/api/mail/status", async context => {
    const access = await campaignAccess(context);
    return context.json(await mail().status(access.identity.shop, access.identity.userId));
  });
  app.post("/api/mail/pair", async context => {
    z.strictObject({}).parse(await context.req.json());
    const access = await campaignAccess(context);
    return context.json(mail().begin(access.identity.shop, access.identity.userId));
  });
  app.post("/api/mail/connect", async context => {
    z.strictObject({}).parse(await context.req.json());
    const access = await campaignAccess(context);
    return context.json(await mail().connect(access.identity.shop, access.identity.userId));
  });
  app.post("/api/mail/disconnect", async context => {
    z.strictObject({}).parse(await context.req.json());
    const access = await campaignAccess(context);
    await mail().disconnect(access.identity.shop, access.identity.userId);
    return context.json({ disconnected: true });
  });
  app.get("/api/mail/recipients", async context => {
    const access = await campaignAccess(context);
    return context.json(await mail().recipients(access.identity.shop));
  });
  app.get("/api/mail/batches", async context => {
    const access = await campaignAccess(context);
    return context.json(await mail().list(access.identity.shop, access.identity.userId));
  });
  app.post("/api/mail/prepare", async context => {
    const input = mailDraft.parse(await context.req.json()), access = await campaignAccess(context);
    return context.json({ batch: await mail().prepare(access.identity.shop, access.identity.userId, input) });
  });
  app.post("/api/mail/send", async context => {
    const input = z.strictObject({ id: z.uuid(), action: z.enum(["confirm", "pause", "resume", "cancel"]) }).parse(await context.req.json()), access = await campaignAccess(context);
    return context.json(await mail().control(access.identity.shop, access.identity.userId, input.id, input.action));
  });
  app.post("/api/mail/readback", async context => {
    const input = z.strictObject({ id: z.uuid() }).parse(await context.req.json()), access = await campaignAccess(context);
    return context.json(await mail().readback(access.identity.shop, access.identity.userId, input.id));
  });
  app.post("/webhooks/shopify", async context => {
    const rawBody = await context.req.text();
    const verified = await client.validateWebhook(context.req.raw, rawBody);
    const topic = shopifyWebhookTopic.safeParse(verified.topic);
    if (!topic.success) throw new CloudHttpError("shopify.webhook_topic_unsupported", 422);
    options.uninstalls.receiveVerifiedWebhook({ webhookId: verified.webhookId, shop: verified.domain, topic: topic.data, apiVersion: verified.apiVersion, triggeredAt: verified.triggeredAt ?? null, body: rawBody });
    return context.json({ received: true });
  });
  app.notFound(context => context.json({ error: { code: "request.not_found" }, request_id: context.get("requestId") }, 404));
  app.onError((error, context) => {
    const status = error instanceof CloudHttpError ? error.status : error instanceof AccessVerificationError ? error.status as ContentfulStatusCode : error instanceof MailAccessError ? 502 : error instanceof AccountChangedError ? 409 : error instanceof OpenCliError ? error.code === "opencli_cancelled" ? 409 : 502 : error instanceof TableDataError ? error.status as ContentfulStatusCode : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
    const code = error instanceof CloudHttpError ? error.message : error instanceof AccountChangedError ? "shopify.installation_changed" : error instanceof OpenCliError || error instanceof TableDataError || error instanceof AccessVerificationError || error instanceof MailAccessError ? error.code : status === 400 ? "request.invalid_input" : "cloud.request_failed";
    if (status >= 500) options.reportFailure({ requestId: context.get("requestId"), code, errorClass: error.name });
    return context.json({ error: { code }, request_id: context.get("requestId") }, status);
  });
  return app;
}

export async function listenCloudHttp(options: CloudHttpOptions, port: number) {
  z.number().int().min(0).max(65535).parse(port);
  const connections = options.browsers ? new RemoteBrowserGateway(options.installations, options.browsers, new URL(options.shopify.applicationUrl).origin, error => options.reportFailure({ requestId: randomUUID(), code: "cloud.viewer_failed", errorClass: error instanceof Error ? error.name : "Error" })) : undefined;
  const app = createCloudHttpApp({ ...options, ...(connections ? { connections } : {}) });
  if (options.webDirectory) await attachCloudWeb(app, options.webDirectory, options.shopify);
  const server = createServer(getRequestListener(app.fetch));
  connections?.attach(server);
  if (!connections) server.on("upgrade", (_request, socket) => socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("cloud.listener_invalid");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close(): Promise<void> {
      await connections?.close();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
