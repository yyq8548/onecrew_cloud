import { AccountDatabases } from "../identity/account-databases.ts";
import type { DiscoveryRepository } from "../discovery/repository.ts";
import type { InstanceLease } from "../service/instance-lock.ts";
import { ShopifyInstallationStore } from "../shopify/installation-store.ts";
import { CloudHttpError } from "./http-error.ts";
import { ShopRuntimeRegistry, type ShopRuntime } from "./shop-runtime-registry.ts";
import { discoveryCandidatePageInput } from "../discovery/candidate-repository.ts";

export interface ShopData {
  readonly runtime: ShopRuntime;
  readonly databases: AccountDatabases;
  readonly assertCurrent: () => void;
}

// Shopify 成员由 HTTP 层验证；数据库归属固定为店铺，不伪造 OneCrew Access 用户。
export class ShopDataService {
  readonly #lease: InstanceLease;
  readonly #installations: ShopifyInstallationStore;
  readonly #runtimes: ShopRuntimeRegistry;
  readonly #data = new WeakMap<ShopRuntime, Promise<ShopData>>();

  constructor(lease: InstanceLease, installations: ShopifyInstallationStore, runtimes: ShopRuntimeRegistry) {
    lease.assertOwned();
    this.#lease = lease;
    this.#installations = installations;
    this.#runtimes = runtimes;
  }

  async resolve(shop: string): Promise<ShopData> {
    const workspace = this.#installations.workspace(shop);
    if (!workspace || workspace.uninstalled_at !== null) throw new CloudHttpError("shopify.installation_required", 409);
    const revision = this.#installations.lifecycleRevision(shop);
    const runtime = this.#runtimes.resolve(shop, {
      user: { id: workspace.tenant_id }, tenantId: workspace.tenant_id, baseId: workspace.base_id,
      deviceId: `shopify:${shop}`, source: "shopify", shop,
    });
    const assertCurrent = () => {
      this.#lease.assertOwned();
      runtime.accounts.assertCurrent(runtime.context);
      const current = this.#installations.workspace(shop);
      if (!current || current.uninstalled_at !== null || current.tenant_id !== workspace.tenant_id || current.base_id !== workspace.base_id || this.#installations.lifecycleRevision(shop) !== revision) throw new CloudHttpError("shopify.installation_changed", 409);
    };
    let ready = this.#data.get(runtime);
    if (!ready) {
      const databases = new AccountDatabases(this.#lease, runtime.accounts);
      ready = databases.ensureNewAccount(runtime.context).then(() => {
        assertCurrent();
        return Object.freeze({ runtime, databases, assertCurrent });
      });
      this.#data.set(runtime, ready);
      // 初始化错误返回调用方；清理仍须等待初始化结束后关闭真实数据库。
      const initializing = ready;
      runtime.resources.defer(async () => { await Promise.allSettled([initializing]); databases.close(); });
    }
    const data = await ready;
    data.assertCurrent();
    assertCurrent();
    return data;
  }

  async #read<T>(shop: string, read: (repository: DiscoveryRepository) => T): Promise<T> {
    const data = await this.resolve(shop);
    const owned = await data.databases.discoveryResolver().resolve(data.runtime.context);
    data.assertCurrent();
    owned.assertOwned();
    return read(owned.repository);
  }

  recentCampaigns(shop: string) { return this.#read(shop, repository => repository.recentPlans()); }

  campaign(shop: string, id: string) {
    return this.#read(shop, repository => {
      const campaign = repository.findPlan(id);
      if (!campaign) throw new CloudHttpError("discovery.plan_missing", 404);
      return campaign;
    });
  }

  results(shop: string, id: string, afterHit: string | null, afterCandidate: string | null) {
    return this.#read(shop, repository => {
      const campaign = repository.findPlan(id);
      if (!campaign) throw new CloudHttpError("discovery.plan_missing", 404);
      const hits = repository.listSearchHits(discoveryCandidatePageInput.parse({ campaign_id: id, after_id: afterHit, limit: 100 }));
      const candidates = repository.listCandidates(discoveryCandidatePageInput.parse({ campaign_id: id, after_id: afterCandidate, limit: 100 }));
      return { campaign, counts: repository.countCandidates(id), hits, candidates };
    });
  }

  async reviewMaterial(shop: string, id: string, hit: string, revision: number) {
    return this.#read(shop, repository => {
      const campaign = repository.findPlan(id);
      if (!campaign) throw new CloudHttpError("discovery.plan_missing", 404);
      if (campaign.revision !== revision) throw new CloudHttpError("discovery.revision_changed", 409);
      return repository.prepareReviewMaterial(id, revision, hit);
    }).then(value => value, error => {
      if (error instanceof Error && error.message === "review_source_unavailable") throw new CloudHttpError("discovery.review_material_unavailable", 409);
      throw error;
    });
  }
  async removeShopData(shop: string): Promise<void> {
    const workspace = this.#installations.workspace(shop);
    if (!workspace || workspace.uninstalled_at === null) throw new Error("cloud.data_redaction_requires_uninstall");
    const revision = this.#installations.lifecycleRevision(shop);
    await this.#runtimes.remove(shop);
    this.#lease.assertOwned();
    if (this.#installations.lifecycleRevision(shop) !== revision) throw new CloudHttpError("shopify.installation_changed", 409);
    await AccountDatabases.removeAccount(this.#lease, { accountId: workspace.tenant_id, tenantId: workspace.tenant_id, baseId: workspace.base_id });
  }
}
