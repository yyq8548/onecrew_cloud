import { createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseStoredJson } from "../contracts/stored-json.ts";
import { accessCredentialMetadataSchema, StoredAccessCredential } from "../identity/legacy-access-credential.ts";
import type { VerifiedMigrationCredential } from "../identity/access-verification.ts";
import { encryptOwnerVaultSecret } from "../platforms/browser/owner-vault-store.ts";
import { decryptVaultEnvelope } from "../storage/vault-reader.ts";
import { CloudHttpError } from "./http-error.ts";

const pendingSchema = z.strictObject({ id: z.string(), shop: z.string(), member: z.string(), revision: z.number().int(), expires: z.number(),
  verifier: z.string(), idempotency: z.string(), installationId: z.uuid(), credentialId: z.uuid(), bearer: z.string() });
const bindingSchema = z.strictObject({ id: z.uuid(), shop: z.string(), member: z.string(), tenantId: z.uuid(), baseId: z.uuid(), revision: z.number().int(),
  metadata: accessCredentialMetadataSchema, email: z.email(), bearer: z.string() });
export type CloudMailBinding = z.infer<typeof bindingSchema>;

// 店铺成员映射与凭据分开于网页；沿用 Cloud 主密钥和原 Vault 加密格式。
export class CloudMailStore {
  readonly #db: DatabaseSync;
  readonly #key: Buffer;
  constructor(db: DatabaseSync, key: Uint8Array) {
    this.#db = db; this.#key = Buffer.from(key);
    db.exec(`CREATE TABLE IF NOT EXISTS cloud_mail_pairings (
      state_hash TEXT PRIMARY KEY, shop TEXT NOT NULL, member TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, secret BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cloud_mail_bindings (
      id TEXT PRIMARY KEY, shop TEXT NOT NULL, member TEXT NOT NULL, access_user TEXT NOT NULL, tenant_id TEXT NOT NULL, base_id TEXT NOT NULL,
      active INTEGER NOT NULL, secret BLOB, UNIQUE(shop,member,access_user)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cloud_mail_member_active ON cloud_mail_bindings(shop,member) WHERE active=1;`);
  }
  #cryptKey(id: string) { return Buffer.from(hkdfSync("sha256", this.#key, "onecrew-cloud-mail-v1", id, 32)); }
  #seal(id: string, value: unknown): Buffer {
    const key = this.#cryptKey(id), clear = Buffer.from(JSON.stringify(value));
    try { return encryptOwnerVaultSecret(key, clear); } finally { key.fill(0); clear.fill(0); }
  }
  #open(id: string, bytes: Uint8Array): unknown {
    const key = this.#cryptKey(id);
    try {
      const clear = decryptVaultEnvelope(key, bytes);
      try { return parseStoredJson(new TextDecoder("utf-8", { fatal: true }).decode(clear), true); } finally { clear.fill(0); }
    } finally { key.fill(0); }
  }
  begin(shop: string, member: string, revision: number) {
    if (this.load(shop, member)) throw new CloudHttpError("cloud.mail_already_bound", 409);
    const state = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(state).digest("hex"), credentialId = randomUUID();
    const pending = { id: hash, shop, member, revision, expires: Date.now() + 300_000, verifier: randomBytes(32).toString("base64url"), idempotency: randomBytes(32).toString("base64url"),
      installationId: randomUUID(), credentialId, bearer: `${credentialId}_${randomBytes(32).toString("base64url")}` };
    this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE expires<=? OR (shop=? AND member=?)").run(Date.now(), shop, member);
    this.#db.prepare("INSERT INTO cloud_mail_pairings(state_hash,shop,member,expires,secret) VALUES (?,?,?,?,?)").run(hash, shop, member, pending.expires, this.#seal(hash, pending));
    return { state, challenge: createHash("sha256").update(pending.verifier).digest("base64url") };
  }
  consume(state: string) {
    const hash = createHash("sha256").update(state).digest("hex");
    const row = this.#db.prepare("UPDATE cloud_mail_pairings SET consumed=1 WHERE state_hash=? AND consumed=0 AND expires>? RETURNING secret").get(hash, Date.now());
    if (!row || !(row.secret instanceof Uint8Array)) throw new CloudHttpError("cloud.mail_pairing_invalid", 400);
    return pendingSchema.parse(this.#open(hash, row.secret));
  }
  bind(pending: z.infer<typeof pendingSchema>, tenantId: string, proof: VerifiedMigrationCredential): void {
    proof.assertFresh();
    if (!this.#db.prepare("SELECT 1 FROM cloud_mail_pairings WHERE state_hash=? AND shop=? AND member=? AND consumed=1").get(pending.id, pending.shop, pending.member)) throw new CloudHttpError("cloud.mail_pairing_invalid", 409);
    const prior = this.#db.prepare("SELECT id,base_id FROM cloud_mail_bindings WHERE shop=? AND member=? AND access_user=?").get(pending.shop, pending.member, proof.user.id);
    const id = prior ? String(prior.id) : randomUUID(), baseId = prior ? String(prior.base_id) : randomUUID();
    const binding: CloudMailBinding = { id, shop: pending.shop, member: pending.member, tenantId, baseId, revision: pending.revision,
      metadata: { ...proof.metadata }, email: proof.user.email, bearer: proof.exposeBearer() };
    this.#db.prepare(`INSERT INTO cloud_mail_bindings VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(shop,member,access_user)
      DO UPDATE SET active=1,tenant_id=excluded.tenant_id,secret=excluded.secret`).run(id, pending.shop, pending.member, proof.user.id, tenantId, baseId, this.#seal(id, binding));
    this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE shop=? AND member=?").run(pending.shop, pending.member);
  }
  load(shop: string, member: string): CloudMailBinding | null {
    const row = this.#db.prepare("SELECT id,secret FROM cloud_mail_bindings WHERE shop=? AND member=? AND active=1").get(shop, member);
    if (!row) return null;
    if (!(row.secret instanceof Uint8Array)) throw new Error("cloud.mail_binding_invalid");
    const binding = bindingSchema.parse(this.#open(String(row.id), row.secret));
    if (binding.id !== row.id || binding.shop !== shop || binding.member !== member) throw new Error("cloud.mail_binding_invalid");
    return binding;
  }
  credential(binding: CloudMailBinding): StoredAccessCredential {
    return new StoredAccessCredential(binding.metadata, createHash("sha256").update(binding.id).update(binding.bearer).digest("hex"), binding.bearer);
  }
  assertCurrent(binding: CloudMailBinding): void {
    const current = this.load(binding.shop, binding.member);
    if (!current || current.id !== binding.id || current.bearer !== binding.bearer || current.revision !== binding.revision) throw new CloudHttpError("cloud.mail_binding_changed", 409);
  }
  disconnect(shop: string, member: string): void {
    this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE shop=? AND member=?").run(shop, member);
    this.#db.prepare("UPDATE cloud_mail_bindings SET active=0,secret=NULL WHERE shop=? AND member=?").run(shop, member);
  }
  disableShop(shop: string): void {
    this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE shop=?").run(shop);
    this.#db.prepare("UPDATE cloud_mail_bindings SET active=0,secret=NULL WHERE shop=?").run(shop);
  }
  owners(shop: string) {
    return this.#db.prepare("SELECT access_user,tenant_id,base_id FROM cloud_mail_bindings WHERE shop=?").all(shop).map(row => ({ accountId: String(row.access_user), tenantId: String(row.tenant_id), baseId: String(row.base_id) }));
  }
  removeShop(shop: string): void { this.disableShop(shop); this.#db.prepare("DELETE FROM cloud_mail_bindings WHERE shop=?").run(shop); }
  close(): void { this.#key.fill(0); }
}
