import { ShopifyInstallationStore, type ShopifyWebhookReceipt } from "./installation-store.ts";
import { ShopDataService } from "../cloud/shop-data.ts";
import { ShopLibraryService } from "../cloud/shop-library.ts";
import { ShopBrowserManager } from "../cloud/shop-browser-manager.ts";
import { CampaignJobStore } from "../cloud/campaign-jobs.ts";
import { CampaignTemplateStore } from "../cloud/campaign-templates.ts";
import { BrowserSnapshotStore } from "../cloud/browser-snapshot-store.ts";
import type { CloudMailStore } from "../cloud/mail-store.ts";
import type { InstanceLease } from "../service/instance-lock.ts";
import { AccountDatabases } from "../identity/account-databases.ts";

interface PrivacyServices {
  readonly installations: ShopifyInstallationStore;
  readonly data: ShopDataService;
  readonly library: ShopLibraryService;
  readonly jobs: CampaignJobStore;
  readonly templates: CampaignTemplateStore;
  readonly snapshots: BrowserSnapshotStore;
  readonly browsers?: ShopBrowserManager;
  readonly mail?: { readonly store: CloudMailStore; readonly lease: InstanceLease };
}

// 与卸载共用持久收件和串行队列；店铺停用后才排空并删除它拥有的数据。
export class ShopifyPrivacyService {
  readonly #services: PrivacyServices;
  constructor(services: PrivacyServices) { this.#services = services; }

  async process(receipt: ShopifyWebhookReceipt): Promise<void> {
    const { installations, data, library, jobs, templates, snapshots, browsers, mail } = this.#services;
    if (receipt.topic === "CUSTOMERS_DATA_REQUEST") { installations.prepareCustomerDataRequest(receipt); return; }
    if (receipt.topic === "CUSTOMERS_REDACT") { installations.redactCustomer(receipt); return; }
    if (receipt.topic !== "SHOP_REDACT") throw new Error("shopify.privacy_topic_invalid");
    if (receipt.lifecycle_revision === null) { installations.completeWebhook(receipt.webhook_id, true); return; }
    const workspace = installations.workspace(receipt.shop);
    if (workspace) {
      if (browsers) await browsers.removeShop(receipt.shop);
      else await snapshots.removeOwner({ shop: workspace.shop, tenant_id: workspace.tenant_id, base_id: workspace.base_id });
      await data.removeShopData(receipt.shop);
    }
    await library.removeShop(receipt.shop);
    if (mail) {
      for (const owner of mail.store.owners(receipt.shop)) await AccountDatabases.removeAccount(mail.lease, owner);
      mail.store.removeShop(receipt.shop);
    }
    jobs.removeShop(receipt.shop);
    templates.removeShop(receipt.shop);
    installations.redactShop(receipt);
  }
}
