import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { listenCloudHttp } from "../src/cloud/http.ts";
import { ShopifyInstallationStore } from "../src/shopify/installation-store.ts";
import { ShopifyUninstallProcessor } from "../src/shopify/uninstall-processor.ts";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";

test("real cloud HTTP listener rejects unauthenticated store APIs and unsigned webhooks", async () => {
  const database = new DatabaseSync(":memory:");
  const key = randomBytes(32);
  const store = new ShopifyInstallationStore(database, key);
  const failures: unknown[] = [];
  const runtimes = new ShopRuntimeRegistry();
  const uninstalls = new ShopifyUninstallProcessor(store, runtimes, failure => { failures.push(failure); });
  const server = await listenCloudHttp({ installations: store, uninstalls, shopify: { apiKey: randomBytes(16).toString("hex"), apiSecretKey: randomBytes(32).toString("hex"), applicationUrl: "https://cloud.example.com" }, reportFailure: failure => failures.push(failure) }, 0);
  try {
    const health = await fetch(`${server.origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { service: "onecrew_cloud", status: "listening" });
    for (const [path, method] of [["/api/shopify/install", "POST"], ["/api/workspace?shop=other.myshopify.com", "GET"], ["/api/products", "GET"], ["/api/campaigns", "GET"], ["/api/campaigns/example", "GET"], ["/api/search", "POST"], ["/api/read", "POST"], ["/api/connections", "POST"], ["/api/connections/close", "POST"], ["/api/mail/status", "GET"], ["/api/mail/send", "POST"], ["/webhooks/shopify", "POST"]] as const) {
      const response = await fetch(`${server.origin}${path}`, { method });
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.ok(response.headers.get("x-request-id"));
    }
    const secret = randomBytes(32).toString("hex");
    for (const [path, method] of [["/api/campaigns", "POST"], ["/api/campaign-jobs", "GET"], ["/api/campaign-jobs/example", "GET"], ["/api/campaign-jobs/example/cancel", "POST"], ["/api/campaigns/example/approve", "POST"], ["/api/campaigns/example/start", "POST"], ["/api/campaigns/example/pause", "POST"], ["/api/campaigns/example/candidates/example/contacts", "POST"]] as const) assert.equal((await fetch(`${server.origin}${path}`, { method })).status, 401, path);
    for (const path of ["/api/library", "/api/library/table", "/api/library/table/creators"]) assert.equal((await fetch(`${server.origin}${path}`)).status, 401, path);
    for (const path of ["/api/campaigns/example/results", "/api/campaigns/example/hits/example/material?revision=1"]) assert.equal((await fetch(`${server.origin}${path}`)).status, 401, path);
    for (const [path, method] of [["/api/privacy/requests", "GET"], ["/api/privacy/requests/example/export", "GET"], ["/api/privacy/requests/example/delivered", "POST"]] as const) assert.equal((await fetch(`${server.origin}${path}`, { method })).status, 401, path);
    assert.equal((await fetch(`${server.origin}/api/connections/disconnect`, { method: "POST" })).status, 401);
    for (const path of ["pair", "connect", "disconnect", "prepare", "readback"]) assert.equal((await fetch(`${server.origin}/api/mail/${path}`, { method: "POST" })).status, 401);
    for (const path of ["recipients", "batches"]) assert.equal((await fetch(`${server.origin}/api/mail/${path}`)).status, 401);
    assert.equal((await fetch(`${server.origin}/mail/pairing/callback`)).status, 400);
    for (const [path, method] of [["/api/campaign-templates", "GET"], ["/api/campaign-templates", "POST"], ["/api/campaign-templates/example", "GET"], ["/api/campaign-templates/example/generate", "POST"]] as const) assert.equal((await fetch(`${server.origin}${path}`, { method })).status, 401, path);
    const invalid = await fetch(`${server.origin}/api/products`, { headers: { authorization: `Bearer ${secret}` } });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.text()).includes(secret), false);
    const foreign = await fetch(`${server.origin}/api/workspace`, { headers: { origin: "https://other.example.com" } });
    assert.equal(foreign.status, 403);
    const oversized = await fetch(`${server.origin}/webhooks/shopify`, { method: "POST", body: "x".repeat(1024 * 1024 + 1) });
    assert.equal(oversized.status, 413);
    assert.deepEqual(store.pendingWebhooks(), []);
    assert.deepEqual(failures, []);
  } finally { await server.close(); await uninstalls.close(); await runtimes.close(); store.close(); database.close(); key.fill(0); }
});
