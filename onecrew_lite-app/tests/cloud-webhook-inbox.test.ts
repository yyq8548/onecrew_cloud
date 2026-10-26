import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ShopifyInstallationStore, type VerifiedWebhookEnvelope } from "../src/shopify/installation-store.ts";

test("encrypted inbox deduplicates local storage inputs and persists uninstall revision before acknowledgement", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, "cloud-inbox-"));
  const path = join(directory, "cloud.sqlite");
  const key = randomBytes(32);
  const database = new DatabaseSync(path);
  const store = new ShopifyInstallationStore(database, key);
  // 直接验证本地存储事务，不表示收到过真实 Shopify 事件或通过其签名。
  const body = randomBytes(32).toString("hex");
  const event: VerifiedWebhookEnvelope = { webhookId: randomUUID(), shop: "storage-contract.myshopify.com", topic: "APP_UNINSTALLED", apiVersion: "2026-10", triggeredAt: new Date().toISOString(), body };
  try {
    const received = store.receiveVerifiedWebhook(event);
    assert.equal(store.lifecycleRevision(event.shop), 1);
    assert.equal(received.lifecycle_revision, 1);
    assert.deepEqual(store.receiveVerifiedWebhook(event), received);
    assert.equal(store.lifecycleRevision(event.shop), 1);
    assert.throws(() => store.receiveVerifiedWebhook({ ...event, body: `${body} changed` }), /webhook_conflict/u);
    assert.equal(store.pendingWebhooks().length, 1);
    const row = database.prepare("SELECT encrypted_body FROM shopify_webhook_inbox").get()!;
    assert.equal(Buffer.from(row.encrypted_body as Uint8Array).includes(Buffer.from(body)), false);
    store.close(); database.close();
    const reopened = new DatabaseSync(path);
    const restored = new ShopifyInstallationStore(reopened, key);
    try {
      assert.equal(restored.lifecycleRevision(event.shop), 1);
      assert.deepEqual(restored.pendingWebhooks(), [received]);
      const clear = restored.webhookBody(event.webhookId);
      try { assert.equal(clear.toString(), body); } finally { clear.fill(0); }
      restored.completeWebhook(event.webhookId);
      assert.deepEqual(restored.pendingWebhooks(), []);
    } finally { restored.close(); reopened.close(); }
  } finally { store.close(); if (database.isOpen) database.close(); key.fill(0); await rm(directory, { recursive: true }); }
});
