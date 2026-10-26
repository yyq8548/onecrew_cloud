import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { Session } from "@shopify/shopify-api";
import { DatabaseSync } from "node:sqlite";

test("session cleanup can discard every previous encrypted generation and its previous pointer", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-snapshot-discard-"));
  const storage = await openCloudStorage(root, true);
  const source = fileURLToPath(new URL("../package.json", import.meta.url)), signal = new AbortController().signal;
  try {
    const workspace = storage.installations.install(new Session({ id: "offline_storage-contract.myshopify.com", shop: "storage-contract.myshopify.com", state: "", isOnline: false, accessToken: randomUUID(), scope: "read_products" }), 0);
    const owner = { shop: workspace.shop, tenant_id: workspace.tenant_id, base_id: workspace.base_id };
    const generations: string[] = [];
    for (let index = 0; index < 3; index++) {
      const saved = await storage.browserSnapshots.save(owner, createReadStream(source), signal);
      generations.push(saved.id);
      const kept = storage.installations.recordBrowserSnapshot(owner, saved.id, 0, index === 2);
      assert.equal(kept.length, index === 1 ? 2 : 1);
      await storage.browserSnapshots.retain(owner, kept);
    }
    const metadata = new DatabaseSync(join(root, "cloud.sqlite"), { readOnly: true });
    assert.equal(metadata.prepare("SELECT previous_snapshot_id FROM shopify_browser_snapshots WHERE shop=?").get(owner.shop)?.previous_snapshot_id, null);
    metadata.close();
    for (const id of generations.slice(0, 2)) await assert.rejects(storage.browserSnapshots.restoreTo(owner, id, new Writable({ write(_chunk, _encoding, done) { done(); } }), signal), /ENOENT/u);
    const digest = createHash("sha256");
    await storage.browserSnapshots.restoreTo(owner, generations[2]!, new Writable({ write(chunk, _encoding, done) { digest.update(chunk); done(); } }), signal);
    assert.equal(digest.digest("hex"), createHash("sha256").update(await readFile(source)).digest("hex"));
  } finally { await storage.close(); await rm(root, { recursive: true }); }
});

test("snapshot storage restores real file bytes after restart and authenticates before releasing plaintext", { timeout: 10000 }, async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-snapshot-"));
  const source = fileURLToPath(new URL("../package.json", import.meta.url));
  const owner = { shop: "storage-contract.myshopify.com", tenant_id: randomUUID(), base_id: randomUUID() };
  const signal = new AbortController().signal;
  try {
    const storage = await openCloudStorage(root, true);
    const saved = await storage.browserSnapshots.save(owner, createReadStream(source), signal);
    assert.equal(saved.encryptedBytes, (await readFile(source)).length + 28);
    await storage.close();
    const reopened = await openCloudStorage(root);
    try {
      const digest = createHash("sha256");
      const output = new Writable({ write(chunk, _encoding, done) { digest.update(chunk); done(); } });
      await reopened.browserSnapshots.restoreTo(owner, saved.id, output, signal);
      assert.equal(digest.digest("hex"), createHash("sha256").update(await readFile(source)).digest("hex"));
      let leaked = 0;
      const rejectOutput = () => new Writable({ write(chunk, _encoding, done) { leaked += chunk.length; done(); } });
      const [directory] = await readdir(join(root, "browser-snapshots"));
      assert.ok(directory);
      await assert.rejects(reopened.browserSnapshots.restoreTo({ ...owner, tenant_id: randomUUID() }, saved.id, rejectOutput(), signal));
      const path = join(root, "browser-snapshots", directory, `${saved.id}.vault`);
      const encrypted = await readFile(path);
      assert.equal(encrypted.includes(await readFile(source)), false);
      encrypted[12] = encrypted[12]! ^ 1;
      await chmod(path, 0o600); await writeFile(path, encrypted); await chmod(path, 0o400);
      await assert.rejects(reopened.browserSnapshots.restoreTo(owner, saved.id, rejectOutput(), signal));
      assert.equal(leaked, 0);
      const cancelled = new AbortController();
      cancelled.abort(new Error("local-cancel"));
      await assert.rejects(reopened.browserSnapshots.save(owner, createReadStream(source), cancelled.signal), /local-cancel/u);
      assert.deepEqual((await readdir(join(root, "browser-snapshots", directory))).filter(name => name.endsWith(".partial")), []);
    } finally { await reopened.close(); }
  } finally { await rm(root, { recursive: true }); }
});
