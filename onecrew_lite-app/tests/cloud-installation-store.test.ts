import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Session } from "@shopify/shopify-api";
import test from "node:test";
import { ShopifyInstallationStore } from "../src/shopify/installation-store.ts";

test("offline session storage survives reopen, encrypts tokens and separates store ownership", async () => {
  const root = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "shopify-store-"));
  const path = join(directory, "cloud.sqlite");
  const key = randomBytes(32), token = randomBytes(32).toString("hex");
  const session = new Session({ id: "offline_first.myshopify.com", shop: "first.myshopify.com", state: "", isOnline: false, accessToken: token, scope: "read_products" });
  const database = new DatabaseSync(path);
  const store = new ShopifyInstallationStore(database, key);
  try {
    const first = store.install(session, 0);
    const second = store.install(new Session({ ...session.toObject(), id: "offline_second.myshopify.com", shop: "second.myshopify.com" }), 0);
    assert.notEqual(first.tenant_id, second.tenant_id);
    assert.notEqual(first.base_id, second.base_id);
    const row = database.prepare("SELECT encrypted_session FROM shopify_offline_sessions WHERE shop=?").get(session.shop)!;
    assert.equal(Buffer.from(row.encrypted_session as Uint8Array).includes(Buffer.from(token)), false);
    assert.equal(store.session("unknown.myshopify.com"), null);
    store.close(); database.close();
    const reopened = new DatabaseSync(path);
    const restored = new ShopifyInstallationStore(reopened, key);
    try {
      assert.equal(restored.session(session.shop)?.accessToken, token);
      assert.equal(restored.workspace(session.shop)?.tenant_id, first.tenant_id);
      restored.uninstall(session.shop);
      assert.equal(restored.session(session.shop), null);
      assert.notEqual(restored.session("second.myshopify.com"), null);
      assert.throws(() => restored.install(session, 0), /installation_changed/u);
      assert.equal(restored.install(session, restored.lifecycleRevision(session.shop)).tenant_id, first.tenant_id);
    } finally { restored.close(); reopened.close(); }
  } finally { store.close(); if (database.isOpen) database.close(); key.fill(0); await rm(directory, { recursive: true }); }
});
