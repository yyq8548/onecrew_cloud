import { createHash, createHmac, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Session } from "@shopify/shopify-api";
import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import { encryptOwnerVaultSecret } from "../platforms/browser/owner-vault-store.ts";
import { decryptVaultEnvelope } from "../storage/vault-reader.ts";
import { shopDomainSchema } from "../cloud/shop-runtime-registry.ts";
import { CloudHttpError } from "../cloud/http-error.ts";
import type { BrowserSnapshotOwner } from "../cloud/browser-snapshot-store.ts";
import { initializeWorkspaceRegistry } from "../cloud/workspaces.ts";
import { parseCustomerDataRequest, parseCustomerRedaction, parseShopifyPrivacyBody, type ShopifyPrivacyCustomer } from "./privacy-contracts.ts";

const workspace = z.strictObject({ shop: shopDomainSchema, tenant_id: z.string().uuid(), base_id: z.string().uuid(), installed_at: z.number().int(), uninstalled_at: z.number().int().nullable() });
export type ShopifyWorkspace = z.infer<typeof workspace>;
const propertyArray = z.array(z.tuple([z.string(), z.union([z.string(), z.number(), z.boolean()])]));
export const shopifyWebhookTopic = z.enum(["APP_UNINSTALLED", "CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"]);
const webhookEnvelope = z.strictObject({ webhookId: z.uuid(), shop: shopDomainSchema, topic: shopifyWebhookTopic, apiVersion: z.string().regex(/^\d{4}-\d{2}$/u), triggeredAt: z.iso.datetime({ offset: true }).nullable(), body: z.string().min(1) });
export type VerifiedWebhookEnvelope = z.infer<typeof webhookEnvelope>;
const receipt = z.strictObject({ sequence: z.number().int(), webhook_id: z.uuid(), shop: shopDomainSchema, topic: shopifyWebhookTopic, api_version: z.string(), body_sha256: z.string(), triggered_at: z.string().nullable(), received_at: z.number().int(), lifecycle_revision: z.number().int().nullable(), completed_at: z.number().int().nullable() });
export type ShopifyWebhookReceipt = z.infer<typeof receipt>;
const receiptColumns = "sequence,webhook_id,shop,topic,api_version,body_sha256,triggered_at,received_at,lifecycle_revision,completed_at";
const privacyRequest = z.strictObject({ webhook_id: z.uuid(), data_request_id: z.string(), created_at: z.number().int(), delivered_at: z.number().int().nullable() });

// 专用 cloud.sqlite 的存储边界；复用 Lite 加密封装和 SDK 会话序列化。
export class ShopifyInstallationStore {
  readonly #database: DatabaseSync;
  readonly #key: Buffer;
  #closed = false;
  constructor(database: DatabaseSync, key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error("shopify.storage_key_invalid");
    this.#database = database;
    this.#key = Buffer.from(key);
    database.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS shopify_installations (
        shop TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, base_id TEXT NOT NULL UNIQUE,
        installed_at INTEGER NOT NULL, uninstalled_at INTEGER
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_offline_sessions (
        shop TEXT PRIMARY KEY REFERENCES shopify_installations(shop) ON DELETE CASCADE,
        session_id TEXT NOT NULL, encrypted_session BLOB NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_lifecycle (
        shop TEXT PRIMARY KEY, revision INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_browser_snapshots (
        shop TEXT PRIMARY KEY REFERENCES shopify_installations(shop) ON DELETE CASCADE,
        snapshot_id TEXT NOT NULL, previous_snapshot_id TEXT, updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_webhook_inbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, webhook_id TEXT NOT NULL UNIQUE,
        shop TEXT NOT NULL, topic TEXT NOT NULL, api_version TEXT NOT NULL,
        body_sha256 TEXT NOT NULL, encrypted_body BLOB NOT NULL, triggered_at TEXT,
        received_at INTEGER NOT NULL, lifecycle_revision INTEGER, completed_at INTEGER
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_redacted_webhooks (
        webhook_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, shop_key TEXT NOT NULL,
        topic TEXT NOT NULL, api_version TEXT NOT NULL, body_key TEXT NOT NULL, triggered_at TEXT,
        received_at INTEGER NOT NULL, lifecycle_revision INTEGER, completed_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS shopify_privacy_requests (
        webhook_id TEXT PRIMARY KEY, shop TEXT NOT NULL, data_request_id TEXT NOT NULL,
        subject_keys TEXT NOT NULL CHECK(json_valid(subject_keys)), encrypted_report BLOB NOT NULL,
        created_at INTEGER NOT NULL, delivered_at INTEGER
      ) STRICT;`);
    initializeWorkspaceRegistry(database);
  }

  #assertOpen(): void { if (this.#closed) throw new Error("shopify.store_closed"); }
  #opaque(kind: string, value: string): string { return createHmac("sha256", this.#key).update(JSON.stringify([kind, value])).digest("hex"); }
  #subjectKeys(customer: ShopifyPrivacyCustomer): string[] {
    return [customer.id ? this.#opaque("customer-id", customer.id) : null, customer.email ? this.#opaque("customer-email", customer.email.toLowerCase()) : null, customer.phone ? this.#opaque("customer-phone", customer.phone) : null].filter((value): value is string => value !== null);
  }

  workspace(shop: string): ShopifyWorkspace | null {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    const row = this.#database.prepare("SELECT * FROM shopify_installations WHERE shop=?").get(shop);
    return row ? workspace.parse(row) : null;
  }

  lifecycleRevision(shop: string): number {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    const row = this.#database.prepare("SELECT MAX(revision) AS revision FROM shopify_lifecycle WHERE shop IN (?,?)").get(shop, this.#opaque("shop", shop));
    return row?.revision != null ? z.number().int().nonnegative().parse(row.revision) : 0;
  }

  browserSnapshot(shop: string): string | null {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    const row = this.#database.prepare("SELECT snapshot_id FROM shopify_browser_snapshots WHERE shop=?").get(shop);
    return row ? z.uuid().parse(row.snapshot_id) : null;
  }

  recordBrowserSnapshot(owner: BrowserSnapshotOwner, id: string, expectedRevision: number, discardPrevious = false): string[] {
    this.#assertOpen(); shopDomainSchema.parse(owner.shop); z.uuid().parse(id);
    this.#database.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#database.exec("ROLLBACK"); } };
    if (this.lifecycleRevision(owner.shop) !== expectedRevision) throw new CloudHttpError("shopify.installation_changed", 409);
    const changed = this.#database.prepare(`INSERT INTO shopify_browser_snapshots (shop,snapshot_id,previous_snapshot_id,updated_at)
      SELECT shop,?,NULL,? FROM shopify_installations WHERE shop=? AND tenant_id=? AND base_id=?
      ON CONFLICT(shop) DO UPDATE SET previous_snapshot_id=CASE WHEN ? THEN NULL ELSE shopify_browser_snapshots.snapshot_id END,snapshot_id=excluded.snapshot_id,updated_at=excluded.updated_at`).run(id, Date.now(), owner.shop, owner.tenant_id, owner.base_id, discardPrevious ? 1 : 0);
    if (changed.changes !== 1) throw new CloudHttpError("shopify.installation_changed", 409);
    const saved = this.#database.prepare("SELECT snapshot_id,previous_snapshot_id FROM shopify_browser_snapshots WHERE shop=?").get(owner.shop)!;
    const retained = [z.uuid().parse(saved.snapshot_id), ...(saved.previous_snapshot_id == null ? [] : [z.uuid().parse(saved.previous_snapshot_id)])];
    this.#database.exec("COMMIT"); committed = true;
    return retained;
  }

  install(session: Session, expectedRevision: number, authorizedAt = Date.now()): ShopifyWorkspace {
    this.#assertOpen(); shopDomainSchema.parse(session.shop);
    z.number().int().nonnegative().parse(expectedRevision);
    z.number().int().nonnegative().parse(authorizedAt);
    if (session.isOnline || !session.accessToken || !session.isScopeIncluded("read_products")) throw new Error("shopify.offline_session_invalid");
    const clear = Buffer.from(stringifyApplicationJson(session.toPropertyArray()));
    let encrypted: Buffer;
    try { encrypted = encryptOwnerVaultSecret(this.#key, clear); } finally { clear.fill(0); }
    this.#database.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#database.exec("ROLLBACK"); } };
    if (this.lifecycleRevision(session.shop) !== expectedRevision) throw new CloudHttpError("shopify.installation_changed", 409);
    if (this.#database.prepare("SELECT 1 FROM shopify_webhook_inbox WHERE shop=? AND topic IN ('APP_UNINSTALLED','SHOP_REDACT') AND lifecycle_revision IS NOT NULL AND completed_at IS NULL LIMIT 1").get(session.shop)) throw new CloudHttpError("shopify.uninstall_processing", 409);
    const prior = this.workspace(session.shop);
    if (!prior) this.#database.prepare("INSERT INTO shopify_installations VALUES (?,?,?,?,NULL)").run(session.shop, randomUUID(), randomUUID(), authorizedAt);
    else if (prior.uninstalled_at !== null) this.#database.prepare("UPDATE shopify_installations SET installed_at=?, uninstalled_at=NULL WHERE shop=?").run(authorizedAt, session.shop);
    this.#database.prepare("INSERT INTO shopify_offline_sessions VALUES (?,?,?) ON CONFLICT(shop) DO UPDATE SET session_id=excluded.session_id, encrypted_session=excluded.encrypted_session").run(session.shop, session.id, encrypted);
    const saved = this.workspace(session.shop);
    if (!saved) throw new Error("shopify.installation_missing");
    this.#database.exec("COMMIT"); committed = true;
    return saved;
  }

  session(shop: string): Session | null {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    const row = this.#database.prepare(`SELECT s.* FROM shopify_offline_sessions s JOIN shopify_installations i ON i.shop=s.shop WHERE s.shop=? AND i.uninstalled_at IS NULL`).get(shop);
    if (!row) return null;
    if (!(row.encrypted_session instanceof Uint8Array)) throw new Error("shopify.session_storage_invalid");
    const clear = decryptVaultEnvelope(this.#key, row.encrypted_session);
    let session: Session;
    try { session = Session.fromPropertyArray(propertyArray.parse(parseApplicationJson(clear))); } finally { clear.fill(0); }
    if (session.shop !== shop || session.id !== row.session_id || session.isOnline || !session.accessToken) throw new Error("shopify.session_owner_invalid");
    return session;
  }

  uninstall(shop: string): void {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    this.#database.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#database.exec("ROLLBACK"); } };
    this.#deactivate(shop);
    this.#database.exec("COMMIT"); committed = true;
  }

  #deactivate(shop: string): void {
    const revision = this.lifecycleRevision(shop) + 1;
    this.#database.prepare("DELETE FROM shopify_lifecycle WHERE shop=?").run(shop);
    this.#database.prepare("INSERT INTO shopify_lifecycle VALUES (?,?) ON CONFLICT(shop) DO UPDATE SET revision=excluded.revision").run(this.#opaque("shop", shop), revision);
    this.#database.prepare("UPDATE shopify_installations SET uninstalled_at=? WHERE shop=? AND uninstalled_at IS NULL").run(Date.now(), shop);
    this.#database.prepare("DELETE FROM shopify_offline_sessions WHERE shop=?").run(shop);
  }

  // 仅供官方 SDK 验签后的入口调用；收件与卸载停用在同一事务内完成。
  receiveVerifiedWebhook(input: VerifiedWebhookEnvelope): ShopifyWebhookReceipt {
    this.#assertOpen();
    const event = webhookEnvelope.parse(input);
    if (event.topic !== "APP_UNINSTALLED") parseShopifyPrivacyBody(event.topic, event.shop, event.body);
    const digest = createHash("sha256").update(event.body).digest("hex");
    this.#database.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#database.exec("ROLLBACK"); } };
    const prior = this.#database.prepare(`SELECT ${receiptColumns} FROM shopify_webhook_inbox WHERE webhook_id=?`).get(event.webhookId);
    if (prior) {
      const saved = receipt.parse(prior);
      if (saved.shop !== event.shop || saved.topic !== event.topic || saved.body_sha256 !== digest || saved.api_version !== event.apiVersion || saved.triggered_at !== event.triggeredAt) throw new CloudHttpError("shopify.webhook_conflict", 409);
      this.#database.exec("COMMIT"); committed = true;
      return saved;
    }
    const redacted = this.#database.prepare("SELECT * FROM shopify_redacted_webhooks WHERE webhook_id=?").get(event.webhookId);
    if (redacted) {
      if (redacted.shop_key !== this.#opaque("shop", event.shop) || redacted.topic !== event.topic || redacted.body_key !== this.#opaque("webhook-body", digest) || redacted.api_version !== event.apiVersion || redacted.triggered_at !== event.triggeredAt) throw new CloudHttpError("shopify.webhook_conflict", 409);
      const { shop_key: _shopKey, body_key: _bodyKey, ...metadata } = redacted;
      const saved = receipt.parse({ ...metadata, shop: event.shop, body_sha256: digest });
      this.#database.exec("COMMIT"); committed = true;
      return saved;
    }
    const clear = Buffer.from(event.body);
    let encrypted: Buffer;
    try { encrypted = encryptOwnerVaultSecret(this.#key, clear); } finally { clear.fill(0); }
    let revision: number | null = null;
    if (event.topic === "APP_UNINSTALLED" || event.topic === "SHOP_REDACT") {
      const active = this.workspace(event.shop);
      const obsolete = active?.uninstalled_at === null && event.triggeredAt !== null && Date.parse(event.triggeredAt) < active.installed_at;
      if (event.topic === "SHOP_REDACT" && active?.uninstalled_at === null && event.triggeredAt === null) throw new CloudHttpError("shopify.redaction_installation_ambiguous", 409);
      if (!obsolete) { this.#deactivate(event.shop); revision = this.lifecycleRevision(event.shop); }
    }
    this.#database.prepare(`INSERT INTO shopify_webhook_inbox (webhook_id,shop,topic,api_version,body_sha256,encrypted_body,triggered_at,received_at,lifecycle_revision,completed_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run(event.webhookId, event.shop, event.topic, event.apiVersion, digest, encrypted, event.triggeredAt, Date.now(), revision);
    const saved = receipt.parse(this.#database.prepare(`SELECT ${receiptColumns} FROM shopify_webhook_inbox WHERE webhook_id=?`).get(event.webhookId));
    this.#database.exec("COMMIT"); committed = true;
    return saved;
  }

  pendingWebhooks(limit = 100, topic?: z.infer<typeof shopifyWebhookTopic>, afterSequence = 0): ShopifyWebhookReceipt[] {
    this.#assertOpen(); z.number().int().min(1).max(1000).parse(limit);
    if (topic !== undefined) shopifyWebhookTopic.parse(topic);
    z.number().int().nonnegative().parse(afterSequence);
    return this.#database.prepare(`SELECT ${receiptColumns} FROM shopify_webhook_inbox WHERE completed_at IS NULL AND sequence>? AND (? IS NULL OR topic=?) ORDER BY sequence LIMIT ?`).all(afterSequence, topic ?? null, topic ?? null, limit).map(row => receipt.parse(row));
  }

  webhookBody(webhookId: string): Buffer {
    this.#assertOpen(); z.uuid().parse(webhookId);
    const row = this.#database.prepare("SELECT encrypted_body,body_sha256 FROM shopify_webhook_inbox WHERE webhook_id=?").get(webhookId);
    if (!row || !(row.encrypted_body instanceof Uint8Array)) throw new Error("shopify.webhook_missing");
    if (!row.encrypted_body.byteLength) throw new Error("shopify.webhook_body_erased");
    const clear = decryptVaultEnvelope(this.#key, row.encrypted_body);
    if (createHash("sha256").update(clear).digest("hex") !== row.body_sha256) { clear.fill(0); throw new Error("shopify.webhook_storage_invalid"); }
    return clear;
  }

  completeWebhook(webhookId: string, eraseBody = false): void {
    this.#assertOpen(); z.uuid().parse(webhookId);
    const result = this.#database.prepare("UPDATE shopify_webhook_inbox SET completed_at=COALESCE(completed_at,?),encrypted_body=CASE WHEN ? THEN X'' ELSE encrypted_body END WHERE webhook_id=?").run(Date.now(), eraseBody ? 1 : 0, webhookId);
    if (result.changes !== 1 && !this.#database.prepare("SELECT 1 FROM shopify_redacted_webhooks WHERE webhook_id=?").get(webhookId)) throw new Error("shopify.webhook_missing");
  }

  webhookCompleted(webhookId: string): boolean {
    this.#assertOpen(); z.uuid().parse(webhookId);
    const row = this.#database.prepare("SELECT completed_at FROM shopify_webhook_inbox WHERE webhook_id=? UNION ALL SELECT completed_at FROM shopify_redacted_webhooks WHERE webhook_id=?").get(webhookId, webhookId);
    if (!row) throw new Error("shopify.webhook_missing");
    return row.completed_at !== null;
  }

  prepareCustomerDataRequest(received: ShopifyWebhookReceipt): void {
    this.#assertOpen();
    if (received.topic !== "CUSTOMERS_DATA_REQUEST") throw new Error("shopify.privacy_topic_invalid");
    const clear = this.webhookBody(received.webhook_id);
    try {
      const request = parseCustomerDataRequest(received.shop, clear);
      const report = Buffer.from(stringifyApplicationJson({ data_request_id: request.data_request.id, shop_domain: request.shop_domain, customer: request.customer, orders_requested: request.orders_requested, stored_customer_records: [], stored_order_records: [], explanation: "OneCrew 当前仅申请 read_products，没有读取或保存 Shopify 客户与订单记录。此导出包含本次隐私请求提供的客户资料。", generated_at: Date.now() }));
      let encrypted: Buffer;
      try { encrypted = encryptOwnerVaultSecret(this.#key, report); } finally { report.fill(0); }
      this.#database.prepare("INSERT INTO shopify_privacy_requests (webhook_id,shop,data_request_id,subject_keys,encrypted_report,created_at,delivered_at) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(webhook_id) DO NOTHING").run(received.webhook_id, received.shop, request.data_request.id, JSON.stringify(this.#subjectKeys(request.customer)), encrypted, received.received_at);
      this.completeWebhook(received.webhook_id, true);
    } finally { clear.fill(0); }
    this.#database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  redactCustomer(received: ShopifyWebhookReceipt): void {
    this.#assertOpen();
    if (received.topic !== "CUSTOMERS_REDACT") throw new Error("shopify.privacy_topic_invalid");
    const clear = this.webhookBody(received.webhook_id);
    try {
      const request = parseCustomerRedaction(received.shop, clear), keys = this.#subjectKeys(request.customer);
      this.#database.prepare(`DELETE FROM shopify_privacy_requests WHERE shop=? AND EXISTS (SELECT 1 FROM json_each(subject_keys) WHERE value IN (${keys.map(() => "?").join(",")}))`).run(received.shop, ...keys);
      this.completeWebhook(received.webhook_id, true);
    } finally { clear.fill(0); }
    this.#database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  privacyRequests(shop: string) {
    this.#assertOpen(); shopDomainSchema.parse(shop);
    return this.#database.prepare("SELECT webhook_id,data_request_id,created_at,delivered_at FROM shopify_privacy_requests WHERE shop=? ORDER BY created_at DESC,webhook_id DESC").all(shop).map(row => privacyRequest.parse(row));
  }

  customerDataExport(shop: string, webhookId: string): Buffer {
    this.#assertOpen(); shopDomainSchema.parse(shop); z.uuid().parse(webhookId);
    const row = this.#database.prepare("SELECT encrypted_report FROM shopify_privacy_requests WHERE shop=? AND webhook_id=? AND delivered_at IS NULL").get(shop, webhookId);
    if (!row || !(row.encrypted_report instanceof Uint8Array)) throw new CloudHttpError("shopify.privacy_request_missing", 404);
    return decryptVaultEnvelope(this.#key, row.encrypted_report);
  }

  confirmCustomerDataDelivery(shop: string, webhookId: string): void {
    this.#assertOpen(); shopDomainSchema.parse(shop); z.uuid().parse(webhookId);
    const changed = this.#database.prepare("UPDATE shopify_privacy_requests SET delivered_at=COALESCE(delivered_at,?),encrypted_report=X'' WHERE shop=? AND webhook_id=?").run(Date.now(), shop, webhookId);
    if (changed.changes !== 1) throw new CloudHttpError("shopify.privacy_request_missing", 404);
    this.#database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  redactShop(received: ShopifyWebhookReceipt): void {
    this.#assertOpen();
    if (received.topic !== "SHOP_REDACT" || received.lifecycle_revision === null) throw new Error("shopify.privacy_topic_invalid");
    this.#database.exec("BEGIN IMMEDIATE");
    let committed = false;
    using transaction = { [Symbol.dispose]: () => { if (!committed) this.#database.exec("ROLLBACK"); } };
    if (this.workspace(received.shop)?.uninstalled_at === null || this.lifecycleRevision(received.shop) < received.lifecycle_revision) throw new CloudHttpError("shopify.installation_changed", 409);
    const events = this.#database.prepare(`SELECT ${receiptColumns} FROM shopify_webhook_inbox WHERE shop=?`).all(received.shop).map(row => receipt.parse(row));
    const archive = this.#database.prepare("INSERT INTO shopify_redacted_webhooks VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const event of events) archive.run(event.webhook_id, event.sequence, this.#opaque("shop", event.shop), event.topic, event.api_version, this.#opaque("webhook-body", event.body_sha256), event.triggered_at, event.received_at, event.lifecycle_revision, event.completed_at ?? Date.now());
    this.#database.prepare("DELETE FROM shopify_privacy_requests WHERE shop=?").run(received.shop);
    this.#database.prepare("DELETE FROM shopify_webhook_inbox WHERE shop=?").run(received.shop);
    this.#database.prepare("DELETE FROM shopify_installations WHERE shop=?").run(received.shop);
    this.#database.exec("COMMIT"); committed = true;
    this.#database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  close(): void { this.#closed = true; this.#key.fill(0); }
}
