import { createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseStoredJson } from "../contracts/stored-json.ts";
import { accessCredentialMetadataSchema, StoredAccessCredential } from "../identity/legacy-access-credential.ts";
import type { VerifiedMigrationCredential } from "../identity/access-verification.ts";
import { encryptOwnerVaultSecret } from "../platforms/browser/owner-vault-store.ts";
import { decryptVaultEnvelope } from "../storage/vault-reader.ts";
import { CloudHttpError } from "./http-error.ts";
import type { LocalWorkspace } from "./workspaces.ts";

const pendingSchema = z.strictObject({ id: z.string(), shop: z.string(), member: z.string(), revision: z.number().int(), expires: z.number(),
  verifier: z.string(), idempotency: z.string(), installationId: z.uuid(), credentialId: z.uuid(), bearer: z.string(), code: z.string().optional(), state: z.string().optional() });
const bindingSchema = z.strictObject({ id: z.uuid(), shop: z.string(), member: z.string(), tenantId: z.string().min(1), baseId: z.uuid(), revision: z.number().int(),
  metadata: accessCredentialMetadataSchema, email: z.email(), bearer: z.string() });
export type CloudMailBinding = z.infer<typeof bindingSchema>;
export type CloudMailPairing = z.infer<typeof pendingSchema>;
const revocationSchema = z.strictObject({ shop: z.string(), member: z.string(), metadata: accessCredentialMetadataSchema, bearer: z.string(), idempotency: z.string() });
export type CloudMailRevocation = z.infer<typeof revocationSchema>;

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
    CREATE UNIQUE INDEX IF NOT EXISTS cloud_mail_member_active ON cloud_mail_bindings(shop,member) WHERE active=1;
    CREATE TABLE IF NOT EXISTS cloud_mail_revocations (installation_id TEXT PRIMARY KEY, shop TEXT NOT NULL, member TEXT NOT NULL, secret BLOB NOT NULL);`);
  }
  #transaction<T>(work: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
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
    if (this.#db.prepare("SELECT 1 FROM cloud_mail_revocations WHERE shop=? AND member=? UNION ALL SELECT 1 FROM cloud_mail_pairings WHERE shop=? AND member=? AND consumed<>0").get(shop, member, shop, member)) throw new CloudHttpError("cloud.mail_revocation_incomplete", 409);
    const state = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(state).digest("hex"), credentialId = randomUUID();
    const pending = { id: hash, shop, member, revision, expires: Date.now() + 300_000, verifier: randomBytes(32).toString("base64url"), idempotency: randomBytes(32).toString("base64url"),
      installationId: randomUUID(), credentialId, bearer: `${credentialId}_${randomBytes(32).toString("base64url")}` };
    this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE consumed=0 AND (expires<=? OR (shop=? AND member=?))").run(Date.now(), shop, member);
    this.#db.prepare("INSERT INTO cloud_mail_pairings(state_hash,shop,member,expires,secret) VALUES (?,?,?,?,?)").run(hash, shop, member, pending.expires, this.#seal(hash, pending));
    return { state, challenge: createHash("sha256").update(pending.verifier).digest("base64url") };
  }
  consume(state: string, code?: string) {
    const hash = createHash("sha256").update(state).digest("hex");
    return this.#transaction(() => {
      const row = this.#db.prepare("UPDATE cloud_mail_pairings SET consumed=1 WHERE state_hash=? AND consumed=0 AND expires>? RETURNING secret").get(hash, Date.now());
      if (!row || !(row.secret instanceof Uint8Array)) throw new CloudHttpError("cloud.mail_pairing_invalid", 400);
      const pending = pendingSchema.parse(this.#open(hash, row.secret));
      if (code !== undefined) {
        pending.code = code; pending.state = state;
        this.#db.prepare("UPDATE cloud_mail_pairings SET secret=? WHERE state_hash=?").run(this.#seal(hash, pending), hash);
      }
      return pending;
    });
  }
  bind(pending: z.infer<typeof pendingSchema>, tenantId: string, proof: VerifiedMigrationCredential): void {
    proof.assertFresh();
    if (!this.#db.prepare("SELECT 1 FROM cloud_mail_pairings WHERE state_hash=? AND shop=? AND member=? AND consumed=1").get(pending.id, pending.shop, pending.member)) throw new CloudHttpError("cloud.mail_pairing_invalid", 409);
    this.#transaction(() => {
      this.#bind(pending.shop, pending.member, tenantId, pending.revision, proof);
      this.forgetPairing(pending.id);
    });
  }
  bindAccount(workspace: LocalWorkspace, proof: VerifiedMigrationCredential): void {
    proof.assertFresh();
    if (workspace.user.id !== proof.user.id) throw new CloudHttpError("cloud.account_changed", 409);
    this.#bind(workspace.shop, proof.user.id, workspace.tenant_id, 0, proof);
  }
  #bind(shop: string, member: string, tenantId: string, revision: number, proof: VerifiedMigrationCredential): void {
    const prior = this.#db.prepare("SELECT id,base_id FROM cloud_mail_bindings WHERE shop=? AND member=? AND access_user=?").get(shop, member, proof.user.id);
    const id = prior ? String(prior.id) : randomUUID(), baseId = prior ? String(prior.base_id) : randomUUID();
    const binding: CloudMailBinding = { id, shop, member, tenantId, baseId, revision,
      metadata: { ...proof.metadata }, email: proof.user.email, bearer: proof.exposeBearer() };
    this.#db.prepare(`INSERT INTO cloud_mail_bindings VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(shop,member,access_user)
      DO UPDATE SET active=1,tenant_id=excluded.tenant_id,secret=excluded.secret`).run(id, shop, member, proof.user.id, tenantId, baseId, this.#seal(id, binding));
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
  #enqueue(value: Omit<CloudMailRevocation, "idempotency">): void {
    const id = value.metadata.installation_id;
    this.#db.prepare("INSERT INTO cloud_mail_revocations VALUES (?,?,?,?) ON CONFLICT(installation_id) DO NOTHING").run(id, value.shop, value.member, this.#seal(id, { ...value, idempotency: randomUUID() }));
  }
  #disable(shop: string, member?: string): void {
    const where = member === undefined ? "shop=?" : "shop=? AND member=?", args = member === undefined ? [shop] : [shop, member];
    for (const row of this.#db.prepare(`SELECT id,secret FROM cloud_mail_bindings WHERE ${where} AND secret IS NOT NULL`).all(...args)) {
      const binding = bindingSchema.parse(this.#open(String(row.id), row.secret as Uint8Array));
      this.#enqueue({ shop: binding.shop, member: binding.member, metadata: binding.metadata, bearer: binding.bearer });
    }
    this.#db.prepare(`DELETE FROM cloud_mail_pairings WHERE ${where} AND consumed=0`).run(...args);
    this.#db.prepare(`UPDATE cloud_mail_pairings SET consumed=2 WHERE ${where} AND consumed=1`).run(...args);
    this.#db.prepare(`UPDATE cloud_mail_bindings SET active=0,secret=NULL WHERE ${where}`).run(...args);
  }
  disconnect(shop: string, member: string): void { this.#transaction(() => this.#disable(shop, member)); }
  disableShop(shop: string): void { this.#transaction(() => this.#disable(shop)); }
  forgetPairing(id: string): void { this.#db.prepare("DELETE FROM cloud_mail_pairings WHERE state_hash=?").run(id); }
  pendingPairings(shop?: string, member?: string): CloudMailPairing[] {
    return this.#db.prepare("SELECT state_hash,secret FROM cloud_mail_pairings WHERE consumed<>0 AND (? IS NULL OR shop=?) AND (? IS NULL OR member=?)")
      .all(shop ?? null, shop ?? null, member ?? null, member ?? null).map(row => pendingSchema.parse(this.#open(String(row.state_hash), row.secret as Uint8Array)));
  }
  revokePairing(pending: CloudMailPairing, proof: VerifiedMigrationCredential): void {
    this.#transaction(() => {
      this.#enqueue({ shop: pending.shop, member: pending.member, metadata: { ...proof.metadata }, bearer: proof.exposeBearer() });
      this.forgetPairing(pending.id);
    });
  }
  revocations(shop?: string, member?: string): CloudMailRevocation[] {
    return this.#db.prepare("SELECT installation_id,secret FROM cloud_mail_revocations WHERE (? IS NULL OR shop=?) AND (? IS NULL OR member=?)")
      .all(shop ?? null, shop ?? null, member ?? null, member ?? null).map(row => revocationSchema.parse(this.#open(String(row.installation_id), row.secret as Uint8Array)));
  }
  completeRevocation(id: string): void { this.#db.prepare("DELETE FROM cloud_mail_revocations WHERE installation_id=?").run(id); }
  owners(shop: string) {
    return this.#db.prepare("SELECT access_user,tenant_id,base_id FROM cloud_mail_bindings WHERE shop=?").all(shop).map(row => ({ accountId: String(row.access_user), tenantId: String(row.tenant_id), baseId: String(row.base_id) }));
  }
  removeShop(shop: string): void {
    this.disableShop(shop);
    this.assertShopRevoked(shop);
    this.#db.prepare("DELETE FROM cloud_mail_bindings WHERE shop=?").run(shop);
  }
  assertShopRevoked(shop: string): void {
    if (this.#db.prepare("SELECT 1 FROM cloud_mail_bindings WHERE shop=? AND active=1 UNION ALL SELECT 1 FROM cloud_mail_revocations WHERE shop=? UNION ALL SELECT 1 FROM cloud_mail_pairings WHERE shop=? AND consumed<>0").get(shop, shop, shop)) throw new CloudHttpError("cloud.mail_revocation_incomplete", 503);
  }
  close(): void { this.#key.fill(0); }
}
