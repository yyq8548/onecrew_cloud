import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "@shopify/shopify-api";
import test from "node:test";
import { openCloudStorage } from "../src/cloud/storage.ts";

test("snapshot publication checks store ownership and lifecycle and retains current and previous files", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-pointer-"));
  const storage = await openCloudStorage(root, true);
  try {
    const workspace = storage.installations.install(new Session({ id: "offline_storage-contract.myshopify.com", shop: "storage-contract.myshopify.com", state: "", isOnline: false, scope: "read_products", accessToken: randomBytes(32).toString("hex") }), 0);
    const owner = { shop: workspace.shop, tenant_id: workspace.tenant_id, base_id: workspace.base_id };
    const source = fileURLToPath(new URL("../package.json", import.meta.url));
    const snapshots: string[] = [];
    for (let index = 0; index < 3; index++) {
      const saved = await storage.browserSnapshots.save(owner, createReadStream(source), new AbortController().signal);
      snapshots.push(saved.id);
      const kept = storage.installations.recordBrowserSnapshot(owner, saved.id, 0);
      await storage.browserSnapshots.retain(owner, kept);
    }
    assert.equal(storage.installations.browserSnapshot(owner.shop), snapshots[2]);
    const [directory] = await readdir(join(root, "browser-snapshots"));
    assert.ok(directory);
    assert.deepEqual((await readdir(join(root, "browser-snapshots", directory))).sort(), snapshots.slice(1).map(id => `${id}.vault`).sort());
    assert.throws(() => storage.installations.recordBrowserSnapshot({ ...owner, base_id: owner.tenant_id }, snapshots[2]!, 0), /installation_changed/u);
    storage.installations.uninstall(owner.shop);
    assert.throws(() => storage.installations.recordBrowserSnapshot(owner, snapshots[2]!, 0), /installation_changed/u);
    assert.equal(storage.installations.browserSnapshot(owner.shop), snapshots[2]);
  } finally { await storage.close(); await rm(root, { recursive: true }); }
});
