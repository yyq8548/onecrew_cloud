import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { startCloudApplication } from "../src/cloud/application.ts";

test("cloud application recovers persisted uninstall and privacy work before HTTP starts and releases storage on shutdown", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, "cloud-application-"));
  const failures: unknown[] = [];
  try {
    const initialized = await openCloudStorage(directory, true);
    const common = { shop: "storage-contract.myshopify.com", apiVersion: "2026-10", triggeredAt: null, body: randomBytes(32).toString("hex") };
    initialized.installations.receiveVerifiedWebhook({ ...common, webhookId: randomUUID(), topic: "APP_UNINSTALLED" });
    const privacyId = randomUUID();
    initialized.installations.receiveVerifiedWebhook({ ...common, webhookId: privacyId, topic: "CUSTOMERS_DATA_REQUEST", body: JSON.stringify({ shop_id: 1, shop_domain: common.shop, customer: { id: 1 }, data_request: { id: 1 }, orders_requested: [] }) });
    await initialized.close();
    const application = await startCloudApplication({ directory, port: 0, shopify: { apiKey: randomBytes(16).toString("hex"), apiSecretKey: randomBytes(32).toString("hex"), applicationUrl: "https://cloud.example.com" }, reportFailure: error => { failures.push(error); }, onUninstallFailure: error => { failures.push(error); }, onBackgroundFailure: error => { failures.push(error); } });
    try {
      const health = await fetch(`${application.origin}/healthz`);
      assert.equal(health.status, 200);
    } finally { await application.close(); }
    assert.equal(application.close(), application.close());
    const reopened = await openCloudStorage(directory);
    try {
      assert.deepEqual(reopened.installations.pendingWebhooks(), []);
      assert.equal(reopened.installations.privacyRequests(common.shop)[0]?.webhook_id, privacyId);
      assert.equal(reopened.installations.privacyRequests(common.shop)[0]?.delivered_at, null);
      assert.equal(reopened.installations.lifecycleRevision(common.shop), 1);
    } finally { await reopened.close(); }
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true }); }
});
