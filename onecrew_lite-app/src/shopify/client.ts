import "@shopify/shopify-api/adapters/web-api";
import { shopifyApi, ApiVersion, RequestedTokenType, LogSeverity, AuthScopes, type Session } from "@shopify/shopify-api";
import { z } from "zod";
import { shopDomainSchema } from "../cloud/shop-runtime-registry.ts";
import { CloudHttpError } from "../cloud/http-error.ts";
import { shopifyProductId, shopifyProductSnapshot } from "../cloud/campaign-jobs.ts";

const configSchema = z.strictObject({ apiKey: z.string().min(1), apiSecretKey: z.string().min(1), applicationUrl: z.url() });
export type ShopifyConfiguration = z.infer<typeof configSchema>;
const sessionClaims = z.object({ dest: z.url(), iss: z.url(), sub: z.string().min(1), exp: z.number().int(), nbf: z.number().int(), iat: z.number().int(), jti: z.string().min(1), sid: z.string().min(1) });
export interface VerifiedShopifySession { readonly shop: string; readonly userId: string; readonly sessionId: string; readonly issuedAt: number }

export function assertShopifyStoreOwner(session: Session): void {
  if (!session.isOnline || session.onlineAccessInfo?.associated_user.account_owner !== true) throw new CloudHttpError("shopify.privacy_owner_required", 403);
}

export function createShopifyClient(configuration: ShopifyConfiguration) {
  const config = configSchema.parse(configuration);
  const application = new URL(config.applicationUrl);
  if (application.protocol !== "https:" || application.username || application.password || application.search || application.hash || application.pathname !== "/") throw new Error("shopify.application_url_invalid");
  const apiVersion = ApiVersion.October26;
  const api = shopifyApi({ apiKey: config.apiKey, apiSecretKey: config.apiSecretKey, apiVersion, hostName: application.host, hostScheme: "https", isEmbeddedApp: true, scopes: ["read_products"], logger: { level: LogSeverity.Error } });

  async function authenticate(authorization: string | null): Promise<VerifiedShopifySession> {
    if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) throw new CloudHttpError("shopify.session_required", 401);
    // SDK 的 JWT 异常可能包含原 token；只向外暴露固定错误。
    const decoded = await api.session.decodeSessionToken(authorization.slice(7)).then(value => value, () => { throw new CloudHttpError("shopify.session_invalid", 401); });
    const validated = sessionClaims.safeParse(decoded);
    if (!validated.success) throw new CloudHttpError("shopify.session_invalid", 401);
    const claims = validated.data;
    const destination = new URL(claims.dest);
    const issuer = new URL(claims.iss);
    const shop = destination.hostname;
    if (!shopDomainSchema.safeParse(shop).success || destination.protocol !== "https:" || destination.host !== shop || destination.username || destination.password || destination.pathname !== "/" || destination.search || destination.hash || issuer.origin !== destination.origin || issuer.pathname !== "/admin" || issuer.search || issuer.hash || issuer.username || issuer.password) throw new CloudHttpError("shopify.session_destination_invalid", 401);
    return Object.freeze({ shop, userId: claims.sub, sessionId: claims.sid, issuedAt: claims.iat * 1000 });
  }

  return Object.freeze({
    apiVersion,
    authenticate,
    async authenticateDocument(url: URL): Promise<string> {
      const shop = shopDomainSchema.safeParse(url.searchParams.get("shop"));
      if (!shop.success || !(await api.utils.validateHmac(url.searchParams).then(value => value, () => false))) throw new CloudHttpError("shopify.document_invalid", 401);
      return shop.data;
    },
    async exchangeOfflineSession(authorization: string): Promise<Session> {
      const verified = await authenticate(authorization);
      const result = await api.auth.tokenExchange({ shop: verified.shop, sessionToken: authorization.slice(7), requestedTokenType: RequestedTokenType.OfflineAccessToken, expiring: true });
      if (result.session.shop !== verified.shop || result.session.isOnline || !result.session.accessToken) throw new Error("shopify.offline_session_invalid");
      return result.session;
    },
    async exchangeOnlineSession(authorization: string): Promise<Session> {
      const verified = await authenticate(authorization);
      const result = await api.auth.tokenExchange({ shop: verified.shop, sessionToken: authorization.slice(7), requestedTokenType: RequestedTokenType.OnlineAccessToken });
      const session = result.session;
      const user = session.onlineAccessInfo;
      if (session.shop !== verified.shop || !session.isOnline || !session.isActive("read_products") || !user || String(user.associated_user.id) !== verified.userId) throw new CloudHttpError("shopify.online_session_invalid", 401);
      if (!new AuthScopes(user.associated_user_scope).has("read_products")) throw new CloudHttpError("shopify.products_forbidden", 403);
      return session;
    },
    async validateWebhook(request: Request, rawBody: string) {
      const result = await api.webhooks.validate({ rawBody, rawRequest: request });
      if (!result.valid || !shopDomainSchema.safeParse(result.domain).success) throw new CloudHttpError("shopify.webhook_invalid", 401);
      return result;
    },
    async products(session: Session, first = 25, after: string | null = null) {
      shopDomainSchema.parse(session.shop);
      z.number().int().min(1).max(100).parse(first);
      const client = new api.clients.Graphql({ session });
      const result = await client.request(`query OneCrewProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          nodes { id title description onlineStoreUrl updatedAt }
          pageInfo { hasNextPage endCursor }
        }
      }`, { variables: { first, after } });
      if (result.errors || !result.data) throw new Error("shopify.products_failed");
      return result.data;
    },
    async product(session: Session, id: string) {
      shopDomainSchema.parse(session.shop); shopifyProductId.parse(id);
      const client = new api.clients.Graphql({ session });
      const result = await client.request(`query OneCrewProduct($id: ID!) {
        product(id: $id) { id title description onlineStoreUrl updatedAt }
      }`, { variables: { id } });
      if (result.errors || !result.data) throw new Error("shopify.product_failed");
      const parsed = z.object({ product: shopifyProductSnapshot.omit({ captured_at: true }).nullable() }).parse(result.data);
      if (!parsed.product) throw new CloudHttpError("shopify.product_missing", 404);
      return shopifyProductSnapshot.parse({ ...parsed.product, captured_at: Date.now() });
    },
  });
}
