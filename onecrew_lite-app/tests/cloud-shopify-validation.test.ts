import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { createShopifyClient } from "../src/shopify/client.ts";

test("Shopify official verifier rejects absent and unsigned browser sessions", async () => {
  const client = createShopifyClient({ apiKey: randomBytes(16).toString("hex"), apiSecretKey: randomBytes(32).toString("hex"), applicationUrl: "https://cloud.example.com" });
  await assert.rejects(client.authenticate(null), /session_required/u);
  await assert.rejects(client.authenticate("Bearer invalid-session"), error => error instanceof Error && error.message === "shopify.session_invalid");
  const body = "{}";
  await assert.rejects(client.validateWebhook(new Request("https://cloud.example.com/webhooks", { method: "POST", body }), body), /webhook_invalid/u);
});

test("Shopify application URL must be a dedicated HTTPS origin", () => {
  assert.throws(() => createShopifyClient({ apiKey: "app", apiSecretKey: "secret", applicationUrl: "http://cloud.example.com" }), /application_url_invalid/u);
  assert.throws(() => createShopifyClient({ apiKey: "app", apiSecretKey: "secret", applicationUrl: "https://cloud.example.com/path" }), /application_url_invalid/u);
});
