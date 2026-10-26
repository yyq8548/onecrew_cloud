import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CloudMailStore } from "../src/cloud/mail-store.ts";

test("mail pairing persists encrypted PKCE, consumes once and invalidates replaced or disconnected flows", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-mail-")), path = join(root, "mail.sqlite"), key = randomBytes(32);
  const shop = "owala.myshopify.com", member = String(process.getuid?.() ?? process.pid);
  let db = new DatabaseSync(path), store = new CloudMailStore(db, key);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
  try {
    const first = store.begin(shop, member, 0), replacement = store.begin(shop, member, 0);
    assert.throws(() => store.consume(first.state), /pairing_invalid/u);
    store.close(); db.close();
    db = new DatabaseSync(path); store = new CloudMailStore(db, key);
    const pending = store.consume(replacement.state);
    assert.equal(createHash("sha256").update(pending.verifier).digest("base64url"), replacement.challenge);
    assert.equal(pending.shop, shop); assert.equal(pending.member, member);
    assert.equal(store.load(shop, member), null);
    assert.throws(() => store.consume(replacement.state), /pairing_invalid/u);
    assert.equal((await readFile(path)).includes(Buffer.from(pending.bearer)), false);
    assert.equal((await readFile(path)).includes(Buffer.from(pending.verifier)), false);
    const disconnected = store.begin(shop, member, 0);
    store.disconnect(shop, member);
    assert.throws(() => store.consume(disconnected.state), /pairing_invalid/u);
    const expired = store.begin(shop, member, 0);
    db.prepare("UPDATE cloud_mail_pairings SET expires=0").run();
    assert.throws(() => store.consume(expired.state), /pairing_invalid/u);
    const uninstalled = store.begin(shop, member, 0);
    store.disableShop(shop);
    assert.throws(() => store.consume(uninstalled.state), /pairing_invalid/u);
    assert.deepEqual(store.owners(shop), []);
  } finally { store.close(); db.close(); key.fill(0); await rm(root, { recursive: true }); }
});
