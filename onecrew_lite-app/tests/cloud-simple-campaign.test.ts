import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCloudCampaign } from "../src/cloud/campaign-jobs.ts";
import { cloudCampaignConditions } from "../src/cloud/campaign-parameters.ts";
import { cloudKolPlan } from "../src/cloud/campaign-planner.ts";
import { cloudCampaignScoreInstructions } from "../src/cloud/campaign-scoring.ts";
import { discoveryCriteria } from "../src/discovery/contracts.ts";
import { assessDiscoveryProfile, discoveryScale, parseDiscoverySubscribers } from "../src/discovery/qualification.ts";

test("fixed KOL parameters require a product, supported unique platforms and a complete follower range", () => {
  const input = { id: randomUUID(), product_id: "gid://shopify/Product/1", platforms: ["youtube", "instagram"], min_followers: 10000, max_followers: 100000 };
  assert.equal(createCloudCampaign.parse(input).target_count, 10);
  for (const changes of [{ product_id: null }, { platforms: [] }, { platforms: ["facebook"] }, { platforms: ["youtube", "youtube"] }, { max_followers: 9999 }, { min_followers: -1 }, { target_count: 11 }, { brief: "改变目标" }]) assert.equal(createCloudCampaign.safeParse({ ...input, ...changes }).success, false);
});

test("keyword output cannot change fixed KOL conditions or add a platform", () => {
  // 手工合同输入，不代表 Shopify 商品读取或模型成功响应。
  const product = { id: "gid://shopify/Product/1", title: "保温水杯", description: "用于户外携带饮水。", onlineStoreUrl: null, updatedAt: "2026-10-23T00:00:00.000Z", captured_at: 1 };
  const conditions = cloudCampaignConditions.parse({ platforms: ["youtube"], min_followers: 10000, max_followers: 100000 });
  const keywords = { queries: [{ platform: "youtube", keywords: ["保温水杯测评"] }] };
  const plan = cloudKolPlan(randomUUID(), product, conditions, keywords);
  assert.equal(plan.target_count, 10);
  assert.equal(plan.criteria.min_subscribers, 10000);
  assert.equal(plan.criteria.max_subscribers, 100000);
  assert.equal(plan.criteria.requires_ai_tool_demo, false);
  assert.equal(plan.criteria.requires_public_tool_url, false);
  assert.equal(plan.criteria.automatic_query_expansion, false);
  assert.ok(plan.brief.includes(product.title));
  assert.ok(plan.brief.includes("真实内容证据"));
  const unreviewed = assessDiscoveryProfile(plan.criteria, {}, "unreviewed-range-input", 50000);
  assert.equal(unreviewed.verdict, "pending");
  assert.deepEqual(unreviewed.reasons, ["requirement_unverified"]);
  const scoreInput = { criteria: plan.criteria, approved_scopes: plan.scopes };
  assert.ok(cloudCampaignScoreInstructions(scoreInput));
  assert.equal(cloudCampaignScoreInstructions({ ...scoreInput, criteria: { ...plan.criteria, language: "英语" } }), null);
  assert.equal(cloudCampaignScoreInstructions({ ...scoreInput, approved_scopes: [{ ...plan.scopes[0]!, profile_ref: "other" }] }), null);
  assert.equal(cloudCampaignScoreInstructions({ ...scoreInput, approved_scopes: [{ ...plan.scopes[0]!, platform: "facebook" }] }), null);
  assert.deepEqual(plan.scopes, [{ platform: "youtube", profile_ref: "cloud", keywords: ["保温水杯测评"] }]);
  assert.throws(() => cloudKolPlan(randomUUID(), product, conditions, { queries: [{ platform: "instagram", keywords: ["保温水杯"] }] }));
  assert.throws(() => cloudKolPlan(randomUUID(), product, conditions, { ...keywords, target_count: 1 }));
  assert.throws(() => cloudKolPlan(randomUUID(), product, conditions, { queries: [{ platform: "youtube", keywords: ["Review", "review"] }] }));
});

test("follower ranges reject definite excess and retain uncertainty at rounded boundaries", () => {
  const criteria = { min_subscribers: 10000, max_subscribers: 100000, requires_ai_tool_demo: false, requires_public_tool_url: false };
  assert.equal(assessDiscoveryProfile(criteria, {}, "range-input", 10000).verdict, "qualified");
  assert.equal(assessDiscoveryProfile(criteria, {}, "range-input", 100000).verdict, "qualified");
  assert.deepEqual(assessDiscoveryProfile(criteria, {}, "range-input", 100001).reasons, ["above_max_subscribers"]);
  assert.deepEqual(assessDiscoveryProfile(criteria, {}, "range-input", 9999).reasons, ["below_min_subscribers"]);
  assert.equal(discoveryScale(criteria, parseDiscoverySubscribers("100K subscribers")).state, "unknown");
  assert.equal(discoveryScale(criteria, null).state, "unknown");
  assert.equal(discoveryScale({ max_subscribers: 0 }, { nominal: 0n, lower: 0n, upper: 0n }).state, "passed");
  assert.equal(discoveryScale({ max_subscribers: 0 }, { nominal: 1n, lower: 1n, upper: 1n }).state, "failed");
  assert.equal(discoveryCriteria.safeParse({ min_subscribers: 100, max_subscribers: 99 }).success, false);
  assert.equal(discoveryCriteria.safeParse({ max_subscribers: 100, max_followers: 200 }).success, false);
});
