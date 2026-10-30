import { z } from "zod";
import { AccountContextService, type AccountContext, type VerifiedPrincipal } from "../identity/account-context.ts";
import { DiscoveryAdmissionGate } from "../discovery/admission-gate.ts";
import { DiscoveryExecutionSupervisor } from "../discovery/execution-supervisor.ts";
import { workspaceKeySchema } from "./workspaces.ts";

export const shopDomainSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u);
export interface ShopRuntime {
  readonly shop: string;
  readonly accounts: AccountContextService;
  readonly context: AccountContext;
  readonly admission: DiscoveryAdmissionGate;
  readonly supervisor: DiscoveryExecutionSupervisor;
  readonly resources: AsyncDisposableStack;
}

// 仅由已验证的安装与成员归属解析器调用；不直接接收浏览器提交的身份。
export class ShopRuntimeRegistry {
  readonly #shops = new Map<string, ShopRuntime>();
  readonly #closing = new Map<string, Promise<void>>();
  readonly #suspended = new Set<string>();
  #stopping = false;

  resolve(shop: string, principal: VerifiedPrincipal): ShopRuntime {
    workspaceKeySchema.parse(shop);
    if (principal.source === "shopify" && principal.shop !== shop) throw new Error("cloud.shop_owner_changed");
    if (this.#stopping || this.#suspended.has(shop) || this.#closing.has(shop)) throw new Error("cloud.shop_stopping");
    const existing = this.#shops.get(shop);
    if (existing) {
      const owner = existing.context.principal;
      if (owner.user.id !== principal.user.id || owner.tenantId !== principal.tenantId || owner.baseId !== principal.baseId || owner.deviceId !== principal.deviceId || owner.source !== principal.source) throw new Error("cloud.shop_owner_changed");
      existing.accounts.assertCurrent(existing.context);
      return existing;
    }
    for (const runtime of this.#shops.values()) {
      const owner = runtime.context.principal;
      if (owner.tenantId === principal.tenantId || owner.baseId === principal.baseId) throw new Error("cloud.shop_storage_shared");
    }
    const accounts = new AccountContextService();
    const context = accounts.activate(principal);
    const admission = new DiscoveryAdmissionGate(accounts);
    const supervisor = new DiscoveryExecutionSupervisor(accounts, admission);
    const resources = new AsyncDisposableStack();
    const runtime = Object.freeze({ shop, accounts, context, admission, supervisor, resources });
    this.#shops.set(shop, runtime);
    return runtime;
  }

  suspend(shop: string): void {
    workspaceKeySchema.parse(shop);
    this.#suspended.add(shop);
    const runtime = this.#shops.get(shop);
    if (!runtime) return;
    runtime.supervisor.stopAcceptingWork();
    runtime.accounts.logout();
  }

  remove(shop: string): Promise<void> {
    workspaceKeySchema.parse(shop);
    const closing = this.#closing.get(shop);
    if (closing) return closing;
    this.suspend(shop);
    const runtime = this.#shops.get(shop);
    if (!runtime) { this.#suspended.delete(shop); return Promise.resolve(); }
    // 排空失败时保留停止状态，避免同一归属被重新打开并掩盖故障。
    const draining = (async () => {
      await using cleanup = new AsyncDisposableStack();
      cleanup.defer(() => runtime.resources.disposeAsync());
      await runtime.supervisor.close();
    })().then(() => {
      this.#shops.delete(shop);
      this.#closing.delete(shop);
      this.#suspended.delete(shop);
    });
    this.#closing.set(shop, draining);
    return draining;
  }

  async close(): Promise<void> {
    this.#stopping = true;
    const results = await Promise.allSettled([...this.#shops.keys()].map(shop => this.remove(shop)));
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason as unknown);
    if (errors.length) throw new AggregateError(errors, "cloud.shutdown_failed");
  }
}
