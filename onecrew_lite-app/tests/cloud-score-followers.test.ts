import assert from "node:assert/strict";
import test from "node:test";
import { cloudKolCriteria } from "../src/cloud/campaign-planner.ts";
import { finalizeCloudCampaignScore } from "../src/cloud/campaign-scoring.ts";
import { discoveryMatchProposal } from "../src/discovery/semantic-match.ts";
import type { DiscoveryReviewMaterial } from "../src/discovery/review-material.ts";

// 纯条件合并的合同输入，不代表真实平台观察或模型调用。
const criteria = cloudKolCriteria({ platforms: ["youtube"], min_followers: 10000, max_followers: 100000, target_count: 10 });
const approved_scopes: DiscoveryReviewMaterial["approved_scopes"] = [{ platform: "youtube", profile_ref: "cloud", keywords: ["防晒"] }];
const material = { criteria, approved_scopes };
const proposal = discoveryMatchProposal.parse({
  selection: { criterion: "selection_fit", outcome: "supported", match_level: null, rationale: "条件合并输入", citations: [] },
  quality_rating: { criterion: "quality_rating", outcome: "insufficient", match_level: null, rationale: "条件合并输入", citations: [] },
  requirement_findings: [], language_only_pending: false,
});

test("Cloud follower merging includes exact bounds, rejects excess and preserves unknown counts", () => {
  for (const count of [10000, 50000, 100000]) assert.equal(finalizeCloudCampaignScore(material, count, proposal), proposal);
  for (const count of [9999, 100001]) {
    const result = finalizeCloudCampaignScore(material, count, proposal);
    assert.equal(result.selection.outcome, "contradicted");
    assert.equal(result.quality_rating, proposal.quality_rating);
    assert.equal(result.requirement_findings, proposal.requirement_findings);
  }
  assert.equal(finalizeCloudCampaignScore(material, null, proposal).selection.outcome, "insufficient");
  assert.equal(finalizeCloudCampaignScore({ ...material, native_followers: 100001n }, 50000, proposal).selection.outcome, "contradicted");
});

test("Cloud follower merging uses rounded bounds and never upgrades a content rejection", () => {
  const rounded = { ...material, native_follower_estimate: { display: "100K subscribers", nominal: 100000n, lower: 99500n, upper: 100500n } };
  assert.equal(finalizeCloudCampaignScore(rounded, 100000, proposal).selection.outcome, "insufficient");
  const knownFailure = { ...proposal, selection: { ...proposal.selection, outcome: "contradicted" as const } };
  assert.equal(finalizeCloudCampaignScore(material, null, knownFailure), knownFailure);
  assert.equal(finalizeCloudCampaignScore(material, 50000, knownFailure), knownFailure);
  const pending = { ...proposal, selection: { ...proposal.selection, outcome: "insufficient" as const } };
  assert.equal(finalizeCloudCampaignScore(material, 50000, pending), pending);
  assert.equal(finalizeCloudCampaignScore(material, 100001, pending).selection.outcome, "contradicted");
});

test("Cloud follower merging leaves legacy conditions and foreign profiles unchanged", () => {
  assert.equal(finalizeCloudCampaignScore({ ...material, criteria: {} }, null, proposal), proposal);
  assert.equal(finalizeCloudCampaignScore({ ...material, criteria: { ...criteria, language: "英语" } }, null, proposal), proposal);
  assert.equal(finalizeCloudCampaignScore({ ...material, approved_scopes: [{ ...approved_scopes[0]!, profile_ref: "other" }] }, null, proposal), proposal);
});
