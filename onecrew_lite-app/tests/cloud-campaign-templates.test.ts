import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { cloudConditionsFromPlan } from "../src/cloud/campaign-parameters.ts";
import { parseApplicationJson, stringifyApplicationJson } from "../src/contracts/application-json.ts";
import { campaignTemplate } from "../../onecrew_lite-web/src/cloud/campaign-contracts.ts";

test("real template storage isolates stores, retains exact rules and reopens with its original plan", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "campaign-templates-")), directory = join(root, "private");
  const id = randomUUID(), source = randomUUID(), first = "first.myshopify.com", second = "second.myshopify.com";
  // 明确的手工需求输入，只验证存储和合同，不冒充模型结果或外部平台证据。
  const reference = { id: source, brief: "在 YouTube 寻找 10 位粉丝 10000 至 100000 的商品测评 KOL", opencli_version: "1.8.8", target_count: 10, scopes: [{ platform: "youtube", profile_ref: "cloud", keywords: ["商品测评"] }], criteria: { min_subscribers: 10000, max_subscribers: 100000 } };
  const conditions = { platforms: ["youtube"], min_followers: 10000, max_followers: 100000, target_count: 10 };
  const input = { id, name: "商品测评", campaign_id: source, expected_revision: 1 };
  try {
    const storage = await openCloudStorage(directory, true);
    try {
      for (const shop of [first, second]) storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" }), 0);
      const templates = storage.campaignTemplates, original = templates.save(first, input, reference);
      templates.save(second, { ...input, name: "另一个店铺的模板" }, reference);
      assert.deepEqual(templates.save(first, input, reference), original);
      assert.equal(templates.get(first, id)?.name, "商品测评");
      assert.equal(templates.get(second, id)?.name, "另一个店铺的模板");
      assert.equal(templates.get("unknown.myshopify.com", id), null);
      assert.throws(() => templates.save(first, { ...input, name: "修改名称" }, reference), /template_conflict/u);
      assert.throws(() => templates.save(first, { ...input, rules: "不同的 {{product.title}} 需求" }, reference));
      assert.throws(() => templates.save(first, { ...input, id: randomUUID(), rules: "没有商品参数" }, reference));
      assert.throws(() => templates.save(first, { ...input, id: randomUUID() }, { ...reference, id: randomUUID() }), /source_changed/u);
      const decoded = campaignTemplate.parse(parseApplicationJson(stringifyApplicationJson(original)));
      assert.equal(decoded.reference_plan.criteria.min_subscribers, 10000);
      assert.equal(decoded.reference_plan.criteria.max_subscribers, 100000);
      assert.deepEqual(decoded.conditions, conditions);
      assert.ok(decoded.rules.includes("{{product.title}}"));
      assert.deepEqual(templates.get(first, id), original);
      assert.deepEqual(storage.campaignJobs.recent(first), []);
      storage.installations.uninstall(second);
      assert.throws(() => templates.save(second, { ...input, id: randomUUID() }, reference), /installation_required/u);
    } finally { await storage.close(); }
    const reopened = await openCloudStorage(directory);
    try {
      assert.deepEqual(reopened.campaignTemplates.get(first, id)?.conditions, conditions);
      assert.equal(reopened.campaignTemplates.get(first, id)?.reference_plan.criteria.max_subscribers, 100000);
      assert.equal(reopened.campaignTemplates.reuse(first, input)?.id, id);
      assert.deepEqual(reopened.campaignTemplates.list(first).map(item => item.name), ["商品测评"]);
      assert.deepEqual(reopened.campaignTemplates.list(second).map(item => item.name), ["另一个店铺的模板"]);
    } finally { await reopened.close(); }
  } finally { await rm(root, { recursive: true }); }
});

test("legacy plans without the new follower range are preserved without inventing template conditions", () => {
  assert.equal(cloudConditionsFromPlan({ scopes: [{ platform: "youtube" }], criteria: { min_subscribers: 10000 }, target_count: 10 }), null);
  assert.equal(cloudConditionsFromPlan({ scopes: [{ platform: "youtube" }], criteria: { min_subscribers: 10000, max_subscribers: 1000 }, target_count: 10 }), null);
});
