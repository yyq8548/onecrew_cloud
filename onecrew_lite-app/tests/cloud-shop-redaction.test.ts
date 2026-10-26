import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";
import { ShopDataService } from "../src/cloud/shop-data.ts";

test("real store databases and encrypted snapshot generations can be removed without affecting another store", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "shop-redaction-")), directory = join(root, "private");
  const storage = await openCloudStorage(directory, true), runtimes = new ShopRuntimeRegistry();
  try {
    const data = new ShopDataService(storage.lease, storage.installations, runtimes);
    const workspaces = ["first.myshopify.com", "second.myshopify.com"].map(shop => storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" }), 0));
    const first = workspaces[0]!, second = workspaces[1]!;
    const firstOwner = { shop: first.shop, tenant_id: first.tenant_id, base_id: first.base_id };
    const secondOwner = { shop: second.shop, tenant_id: second.tenant_id, base_id: second.base_id };
    const owner = await data.resolve(first.shop), other = await data.resolve(second.shop);
    const account = await owner.databases.accountDirectory(owner.runtime.context);
    const repository = await owner.databases.discoveryResolver().resolve(owner.runtime.context);
    const ownerKey = createHash("sha256").update(JSON.stringify([first.shop, first.tenant_id, first.base_id])).digest("hex");
    const snapshots = storage.browserSnapshots;
    const firstSnapshot = await snapshots.save(firstOwner, Readable.from([Buffer.from("手工快照验收标记一")]), new AbortController().signal);
    await snapshots.save(firstOwner, Readable.from([Buffer.from("手工快照验收标记二")]), new AbortController().signal);
    const preserved = await snapshots.save(secondOwner, Readable.from([Buffer.from("另一个店铺的验收标记")]), new AbortController().signal);
    await assert.rejects(data.removeShopData(first.shop), /requires_uninstall/u);
    storage.installations.uninstall(first.shop);
    await data.removeShopData(first.shop);
    assert.throws(repository.assertOwned, /closed/u);
    await assert.rejects(lstat(account.directory), { code: "ENOENT" });
    await data.removeShopData(first.shop);
    await snapshots.removeOwner(firstOwner);
    await snapshots.removeOwner(firstOwner);
    await assert.rejects(lstat(join(directory, "browser-snapshots", ownerKey)), { code: "ENOENT" });
    await assert.rejects(snapshots.restoreTo(firstOwner, firstSnapshot.id, new Writable({ write(_chunk, _encoding, done) { done(); } }), new AbortController().signal), /ENOENT/u);
    const chunks: Buffer[] = [];
    await snapshots.restoreTo(secondOwner, preserved.id, new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } }), new AbortController().signal);
    assert.equal(Buffer.concat(chunks).toString(), "另一个店铺的验收标记");
    other.assertCurrent();
    assert.deepEqual(await data.recentCampaigns(second.shop), []);
  } finally { await runtimes.close(); await storage.close(); await rm(root, { recursive: true }); }
});
