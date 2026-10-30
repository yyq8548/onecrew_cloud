import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { lstatSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openCloudStorage } from '../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopRuntimeRegistry } from '../../onecrew_lite-app/src/cloud/shop-runtime-registry.ts';
import { ShopDataService } from '../../onecrew_lite-app/src/cloud/shop-data.ts';
import { openCloudLibrary, ShopLibraryService } from '../../onecrew_lite-app/src/cloud/shop-library.ts';
import { ShopBrowserManager } from '../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { RemoteBrowserGateway } from '../../onecrew_lite-app/src/cloud/remote-browser-gateway.ts';
import { CloudCampaignService } from '../../onecrew_lite-app/src/cloud/campaign-service.ts';
import { LocalMailClient } from '../../onecrew_lite-app/src/cloud/local-mail-client.ts';
import { cloudMailDraft, recommendationMailRecipients, verifiedMailRecipients } from '../../onecrew_lite-app/src/cloud/recommendation-mail.ts';
import { GmailBulkInputError } from '../../onecrew_lite-app/src/mail/gmail-bulk.ts';
import { CLOUD_PLATFORMS, cloudPlatform } from '../../onecrew_lite-app/src/cloud/platforms.ts';
import { CloudHttpError } from '../../onecrew_lite-app/src/cloud/http-error.ts';
import { OpenCliError } from '../../onecrew_lite-app/src/platforms/opencli/errors.ts';
import { parseApplicationJson, stringifyApplicationJson } from '../../onecrew_lite-contracts/src/json.ts';
import { createCheckModel } from './model/check-client.mjs';

const require = createRequire(new URL('../../onecrew_lite-app/package.json', import.meta.url));
const { Hono } = require('hono');
const { bearerAuth } = require('hono/bearer-auth');
const { HTTPException } = require('hono/http-exception');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');
const { z } = require('zod');
const { load } = require('cheerio');
const args = parseArgs({ options: { 'mail-data': { type: 'string', default: '.scratch/macos-gmail-live' }, 'reuse-results': { type: 'boolean', default: false } }, allowPositionals: true, strict: true });
const [dataDirectory] = args.positionals;
assert.ok(dataDirectory && args.positionals.length === 1, '用法：node development/cloud/local-workbench.mjs <本机数据目录> [--mail-data 原Gmail目录] [--reuse-results]');
const directory = resolve(dataDirectory), origin = 'http://127.0.0.1:50033', libraryOrigin = 'https://cloud.example.com';
const token = randomBytes(32).toString('hex');
const stopped = Promise.withResolvers();
await using ownership = new AsyncDisposableStack();
const storage = await openCloudStorage(directory, !lstatSync(directory, { throwIfNoEntry: false })); ownership.defer(() => storage.close());
storage.campaignJobs.recover();
using metadata = new DatabaseSync(join(directory, 'cloud.sqlite'), { readOnly: true });
const shops = args.values['reuse-results'] ? metadata.prepare('SELECT shop FROM shopify_installations WHERE uninstalled_at IS NULL').all() : [];
if (args.values['reuse-results']) assert.equal(shops.length, 1, '旧结果复用只接受一个明确的原工作区');
const mail = new LocalMailClient(resolve(args.values['mail-data']));
const browsers = new ShopBrowserManager({ dataDirectory: directory, image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.workspaces, storage.browserSnapshots);
ownership.defer(() => browsers.close());
await browsers.recover();
const tables = await openCloudLibrary(storage.lease, libraryOrigin); ownership.defer(() => tables.close());
const runtimes = new ShopRuntimeRegistry(); ownership.defer(() => runtimes.close());
const data = new ShopDataService(storage.lease, storage.workspaces, runtimes);
const library = new ShopLibraryService(tables, data, libraryOrigin);
const campaigns = new CloudCampaignService({ data, installations: storage.workspaces, jobs: storage.campaignJobs, templates: storage.campaignTemplates, browsers, library, model: createCheckModel(),
  reportFailure: failure => console.error(stringifyApplicationJson({ event: 'cloud.local_workflow_failure', ...failure })),
  onFatal: error => { console.error(JSON.stringify({ event: 'cloud.local_fatal', name: error.name, code: error.code })); process.exitCode = 1; stopped.resolve(); },
});
const gateway = new RemoteBrowserGateway(storage.workspaces, browsers, origin, error => console.error(JSON.stringify({ event: 'cloud.local_viewer_failure', name: error.name })));
let boundUser;
let preparingWorkspace;
async function currentWorkspace() {
  const user = await mail.owner();
  if (boundUser && boundUser !== user.id) throw new CloudHttpError('access.account_changed', 409);
  if (!preparingWorkspace) {
    boundUser = user.id;
    preparingWorkspace = (async () => {
      const tenant = await tables.tenants.resolve(user);
      const workspace = storage.workspaces.local(user, tenant);
      for (const prior of shops) storage.workspaces.adoptLegacy(prior.shop, user.id);
      const legacy = storage.workspaces.legacy(user.id);
      if (!storage.workspaces.browserSnapshot(workspace.shop) && legacy.length) {
        const previous = storage.workspaces.workspace(legacy[0]);
        const snapshot = storage.workspaces.browserSnapshot(previous.shop);
        if (snapshot) {
          const [targetOwner, sourceOwner] = [workspace, previous].map(({ shop, tenant_id, base_id }) => ({ shop, tenant_id, base_id }));
          const transfer = new PassThrough(), controller = new AbortController();
          const fail = error => { controller.abort(error); throw error; };
          const saving = storage.browserSnapshots.save(targetOwner, transfer, controller.signal).then(undefined, fail);
          const restored = storage.browserSnapshots.restoreTo(sourceOwner, snapshot, transfer, controller.signal).then(undefined, fail);
          const results = await Promise.allSettled([restored, saving]);
          for (const result of results) if (result.status === 'rejected') throw result.reason;
          storage.workspaces.recordBrowserSnapshot(targetOwner, results[1].value.id, 0);
        }
      }
      return { workspace, user, owners: [workspace.shop, ...legacy] };
    })();
  }
  return preparingWorkspace;
}
function jobOwner(current, id) {
  const matches = current.owners.filter(owner => storage.campaignJobs.get(owner, id));
  if (matches.length !== 1) throw new CloudHttpError(matches.length ? 'cloud.job_conflict' : 'cloud.job_missing', matches.length ? 409 : 404);
  return matches[0];
}
function templateOwner(current, id) {
  const matches = current.owners.filter(owner => storage.campaignTemplates.get(owner, id));
  if (matches.length !== 1) throw new CloudHttpError('cloud.template_missing', 404);
  return matches[0];
}
const catalogUnavailable = async () => { throw new CloudHttpError('cloud.manual_product_required', 400); };
const webDirectory = resolve('onecrew_lite-web/dist-cloud');
const html = load(await readFile(join(webDirectory, 'cloud.html'), 'utf8'));
html('meta[name="shopify-api-key"],script[src="https://cdn.shopify.com/shopifycloud/app-bridge.js"]').remove();
html('head').append('<meta name="onecrew-cloud-local" content="true">');
html('title').text('OneCrew Cloud');
const app = new Hono();
app.use('*', async (context, next) => {
  if (context.req.header('host') !== '127.0.0.1:50033') return context.text('Invalid host', 403);
  context.header('Cache-Control', 'no-store'); context.header('Referrer-Policy', 'no-referrer');
  context.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.get('/', context => context.html(html.html()));
app.use('/api/*', bearerAuth({ token }));
app.use('/api/*', async (context, next) => {
  const source = context.req.header('origin');
  if (source && source !== origin || context.req.method !== 'GET' && source !== origin) throw new CloudHttpError('cloud.local_origin_invalid', 403);
  await next();
});
app.use('/api/*', async (context, next) => {
  if (!['/api/mail/status', '/api/mail/pair'].includes(context.req.path)) context.set('current', await currentWorkspace());
  await next();
});
function json(context, value, status = 200) { return context.body(stringifyApplicationJson(value), status, { 'content-type': 'application/json' }); }
const id = z.string().regex(/^[A-Za-z\d_-]{1,128}$/u);
const sourceId = z.string().min(1).max(128);
const connectionInput = z.strictObject({ platform: cloudPlatform });
function browserAvailable(current) {
  if (current.owners.some(owner => storage.campaignJobs.recent(owner).some(job => job.state === 'running'))) throw new CloudHttpError('cloud.campaign_busy', 409);
}
app.get('/api/workspace', context => json(context, { workspace: context.get('current').workspace, platforms: CLOUD_PLATFORMS }));
app.get('/api/products', context => json(context, { products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }));
app.get('/api/campaign-jobs', async context => {
  const jobs = (await Promise.all(context.get('current').owners.map(owner => campaigns.recent(owner)))).flat().sort((a, b) => b.created_at - a.created_at).slice(0, 20);
  return json(context, { jobs });
});
app.get('/api/campaign-jobs/:id', async context => { const value = z.uuid().parse(context.req.param('id')); return json(context, await campaigns.status(jobOwner(context.get('current'), value), value)); });
app.post('/api/campaign-jobs/:id/cancel', async context => { const value = z.uuid().parse(context.req.param('id')); return json(context, { job: await campaigns.cancelDraft(jobOwner(context.get('current'), value), value) }); });
app.post('/api/campaigns', async context => {
  const job = await campaigns.create(context.get('current').workspace.shop, await context.req.json(), catalogUnavailable);
  console.info(JSON.stringify({ event: 'cloud.local_workflow_started', id: job.id, product: job.product.title, source: job.product.source }));
  return json(context, { job });
});
app.post('/api/campaigns/:id/start', async context => { const value = id.parse(context.req.param('id')); return json(context, { job: await campaigns.start(jobOwner(context.get('current'), value), value, await context.req.json()) }); });
app.get('/api/campaigns/:id/results', async context => {
  const campaign = id.parse(context.req.param('id'));
  const query = z.strictObject({ after_hit_id: sourceId.optional(), after_candidate_id: sourceId.optional() }).parse(context.req.query());
  const shop = jobOwner(context.get('current'), campaign);
  const results = await data.results(shop, campaign, query.after_hit_id ?? null, query.after_candidate_id ?? null);
  return json(context, { ...results, library: await library.campaignResults(shop, campaign) });
});
app.get('/api/campaigns/:id/hits/:hit/material', async context => {
  const campaign = id.parse(context.req.param('id')), hit = sourceId.parse(context.req.param('hit'));
  const revision = z.coerce.number().int().positive().parse(context.req.query('revision'));
  return json(context, { material: await data.reviewMaterial(jobOwner(context.get('current'), campaign), campaign, hit, revision) });
});
app.post('/api/campaigns/:id/candidates/:candidate/contacts', async context => {
  const input = z.strictObject({ expected_revision: z.number().int().positive() }).parse(await context.req.json());
  const campaign = id.parse(context.req.param('id'));
  return json(context, await campaigns.findContacts(jobOwner(context.get('current'), campaign), campaign, sourceId.parse(context.req.param('candidate')), input.expected_revision));
});
app.get('/api/campaign-templates', async context => json(context, { templates: (await Promise.all(context.get('current').owners.map(owner => campaigns.templates(owner)))).flat() }));
app.post('/api/campaign-templates', async context => { const input = await context.req.json(); return json(context, { template: await campaigns.saveTemplate(jobOwner(context.get('current'), id.parse(input.campaign_id)), input) }); });
app.get('/api/campaign-templates/:id', async context => { const value = z.uuid().parse(context.req.param('id')); return json(context, { template: await campaigns.template(templateOwner(context.get('current'), value), value) }); });
app.post('/api/campaign-templates/:id/generate', async context => { const value = z.uuid().parse(context.req.param('id')); const current = context.get('current'); return json(context, { job: await campaigns.createFromTemplate(current.workspace.shop, value, await context.req.json(), catalogUnavailable, templateOwner(current, value)) }); });
app.post('/api/connections', async context => {
  const { platform } = connectionInput.parse(await context.req.json()), current = context.get('current'); browserAvailable(current);
  await browsers.closeShop(current.workspace.shop);
  return json(context, gateway.issue(current.workspace, current.user.id, platform));
});
app.post('/api/connections/close', async context => {
  const { platform } = connectionInput.parse(await context.req.json()), current = context.get('current'); browserAvailable(current);
  await browsers.closeShop(current.workspace.shop);
  const auth = await browsers.read(current.workspace, { method: 'checkCreatorAuthStatus', args: [platform] }, AbortSignal.any([context.req.raw.signal, AbortSignal.timeout(90000)]));
  return json(context, { saved: true, auth, check_error: null });
});
app.post('/api/connections/disconnect', async context => {
  const { platform } = connectionInput.parse(await context.req.json()), current = context.get('current'); browserAvailable(current);
  return json(context, await browsers.disconnect(current.workspace, platform, context.req.raw.signal));
});
app.get('/api/mail/status', async context => {
  const value = await mail.status();
  if (boundUser && value.paired && value.account_id !== boundUser) throw new CloudHttpError('access.account_changed', 409);
  return json(context, value);
});
app.post('/api/mail/pair', async context => json(context, await mail.pair()));
app.post('/api/mail/connect', async context => json(context, await mail.connect()));
app.get('/api/mail/batches', async context => json(context, { batches: await mail.batches() }));
app.post('/api/mail/prepare', async context => {
  const input = cloudMailDraft.parse(await context.req.json());
  const verified = input.selection ? await recommendationMailRecipients(data, library, jobOwner(context.get('current'), input.selection.campaign_id), input.selection) : [];
  const recipients = verifiedMailRecipients(input.recipients, verified);
  return json(context, { batch: await mail.prepare({ mailbox_ref_id: input.mailbox_ref_id, subject: input.subject, body: input.body, recipients }) });
});
app.post('/api/mail/send', async context => { const input = z.strictObject({ id: z.string().min(1), action: z.enum(['confirm', 'pause', 'resume', 'cancel']) }).parse(await context.req.json()); return json(context, { batch: await mail.control(input.id, input.action) }); });
app.post('/api/mail/readback', async context => { const input = z.strictObject({ id: z.string().min(1) }).parse(await context.req.json()); return json(context, { batch: await mail.readback(input.id) }); });
app.all('/api/privacy/*', () => { throw new CloudHttpError('cloud.local_shopify_required', 409); });
app.all('/api/*', context => json(context, { error: { code: 'cloud.route_not_found' } }, 404));
app.get('*', serveStatic({ root: webDirectory }));
app.onError((error, context) => {
  if (error instanceof HTTPException) return json(context, { error: { code: 'cloud.local_session_invalid' } }, error.status);
  if (error instanceof z.ZodError) return json(context, { error: { code: 'cloud.invalid_request' } }, 400);
  if (error instanceof GmailBulkInputError) return json(context, { error: { code: error.code } }, 400);
  if (error instanceof CloudHttpError) return json(context, { error: { code: error.message } }, error.status);
  if (error instanceof OpenCliError) return json(context, { error: { code: error.code } }, 502);
  console.error(JSON.stringify({ event: 'cloud.local_request_failed', name: error.name, stack: error.stack }));
  return json(context, { error: { code: 'cloud.local_request_failed' } }, 500);
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 50033 });
gateway.attach(server);
ownership.defer(async () => { await gateway.close(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
await once(server, 'listening');
await writeFile(resolve('.scratch/cloud-workbench-url.txt'), `${origin}/?session=${process.pid}#${token}\n`, { mode: 0o600 });
console.info(JSON.stringify({ event: 'cloud.local_workbench_ready', origin, pid: process.pid, productSource: 'manual', platforms: CLOUD_PLATFORMS, shopifyNetworkVerified: false }));
process.once('SIGINT', () => stopped.resolve()); process.once('SIGTERM', () => stopped.resolve());
await stopped.promise;
browsers.stopAcceptingWork();
