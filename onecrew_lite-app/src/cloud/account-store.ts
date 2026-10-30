import { createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseStoredJson } from "../contracts/stored-json.ts";
import { encryptOwnerVaultSecret } from "../platforms/browser/owner-vault-store.ts";
import { decryptVaultEnvelope } from "../storage/vault-reader.ts";
import { CloudHttpError } from "./http-error.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const pairingSchema = z.strictObject({ id: z.string(), expires: z.number(), verifier: z.string(), idempotency: z.string(),
  installationId: z.uuid(), credentialId: z.uuid(), bearer: z.string(), code: z.string().optional(), state: z.string().optional() });
export type AccountPairing = z.infer<typeof pairingSchema>;
export const CLOUD_ACCOUNT_SESSION_SECONDS = 7 * 24 * 60 * 60;

export class CloudAccountStore {
  readonly #db: DatabaseSync;
  readonly #key: Buffer;
  readonly installationKey: string;
  constructor(db: DatabaseSync, key: Uint8Array) {
    this.#db = db; this.#key = Buffer.from(key);
    db.exec(`CREATE TABLE IF NOT EXISTS cloud_account_installation (id INTEGER PRIMARY KEY CHECK(id=1), installation_key TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_account_pairings (state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, secret BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_account_sessions (token_hash TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES cloud_workspaces(key), user_id TEXT NOT NULL, expires INTEGER NOT NULL);`);
    db.prepare("INSERT OR IGNORE INTO cloud_account_installation VALUES (1,?)").run(randomUUID());
    this.installationKey = String(db.prepare("SELECT installation_key FROM cloud_account_installation WHERE id=1").get()!.installation_key);
  }
  #seal(id: string, value: AccountPairing) {
    const key = Buffer.from(hkdfSync("sha256", this.#key, "onecrew-cloud-account-v1", id, 32)), clear = Buffer.from(JSON.stringify(value));
    try { return encryptOwnerVaultSecret(key, clear); } finally { key.fill(0); clear.fill(0); }
  }
  #open(id: string, bytes: Uint8Array) {
    const key = Buffer.from(hkdfSync("sha256", this.#key, "onecrew-cloud-account-v1", id, 32));
    try {
      const clear = decryptVaultEnvelope(key, bytes);
      try { return pairingSchema.parse(parseStoredJson(new TextDecoder("utf-8", { fatal: true }).decode(clear), true)); }
      finally { clear.fill(0); }
    } finally { key.fill(0); }
  }
  begin() {
    const state = randomBytes(32).toString("base64url"), browser = randomBytes(32).toString("base64url"), id = hash(state), credentialId = randomUUID();
    const pending: AccountPairing = { id, expires: Date.now() + 300_000, verifier: randomBytes(32).toString("base64url"), idempotency: randomBytes(32).toString("base64url"),
      installationId: randomUUID(), credentialId, bearer: `${credentialId}_${randomBytes(32).toString("base64url")}` };
    this.#db.prepare("DELETE FROM cloud_account_pairings WHERE consumed=0 AND expires<=?").run(Date.now());
    this.#db.prepare("INSERT INTO cloud_account_pairings(state_hash,browser_hash,expires,secret) VALUES (?,?,?,?)").run(id, hash(browser), pending.expires, this.#seal(id, pending));
    return { state, browser, challenge: createHash("sha256").update(pending.verifier).digest("base64url") };
  }
  hasPairing(state: string): boolean { return !!this.#db.prepare("SELECT 1 FROM cloud_account_pairings WHERE state_hash=?").get(hash(state)); }
  consume(state: string, code: string, browser: string) {
    const id = hash(state);
    this.#db.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#db.exec("ROLLBACK"); } };
    const row = this.#db.prepare("UPDATE cloud_account_pairings SET consumed=1 WHERE state_hash=? AND browser_hash=? AND consumed=0 AND expires>? RETURNING secret").get(id, hash(browser), Date.now());
    if (!row || !(row.secret instanceof Uint8Array)) throw new CloudHttpError("cloud.account_pairing_invalid", 400);
    const pending = { ...this.#open(id, row.secret), code, state };
    this.#db.prepare("UPDATE cloud_account_pairings SET secret=? WHERE state_hash=?").run(this.#seal(id, pending), id);
    this.#db.exec("COMMIT"); committed = true;
    return pending;
  }
  pending() { return this.#db.prepare("SELECT state_hash,secret FROM cloud_account_pairings WHERE consumed=1").all().map(row => this.#open(String(row.state_hash), row.secret as Uint8Array)); }
  forget(id: string): void { this.#db.prepare("DELETE FROM cloud_account_pairings WHERE state_hash=?").run(id); }
  createSession(workspace: string, userId: string) {
    const token = randomBytes(32).toString("base64url");
    this.#db.prepare("DELETE FROM cloud_account_sessions WHERE expires<=?").run(Date.now());
    this.#db.prepare("INSERT INTO cloud_account_sessions VALUES (?,?,?,?)").run(hash(token), workspace, userId, Date.now() + CLOUD_ACCOUNT_SESSION_SECONDS * 1000);
    return token;
  }
  session(token: string) {
    const row = this.#db.prepare("SELECT workspace,user_id FROM cloud_account_sessions WHERE token_hash=? AND expires>?").get(hash(token), Date.now());
    return row ? { workspace: String(row.workspace), userId: String(row.user_id) } : null;
  }
  logout(token: string): void { this.#db.prepare("DELETE FROM cloud_account_sessions WHERE token_hash=?").run(hash(token)); }
  close(): void { this.#key.fill(0); }
}
