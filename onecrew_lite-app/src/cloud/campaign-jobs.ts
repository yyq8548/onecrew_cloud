import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import { CloudHttpError } from "./http-error.ts";
import { shopDomainSchema } from "./shop-runtime-registry.ts";
import { cloudCampaignConditions } from "./campaign-parameters.ts";

export const shopifyProductId = z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/u);
export const shopifyProductSnapshot = z.strictObject({ id: shopifyProductId, title: z.string(), description: z.string(), onlineStoreUrl: z.url().nullable(), updatedAt: z.iso.datetime(), captured_at: z.number().int().positive() });
export type ShopifyProductSnapshot = z.infer<typeof shopifyProductSnapshot>;
export const createCloudCampaign = cloudCampaignConditions.safeExtend({ id: z.uuid(), product_id: shopifyProductId });
export const startCloudCampaign = z.strictObject({ id: z.uuid(), expected_revision: z.number().int().positive().max(4294967295) });
const job = z.strictObject({ id: z.uuid(), shop: shopDomainSchema, campaign_id: z.string().min(1).max(128), kind: z.enum(["draft", "execution"]), state: z.enum(["running", "completed", "failed", "interrupted"]), phase: z.string().min(1), brief: z.string(), expected_revision: z.number().int().positive().nullable(), error_code: z.string().nullable(), created_at: z.number().int(), updated_at: z.number().int(), product: shopifyProductSnapshot.nullable() });
export type CloudCampaignJob = z.infer<typeof job>;
const columns = "id,shop,campaign_id,kind,state,phase,brief,expected_revision,error_code,created_at,updated_at,product_json";

export class CampaignJobStore {
  readonly #db: DatabaseSync;
  constructor(database: DatabaseSync) {
    this.#db = database;
    database.exec(`CREATE TABLE IF NOT EXISTS cloud_campaign_jobs (
      id TEXT NOT NULL, shop TEXT NOT NULL REFERENCES shopify_installations(shop), campaign_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('draft','execution')), state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
      phase TEXT NOT NULL, brief TEXT NOT NULL, expected_revision INTEGER, error_code TEXT,
      input_sha256 TEXT NOT NULL, product_json TEXT NOT NULL CHECK(json_valid(product_json)),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(shop,id)
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS cloud_campaign_active_shop ON cloud_campaign_jobs(shop) WHERE state='running';`);
  }
  #decode(raw: Record<string, unknown>): CloudCampaignJob {
    const { product_json, ...metadata } = raw;
    return job.parse({ ...metadata, product: parseApplicationJson(z.string().parse(product_json)) });
  }
  #hash(input: unknown) { return createHash("sha256").update(stringifyApplicationJson(input)).digest("hex"); }
  get(shop: string, id: string): CloudCampaignJob | null {
    shopDomainSchema.parse(shop); z.uuid().parse(id);
    const row = this.#db.prepare(`SELECT ${columns} FROM cloud_campaign_jobs WHERE shop=? AND id=?`).get(shop, id);
    return row ? this.#decode(row) : null;
  }
  reuse(shop: string, id: string, input: unknown): CloudCampaignJob | null {
    const existing = this.get(shop, id);
    if (!existing) return null;
    const row = this.#db.prepare("SELECT input_sha256 FROM cloud_campaign_jobs WHERE shop=? AND id=?").get(shop, id);
    if (row?.input_sha256 !== this.#hash(input)) throw new CloudHttpError("cloud.job_conflict", 409);
    return existing;
  }
  busy(shop: string): boolean {
    shopDomainSchema.parse(shop);
    return this.#db.prepare("SELECT 1 FROM cloud_campaign_jobs WHERE shop=? AND state='running'").get(shop) !== undefined;
  }
  begin(input: Pick<CloudCampaignJob, "id" | "shop" | "campaign_id" | "kind" | "brief" | "expected_revision"> & { request: unknown; product: ShopifyProductSnapshot | null }): CloudCampaignJob {
    const now = Date.now();
    const value = job.parse({ ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "request")), state: "running", phase: input.kind === "draft" ? "checking_connection" : "searching", error_code: null, created_at: now, updated_at: now });
    if (this.busy(input.shop)) throw new CloudHttpError("cloud.campaign_busy", 409);
    const inserted = this.#db.prepare(`INSERT INTO cloud_campaign_jobs (id,shop,campaign_id,kind,state,phase,brief,expected_revision,error_code,input_sha256,product_json,created_at,updated_at)
      SELECT ?,shop,?,?,'running',?,?,?,NULL,?,?,?,? FROM shopify_installations WHERE shop=? AND uninstalled_at IS NULL`).run(value.id, value.campaign_id, value.kind, value.phase, value.brief, value.expected_revision, this.#hash(input.request), stringifyApplicationJson(value.product), now, now, value.shop);
    if (inserted.changes !== 1) throw new CloudHttpError("shopify.installation_required", 409);
    return value;
  }
  phase(shop: string, id: string, phase: string): void {
    this.#db.prepare("UPDATE cloud_campaign_jobs SET phase=?,updated_at=? WHERE shop=? AND id=? AND state='running'").run(z.string().min(1).parse(phase), Date.now(), shopDomainSchema.parse(shop), z.uuid().parse(id));
  }
  finish(shop: string, id: string, state: Exclude<CloudCampaignJob["state"], "running">, phase: string, code: string | null = null): void {
    const changed = this.#db.prepare("UPDATE cloud_campaign_jobs SET state=?,phase=?,error_code=?,updated_at=? WHERE shop=? AND id=? AND state='running'").run(z.enum(["completed", "failed", "interrupted"]).parse(state), z.string().min(1).parse(phase), z.string().nullable().parse(code), Date.now(), shopDomainSchema.parse(shop), z.uuid().parse(id));
    if (changed.changes !== 1) throw new Error("cloud.job_completion_conflict");
  }
  recent(shop: string): CloudCampaignJob[] { return this.#db.prepare(`SELECT ${columns} FROM cloud_campaign_jobs WHERE shop=? ORDER BY created_at DESC,id DESC LIMIT 20`).all(shopDomainSchema.parse(shop)).map(row => this.#decode(row)); }
  product(shop: string, campaign: string): ShopifyProductSnapshot | null {
    const row = this.#db.prepare("SELECT product_json FROM cloud_campaign_jobs WHERE shop=? AND campaign_id=? ORDER BY created_at,id LIMIT 1").get(shopDomainSchema.parse(shop), z.string().min(1).parse(campaign));
    return row ? shopifyProductSnapshot.nullable().parse(parseApplicationJson(z.string().parse(row.product_json))) : null;
  }
  recover(): void { this.#db.prepare("UPDATE cloud_campaign_jobs SET state='interrupted',phase='interrupted',error_code='cloud.service_restarted',updated_at=? WHERE state='running'").run(Date.now()); }
  removeShop(shop: string): void { this.#db.prepare("DELETE FROM cloud_campaign_jobs WHERE shop=?").run(shopDomainSchema.parse(shop)); }
}
