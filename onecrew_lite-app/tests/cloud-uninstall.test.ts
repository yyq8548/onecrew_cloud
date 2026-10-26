import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Session } from "@shopify/shopify-api";
import test from "node:test";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";
import { ShopifyInstallationStore, type VerifiedWebhookEnvelope } from "../src/shopify/installation-store.ts";
import { ShopifyUninstallProcessor } from "../src/shopify/uninstall-processor.ts";
import type { VerifiedPrincipal } from "../src/identity/account-context.ts";

const principal = (shop: string): VerifiedPrincipal => ({ user: { id: "local-owner", email: "owner@example.com" }, tenantId: `tenant-${shop}`, baseId: `base-${shop}`, deviceId: `server-${shop}`, source: "access" });
const storedEvent = (shop: string): VerifiedWebhookEnvelope => ({ shop, webhookId: randomUUID(), topic: "APP_UNINSTALLED", apiVersion: "2026-10", triggeredAt: null, body: randomBytes(32).toString("hex") });

test("uninstall cancels only its shop, waits for real execution drain and blocks reinstall until completion", { timeout: 10000 }, async () => {
  const database = new DatabaseSync(":memory:");
  const key = randomBytes(32);
  const store = new ShopifyInstallationStore(database, key);
  const runtimes = new ShopRuntimeRegistry();
  const failures: unknown[] = [];
  const uninstalls = new ShopifyUninstallProcessor(store, runtimes, error => { failures.push(error); });
  const first = runtimes.resolve("first.myshopify.com", principal("first"));
  const second = runtimes.resolve("second.myshopify.com", principal("second"));
  const started = Promise.withResolvers<void>(), aborted = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const session = new Session({ id: "offline_first.myshopify.com", shop: first.shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" });
  store.install(session, 0);
  try {
    await first.supervisor.start(first.context, { campaign_id: "local-drain-test", expected_revision: 0, profile_ref: "local-execution" }, 0, async () => { first.accounts.assertCurrent(first.context); }, async owner => {
      owner.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      started.resolve();
      await aborted.promise;
      await release.promise;
      owner.change(status => { status.stage = "paused"; });
    });
    await started.promise;
    const event = storedEvent(first.shop);
    uninstalls.receiveVerifiedWebhook(event);
    assert.equal(first.context.signal.aborted, true);
    await aborted.promise;
    second.accounts.assertCurrent(second.context);
    assert.throws(() => runtimes.resolve(first.shop, principal("first")), /stopping/u);
    assert.equal(store.session(first.shop), null);
    assert.equal(store.pendingWebhooks().length, 1);
    assert.throws(() => store.install(session, store.lifecycleRevision(first.shop)), /uninstall_processing/u);
    const removal = runtimes.remove(first.shop);
    assert.equal(runtimes.remove(first.shop), removal);
    uninstalls.receiveVerifiedWebhook(event);
    assert.equal(store.lifecycleRevision(first.shop), 1);
    release.resolve();
    await uninstalls.drain();
    await removal;
    assert.deepEqual(store.pendingWebhooks(), []);
    assert.equal(store.install(session, store.lifecycleRevision(first.shop)).shop, first.shop);
    assert.deepEqual(failures, []);
    second.accounts.assertCurrent(second.context);
  } finally { release.resolve(); await uninstalls.close(); await runtimes.close(); store.close(); database.close(); key.fill(0); }
});

test("a real failed operation keeps uninstall pending and reports processor failure", async () => {
  const database = new DatabaseSync(":memory:");
  const key = randomBytes(32);
  const store = new ShopifyInstallationStore(database, key);
  const runtimes = new ShopRuntimeRegistry();
  const failures: unknown[] = [];
  const uninstalls = new ShopifyUninstallProcessor(store, runtimes, error => { failures.push(error); });
  const runtime = runtimes.resolve("first.myshopify.com", principal("first"));
  const session = new Session({ id: "offline_first.myshopify.com", shop: runtime.shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" });
  try {
    store.install(session, 0);
    await assert.rejects(runtime.supervisor.ownTask(runtime.context, async () => { store.install(session, 99); }), /installation_changed/u);
    uninstalls.receiveVerifiedWebhook(storedEvent(runtime.shop));
    await assert.rejects(uninstalls.drain(), /discovery_execution_failed/u);
    assert.equal(failures.length, 1);
    assert.equal(store.pendingWebhooks().length, 1);
    assert.throws(() => uninstalls.assertHealthy(), /processor_unavailable/u);
    assert.throws(() => runtimes.resolve(runtime.shop, principal("first")), /stopping/u);
    assert.throws(() => store.install(session, store.lifecycleRevision(runtime.shop)), /uninstall_processing/u);
  } finally {
    const closed = await Promise.allSettled([uninstalls.close(), runtimes.close()]);
    store.close(); database.close(); key.fill(0);
    assert.equal(closed.every(result => result.status === "rejected"), true);
  }
});

test("recovery handles uninstall receipts without marking privacy work complete", async () => {
  const database = new DatabaseSync(":memory:");
  const key = randomBytes(32);
  const store = new ShopifyInstallationStore(database, key);
  const runtimes = new ShopRuntimeRegistry();
  const failures: unknown[] = [];
  const uninstalls = new ShopifyUninstallProcessor(store, runtimes, error => { failures.push(error); });
  try {
    const privacy = { ...storedEvent("first.myshopify.com"), topic: "CUSTOMERS_REDACT" as const, body: JSON.stringify({ shop_id: 1, shop_domain: "first.myshopify.com", customer: { id: 1 }, orders_to_redact: [] }) };
    store.receiveVerifiedWebhook(privacy);
    store.receiveVerifiedWebhook(storedEvent("second.myshopify.com"));
    await uninstalls.recover();
    assert.deepEqual(store.pendingWebhooks().map(receipt => receipt.webhook_id), [privacy.webhookId]);
    assert.deepEqual(failures, []);
  } finally { await uninstalls.close(); await runtimes.close(); store.close(); database.close(); key.fill(0); }
});
