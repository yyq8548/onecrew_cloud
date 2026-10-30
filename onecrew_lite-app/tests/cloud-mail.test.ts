import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CloudMailStore } from "../src/cloud/mail-store.ts";
import { GmailBulkInputError } from "../src/mail/gmail-bulk.ts";
import { GmailBulkRepository } from "../src/mail/gmail-bulk-repository.ts";
import { initializeNewCreatorDatabase } from "../src/storage/creator-schema.ts";

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
    assert.throws(() => store.begin(shop, member, 0), /revocation_incomplete/u);
    store.disconnect(shop, member);
    assert.equal(store.pendingPairings(shop, member).length, 1);
    assert.throws(() => store.removeShop(shop), /revocation_incomplete/u);
    store.forgetPairing(pending.id);
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

test("mail draft with an unknown mailbox fails as input error without creating send records", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-mail-input-")), path = join(root, "creator.sqlite");
  await initializeNewCreatorDatabase(path);
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
    const repository = new GmailBulkRepository(db);
    assert.throws(() => repository.create({ mailbox_ref_id: randomUUID(), subject: "", body: "", recipients: [] }), GmailBulkInputError);
    assert.deepEqual(repository.list(), []);
    assert.equal(repository.claim(), null);
  } finally { db.close(); await rm(root, { recursive: true }); }
});
