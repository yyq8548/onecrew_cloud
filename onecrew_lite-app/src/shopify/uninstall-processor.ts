import PQueue from "p-queue";
import { CloudHttpError } from "../cloud/http-error.ts";
import { ShopRuntimeRegistry } from "../cloud/shop-runtime-registry.ts";
import { ShopifyInstallationStore, type ShopifyWebhookReceipt, type VerifiedWebhookEnvelope } from "./installation-store.ts";
import type { ShopBrowserManager } from "../cloud/shop-browser-manager.ts";
import type { ShopifyPrivacyService } from "./privacy-service.ts";
import type { CloudMailStore } from "../cloud/mail-store.ts";

// 单写进程内串行排空，持久收件负责崩溃后的恢复。
export class ShopifyUninstallProcessor {
  readonly #store: ShopifyInstallationStore;
  readonly #runtimes: ShopRuntimeRegistry;
  readonly #queue = new PQueue({ concurrency: 1 });
  readonly #scheduled = new Set<string>();
  readonly #onFailure: (error: unknown) => void;
  readonly #browsers: ShopBrowserManager | undefined;
  readonly #privacy: ShopifyPrivacyService | undefined;
  readonly #mail: CloudMailStore | undefined;
  #failure: unknown;
  #closed = false;

  constructor(store: ShopifyInstallationStore, runtimes: ShopRuntimeRegistry, onFailure: (error: unknown) => void, browsers?: ShopBrowserManager, privacy?: ShopifyPrivacyService, mail?: CloudMailStore) {
    this.#store = store; this.#runtimes = runtimes; this.#onFailure = onFailure;
    this.#browsers = browsers;
    this.#privacy = privacy;
    this.#mail = mail;
  }

  assertHealthy(): void {
    if (this.#closed || this.#failure !== undefined) throw new CloudHttpError("cloud.uninstall_processor_unavailable", 503);
  }

  receiveVerifiedWebhook(event: VerifiedWebhookEnvelope): ShopifyWebhookReceipt {
    this.assertHealthy();
    const receipt = this.#store.receiveVerifiedWebhook(event);
    this.#schedule(receipt);
    return receipt;
  }

  #schedule(receipt: ShopifyWebhookReceipt): void {
    if ((receipt.topic !== "APP_UNINSTALLED" && !this.#privacy) || receipt.completed_at !== null || this.#scheduled.has(receipt.webhook_id)) return;
    // 即使前方有其他店铺等待排空，本店铺也立即取消准入和账户上下文。
    if (receipt.lifecycle_revision !== null) { this.#mail?.disableShop(receipt.shop); this.#runtimes.suspend(receipt.shop); this.#browsers?.suspend(receipt.shop); }
    this.#scheduled.add(receipt.webhook_id);
    void this.#queue.add(async () => {
      if (this.#failure !== undefined) throw new CloudHttpError("cloud.uninstall_processor_unavailable", 503);
      if (this.#store.webhookCompleted(receipt.webhook_id)) return;
      if (receipt.lifecycle_revision !== null) await this.#runtimes.remove(receipt.shop);
      if (receipt.topic === "APP_UNINSTALLED") {
        if (receipt.lifecycle_revision !== null && this.#store.workspace(receipt.shop)) await this.#browsers?.closeShop(receipt.shop);
      } else {
        await this.#privacy!.process(receipt);
      }
      this.#store.completeWebhook(receipt.webhook_id);
    }).then(() => { this.#scheduled.delete(receipt.webhook_id); }, error => {
      if (this.#failure === undefined) { this.#failure = error; this.#onFailure(error); }
    });
  }

  async recover(): Promise<void> {
    this.assertHealthy();
    let pending = this.#store.pendingWebhooks(100, this.#privacy ? undefined : "APP_UNINSTALLED");
    while (pending.length) {
      for (const receipt of pending) this.#schedule(receipt);
      await this.drain();
      pending = this.#store.pendingWebhooks(100, this.#privacy ? undefined : "APP_UNINSTALLED");
    }
  }

  async drain(): Promise<void> {
    await this.#queue.onIdle();
    if (this.#failure !== undefined) throw this.#failure;
  }

  async close(): Promise<void> { this.#closed = true; await this.drain(); }
}
