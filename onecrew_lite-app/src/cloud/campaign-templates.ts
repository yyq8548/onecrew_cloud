import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import { discoveryPlanInput } from "../discovery/contracts.ts";
import { campaignProductChoice } from "./campaign-jobs.ts";
import { CloudHttpError } from "./http-error.ts";
import { workspaceKeySchema as shopDomainSchema, workspaceTable } from "./workspaces.ts";
import { cloudCampaignConditions, cloudConditionsFromPlan } from "./campaign-parameters.ts";

export const PRODUCT_TITLE_PARAMETER = "{{product.title}}";
const rules = z.string().refine(value => value.isWellFormed() && value.includes(PRODUCT_TITLE_PARAMETER) && Buffer.byteLength(value) <= 4000);
export const saveCampaignTemplate = z.strictObject({
  id: z.uuid(), name: z.string().trim().min(1).refine(value => value.isWellFormed() && [...value].length <= 120 && !/\p{Cc}/u.test(value)),
  campaign_id: z.string().regex(/^[A-Za-z\d_-]{1,128}$/u), expected_revision: z.number().int().positive().max(4294967295),
});
export const generateFromTemplate = z.union(campaignProductChoice.options.map(option => option.extend({ id: z.uuid() })));
const summary = z.strictObject({ id: z.uuid(), shop: shopDomainSchema, name: z.string(), campaign_id: z.string(), expected_revision: z.number().int().positive(), rules, conditions: cloudCampaignConditions.nullable(), created_at: z.number().int() });
const template = summary.extend({ reference_plan: discoveryPlanInput });
export type CampaignTemplate = z.infer<typeof template>;
export type CampaignTemplateSummary = z.infer<typeof summary>;
const columns = "id,shop,name,campaign_id,expected_revision,rules,created_at";

export class CampaignTemplateStore {
  readonly #db: DatabaseSync;
  constructor(database: DatabaseSync) {
    this.#db = database;
    workspaceTable(database, "cloud_campaign_templates", `CREATE TABLE IF NOT EXISTS cloud_campaign_templates (
      id TEXT NOT NULL, shop TEXT NOT NULL REFERENCES cloud_workspaces(key), name TEXT NOT NULL,
      campaign_id TEXT NOT NULL, expected_revision INTEGER NOT NULL, rules TEXT NOT NULL,
      reference_plan_json TEXT NOT NULL CHECK(json_valid(reference_plan_json)), input_sha256 TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY(shop,id)
    ) STRICT;`);
  }
  #hash(input: z.infer<typeof saveCampaignTemplate>) { return createHash("sha256").update(stringifyApplicationJson(input)).digest("hex"); }
  #decode(row: Record<string, unknown>): CampaignTemplate {
    const { reference_plan_json, ...metadata } = row;
    const plan = discoveryPlanInput.parse(parseApplicationJson(z.string().parse(reference_plan_json)));
    return template.parse({ ...metadata, reference_plan: plan, conditions: cloudConditionsFromPlan(plan) });
  }
  get(shop: string, id: string): CampaignTemplate | null {
    shopDomainSchema.parse(shop); z.uuid().parse(id);
    const row = this.#db.prepare(`SELECT ${columns},reference_plan_json FROM cloud_campaign_templates WHERE shop=? AND id=?`).get(shop, id);
    return row ? this.#decode(row) : null;
  }
  reuse(shop: string, raw: unknown): CampaignTemplate | null {
    const input = saveCampaignTemplate.parse(raw), previous = this.get(shop, input.id);
    if (!previous) return null;
    if (this.#db.prepare("SELECT input_sha256 FROM cloud_campaign_templates WHERE shop=? AND id=?").get(shop, input.id)?.input_sha256 !== this.#hash(input)) throw new CloudHttpError("cloud.template_conflict", 409);
    return previous;
  }
  save(shop: string, raw: unknown, reference: unknown): CampaignTemplate {
    shopDomainSchema.parse(shop);
    const input = saveCampaignTemplate.parse(raw), plan = discoveryPlanInput.parse(reference);
    if (plan.id !== input.campaign_id) throw new Error("cloud.template_source_changed");
    const conditions = cloudConditionsFromPlan(plan);
    if (!conditions) throw new CloudHttpError("cloud.template_conditions_required", 409);
    const previous = this.reuse(shop, input);
    if (previous) return previous;
    const inserted = this.#db.prepare(`INSERT INTO cloud_campaign_templates (id,shop,name,campaign_id,expected_revision,rules,reference_plan_json,input_sha256,created_at)
      SELECT ?,key,?,?,?,?,?,?,? FROM cloud_active_workspaces WHERE key=?`).run(input.id, input.name, input.campaign_id, input.expected_revision, `商品：${PRODUCT_TITLE_PARAMETER}；平台：${conditions.platforms.join("、")}；粉丝范围：${conditions.min_followers}–${conditions.max_followers}；目标：${conditions.target_count} 位 KOL。`, stringifyApplicationJson(plan), this.#hash(input), Date.now(), shop);
    if (inserted.changes !== 1) throw new CloudHttpError("shopify.installation_required", 409);
    return this.get(shop, input.id)!;
  }
  list(shop: string): CampaignTemplateSummary[] {
    return this.#db.prepare(`SELECT ${columns},reference_plan_json FROM cloud_campaign_templates WHERE shop=? ORDER BY created_at DESC,id DESC`).all(shopDomainSchema.parse(shop)).map(row => { const { reference_plan, ...value } = this.#decode(row); return value; });
  }
  removeShop(shop: string): void { this.#db.prepare("DELETE FROM cloud_campaign_templates WHERE shop=?").run(shopDomainSchema.parse(shop)); }
}
