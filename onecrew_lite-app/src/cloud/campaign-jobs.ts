import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import { CloudHttpError } from "./http-error.ts";
import { workspaceKeySchema as shopDomainSchema, workspaceTable } from "./workspaces.ts";
import { cloudCampaignConditions } from "./campaign-parameters.ts";

export const shopifyProductId = z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/u);
export const shopifyProductSnapshot = z.strictObject({ id: shopifyProductId, title: z.string(), description: z.string(), vendor: z.string().optional(), onlineStoreUrl: z.url().nullable(), updatedAt: z.iso.datetime(), captured_at: z.number().int().positive() });
export type ShopifyProductSnapshot = z.infer<typeof shopifyProductSnapshot>;
export const manualProductInput = z.strictObject({ title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(2000), vendor: z.string().trim().min(1).max(120).optional(), onlineStoreUrl: z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol)).nullable().optional() });
export const manualProductSnapshot = manualProductInput.extend({ source: z.literal("manual"), id: z.string().regex(/^manual:[0-9a-f-]{36}$/u), onlineStoreUrl: z.url().nullable(), captured_at: z.number().int().positive() });
export const campaignProductSnapshot = z.union([shopifyProductSnapshot, manualProductSnapshot]);
export type CampaignProductSnapshot = z.infer<typeof campaignProductSnapshot>;
export const campaignProductChoice = z.union([z.strictObject({ product_id: shopifyProductId }), z.strictObject({ source: z.literal("manual"), product: manualProductInput })]);
export type CampaignProductChoice = z.infer<typeof campaignProductChoice>;
export const createCloudCampaign = z.union([cloudCampaignConditions.safeExtend({ id: z.uuid(), product_id: shopifyProductId }), cloudCampaignConditions.safeExtend({ id: z.uuid(), source: z.literal("manual"), product: manualProductInput })]);
export const startCloudCampaign = z.strictObject({ id: z.uuid(), expected_revision: z.number().int().positive().max(4294967295) });
const job = z.strictObject({ id: z.uuid(), shop: shopDomainSchema, campaign_id: z.string().min(1).max(128), kind: z.enum(["draft", "execution"]), state: z.enum(["running", "completed", "failed", "interrupted"]), phase: z.string().min(1), brief: z.string(), expected_revision: z.number().int().positive().nullable(), error_code: z.string().nullable(), created_at: z.number().int(), updated_at: z.number().int(), product: campaignProductSnapshot.nullable() });
export type CloudCampaignJob = z.infer<typeof job>;
const columns = "id,shop,campaign_id,kind,state,phase,brief,expected_revision,error_code,created_at,updated_at,product_json";

export class CampaignJobStore {
  readonly #db: DatabaseSync;
  constructor(database: DatabaseSync) {
    this.#db = database;
    workspaceTable(database, "cloud_campaign_jobs", `CREATE TABLE IF NOT EXISTS cloud_campaign_jobs (
      id TEXT NOT NULL, shop TEXT NOT NULL REFERENCES cloud_workspaces(key), campaign_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('draft','execution')), state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
      phase TEXT NOT NULL, brief TEXT NOT NULL, expected_revision INTEGER, error_code TEXT,
      input_sha256 TEXT NOT NULL, product_json TEXT NOT NULL CHECK(json_valid(product_json)),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(shop,id)
    ) STRICT;`);
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS cloud_campaign_active_shop ON cloud_campaign_jobs(shop) WHERE state='running';");
    if (!database.prepare("PRAGMA table_info(cloud_campaign_jobs)").all().some(column => column.name === "keyword_cache_json")) database.exec("ALTER TABLE cloud_campaign_jobs ADD COLUMN keyword_cache_json TEXT CHECK(keyword_cache_json IS NULL OR json_valid(keyword_cache_json));");
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
  begin(input: Pick<CloudCampaignJob, "id" | "shop" | "campaign_id" | "kind" | "brief" | "expected_revision"> & { request: unknown; product: CampaignProductSnapshot | null }): CloudCampaignJob {
    const now = Date.now();
    const value = job.parse({ ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "request")), state: "running", phase: input.kind === "draft" ? "checking_connection" : "searching", error_code: null, created_at: now, updated_at: now });
    if (this.busy(input.shop)) throw new CloudHttpError("cloud.campaign_busy", 409);
    const inserted = this.#db.prepare(`INSERT INTO cloud_campaign_jobs (id,shop,campaign_id,kind,state,phase,brief,expected_revision,error_code,input_sha256,product_json,created_at,updated_at)
      SELECT ?,key,?,?,'running',?,?,?,NULL,?,?,?,? FROM cloud_active_workspaces WHERE key=?`).run(value.id, value.campaign_id, value.kind, value.phase, value.brief, value.expected_revision, this.#hash(input.request), stringifyApplicationJson(value.product), now, now, value.shop);
    if (inserted.changes !== 1) throw new CloudHttpError("shopify.installation_required", 409);
    return value;
  }
  phase(shop: string, id: string, phase: string): void {
    this.#db.prepare("UPDATE cloud_campaign_jobs SET phase=?1,updated_at=?2 WHERE shop=?3 AND id=?4 AND state='running' AND phase!=?1").run(z.string().min(1).parse(phase), Date.now(), shopDomainSchema.parse(shop), z.uuid().parse(id));
  }
  finish(shop: string, id: string, state: Exclude<CloudCampaignJob["state"], "running">, phase: string, code: string | null = null): void {
    const changed = this.#db.prepare("UPDATE cloud_campaign_jobs SET state=?,phase=?,error_code=?,updated_at=? WHERE shop=? AND id=? AND state='running'").run(z.enum(["completed", "failed", "interrupted"]).parse(state), z.string().min(1).parse(phase), z.string().nullable().parse(code), Date.now(), shopDomainSchema.parse(shop), z.uuid().parse(id));
    if (changed.changes !== 1) throw new Error("cloud.job_completion_conflict");
  }
  recent(shop: string): CloudCampaignJob[] { return this.#db.prepare(`SELECT ${columns} FROM cloud_campaign_jobs WHERE shop=? ORDER BY created_at DESC,id DESC LIMIT 20`).all(shopDomainSchema.parse(shop)).map(row => this.#decode(row)); }
  product(shop: string, campaign: string): CampaignProductSnapshot | null {
    const row = this.#db.prepare("SELECT product_json FROM cloud_campaign_jobs WHERE shop=? AND campaign_id=? ORDER BY created_at,id LIMIT 1").get(shopDomainSchema.parse(shop), z.string().min(1).parse(campaign));
    return row ? campaignProductSnapshot.nullable().parse(parseApplicationJson(z.string().parse(row.product_json))) : null;
  }
  keywords(shop: string, key: string): unknown | null {
    const row = this.#db.prepare("SELECT json_extract(keyword_cache_json,'$.keywords') AS keywords FROM cloud_campaign_jobs WHERE shop=? AND json_extract(keyword_cache_json,'$.key')=? ORDER BY created_at DESC LIMIT 1").get(shopDomainSchema.parse(shop), key);
    return row ? parseApplicationJson(z.string().parse(row.keywords)) : null;
  }
  saveKeywords(shop: string, id: string, key: string, keywords: unknown): void {
    const result = this.#db.prepare("UPDATE cloud_campaign_jobs SET keyword_cache_json=? WHERE shop=? AND id=? AND state='running'").run(stringifyApplicationJson({ key, keywords }), shopDomainSchema.parse(shop), z.uuid().parse(id));
    if (result.changes !== 1) throw new Error("cloud.keyword_job_changed");
  }
  recover(): void { this.#db.prepare("UPDATE cloud_campaign_jobs SET state='interrupted',phase='interrupted',error_code='cloud.service_restarted',updated_at=? WHERE state='running'").run(Date.now()); }
  removeShop(shop: string): void { this.#db.prepare("DELETE FROM cloud_campaign_jobs WHERE shop=?").run(shopDomainSchema.parse(shop)); }
}
