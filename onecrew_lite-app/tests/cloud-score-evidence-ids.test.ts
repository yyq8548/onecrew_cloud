import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { compactScoreProposalForEvidence } from "../src/discovery/score-evidence.ts";
import { cloudKolCriteria } from "../src/cloud/campaign-planner.ts";

// 只验证输出合同，输入不代表模型判断或平台证据。
const finding = { outcome: "insufficient" as const, rationale: "合同检查", evidence_ids: ["e1"] };
const input = { selection: finding, quality: { ...finding, score: null }, language_only_pending: false, requirements: [{ ...finding, index: 0 }] };
const schema = compactScoreProposalForEvidence([{ id: "e1" }, { id: "e2" }], input.requirements);

test("Cloud score fields only accept the candidate's saved evidence IDs", () => {
  assert.deepEqual(schema.parse(input), input);
  assert.equal(schema.safeParse({ ...input, selection: { ...finding, evidence_ids: ["e1", "e2", "e1"] } }).success, false);
  for (const invalid of ["local-product-input", "shopify-product-snapshot", "e3"]) {
    assert.equal(schema.safeParse({ ...input, selection: { ...finding, evidence_ids: [invalid] } }).success, false);
    assert.equal(schema.safeParse({ ...input, quality: { ...input.quality, evidence_ids: [invalid] } }).success, false);
    assert.equal(schema.safeParse({ ...input, requirements: [{ ...input.requirements[0], evidence_ids: [invalid] }] }).success, false);
  }
  assert.equal(schema.safeParse({ ...input, quality: { ...finding, outcome: "supported", score: 85 } }).success, true);
  assert.equal(schema.safeParse({ ...input, quality: { ...finding, outcome: "supported", score: 85, evidence_ids: ["local-product-input"] } }).success, false);
});

test("correction schemas retain the evidence restriction and empty evidence permits no IDs", () => {
  assert.equal(schema.pick({ requirements: true }).safeParse({ requirements: [{ ...input.requirements[0], evidence_ids: ["local-product-input"] }] }).success, false);
  assert.equal(schema.omit({ requirements: true }).safeParse({ selection: finding, quality: { ...input.quality, evidence_ids: ["local-product-input"] }, language_only_pending: false }).success, false);
  const empty = compactScoreProposalForEvidence([], []);
  assert.equal(empty.safeParse(input).success, false);
  assert.equal(empty.safeParse({ selection: { ...finding, evidence_ids: [] }, quality: { ...input.quality, evidence_ids: [] }, requirements: [], language_only_pending: false }).success, true);
});

test("Cloud rejects the extra requirement returned by the real 4B model", async () => {
  // 保存自 cloud-metal-v11-related.log 的真实响应；原任务只有一条商品相关性条件。
  const response = JSON.parse(await readFile(new URL("./fixtures/cloud-score/extra-requirement.json", import.meta.url), "utf8"));
  const criteria = cloudKolCriteria({ platforms: ["youtube"], min_followers: 500000, max_followers: 600000, target_count: 10 });
  const result = compactScoreProposalForEvidence([{ id: "e1" }, { id: "e2" }, { id: "e3" }], criteria.requirements).safeParse(response);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some(issue => issue.path[0] === "requirements"));
});
