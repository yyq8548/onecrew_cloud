import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { ShopifyInstallationStore, type VerifiedWebhookEnvelope } from "../src/shopify/installation-store.ts";
import { parseApplicationJson, stringifyApplicationJson } from "../src/contracts/application-json.ts";
import { assertShopifyStoreOwner } from "../src/shopify/client.ts";

test("customer requests export their actual received data, clear personal fields and redact only the matching store", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, "customer-privacy-")), path = join(directory, "cloud.sqlite");
  const database = new DatabaseSync(path), key = randomBytes(32), store = new ShopifyInstallationStore(database, key);
  database.exec("PRAGMA journal_mode=WAL");
  const first = "first.myshopify.com", second = "second.myshopify.com";
  // 手工请求只验证真实本地存储，不表示 Shopify 发送过事件或已通过平台验签。
  const customer = { id: 9007199254740993n, email: "privacy-local@example.invalid", phone: "local-phone" };
  const request = (shop: string): VerifiedWebhookEnvelope => ({ webhookId: randomUUID(), shop, topic: "CUSTOMERS_DATA_REQUEST", apiVersion: "2026-10", triggeredAt: null, body: stringifyApplicationJson({ shop_id: 1, shop_domain: shop, customer, orders_requested: [], data_request: { id: 9 } }) });
  try {
    const input = request(first), received = store.receiveVerifiedWebhook(input);
    store.prepareCustomerDataRequest(received);
    const other = store.receiveVerifiedWebhook(request(second));
    store.prepareCustomerDataRequest(other);
    assert.equal(store.webhookCompleted(received.webhook_id), true);
    assert.throws(() => store.webhookBody(received.webhook_id), /body_erased/u);
    assert.equal(store.privacyRequests(first)[0]?.delivered_at, null);
    const clear = store.customerDataExport(first, received.webhook_id);
    try {
      const report = parseApplicationJson(clear) as { customer: { id: string; email: string }; stored_customer_records: unknown[]; stored_order_records: unknown[] };
      assert.equal(report.customer.id, "9007199254740993");
      assert.equal(report.customer.email, customer.email);
      assert.deepEqual(report.stored_customer_records, []);
      assert.deepEqual(report.stored_order_records, []);
    } finally { clear.fill(0); }
    assert.throws(() => store.customerDataExport(second, received.webhook_id), /privacy_request_missing/u);
    assert.throws(() => store.confirmCustomerDataDelivery(second, received.webhook_id), /privacy_request_missing/u);
    store.confirmCustomerDataDelivery(first, received.webhook_id);
    store.confirmCustomerDataDelivery(first, received.webhook_id);
    assert.notEqual(store.privacyRequests(first)[0]?.delivered_at, null);
    assert.throws(() => store.customerDataExport(first, received.webhook_id), /privacy_request_missing/u);
    assert.equal((database.prepare("SELECT length(encrypted_report) AS size FROM shopify_privacy_requests WHERE webhook_id=?").get(received.webhook_id))?.size, 0);
    const next = store.receiveVerifiedWebhook(request(first));
    store.prepareCustomerDataRequest(next);
    const redaction = store.receiveVerifiedWebhook({ ...request(first), topic: "CUSTOMERS_REDACT", body: stringifyApplicationJson({ shop_id: 1, shop_domain: first, customer: { id: customer.id }, orders_to_redact: [] }) });
    store.redactCustomer(redaction);
    assert.deepEqual(store.privacyRequests(first), []);
    assert.equal(store.privacyRequests(second).length, 1);
    assert.throws(() => store.webhookBody(redaction.webhook_id), /body_erased/u);
    assert.deepEqual(store.pendingWebhooks(), []);
    assert.equal(store.receiveVerifiedWebhook(input).completed_at !== null, true);
    assert.throws(() => store.receiveVerifiedWebhook({ ...input, webhookId: randomUUID(), shop: second }), /shop_mismatch/u);
    assert.throws(() => assertShopifyStoreOwner(new Session({ id: "offline_local", shop: first, state: "", isOnline: false })), /privacy_owner_required/u);
    store.close(); database.close();
    const reopened = new DatabaseSync(path), restored = new ShopifyInstallationStore(reopened, key);
    try {
      assert.deepEqual(restored.privacyRequests(first), []);
      assert.equal(restored.privacyRequests(second).length, 1);
      assert.equal(restored.webhookCompleted(redaction.webhook_id), true);
    } finally { restored.close(); reopened.close(); }
  } finally { store.close(); if (database.isOpen) database.close(); key.fill(0); await rm(directory, { recursive: true }); }
});
