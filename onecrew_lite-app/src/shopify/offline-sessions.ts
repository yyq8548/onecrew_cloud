import type { Session } from "@shopify/shopify-api";
import { CloudHttpError } from "../cloud/http-error.ts";
import type { createShopifyClient } from "./client.ts";
import type { ShopifyInstallationStore, ShopifyWorkspace } from "./installation-store.ts";

export class ShopifyOfflineSessions {
  readonly #store: ShopifyInstallationStore;
  readonly #client: ReturnType<typeof createShopifyClient>;
  readonly #pending = new Map<string, Promise<ShopifyWorkspace>>();

  constructor(store: ShopifyInstallationStore, client: ReturnType<typeof createShopifyClient>) { this.#store = store; this.#client = client; }

  ensure(shop: string, reauthorize?: () => Promise<Session>, authorizedAt = Date.now()): Promise<ShopifyWorkspace> {
    const pending = this.#pending.get(shop);
    if (pending) return pending;
    // 同店的刷新和重新交换串行，避免彼此作废刚取得的令牌。
    const request = this.#ensure(shop, reauthorize, authorizedAt).finally(() => { this.#pending.delete(shop); });
    this.#pending.set(shop, request);
    return request;
  }

  async #ensure(shop: string, reauthorize: (() => Promise<Session>) | undefined, authorizedAt: number): Promise<ShopifyWorkspace> {
    const revision = this.#store.lifecycleRevision(shop);
    const current = this.#store.session(shop);
    const now = Date.now();
    if (current?.expires && current.expires.getTime() > now + 60_000) return this.#store.workspace(shop)!;
    let session = current?.refreshToken && current.refreshTokenExpires && current.refreshTokenExpires.getTime() > now
      ? await this.#client.refreshOfflineSession(current) : null;
    if (!session) {
      if (!reauthorize) throw new CloudHttpError("shopify.reauthorization_required", 401);
      session = await reauthorize();
    }
    return this.#store.install(session, revision, authorizedAt);
  }
}
