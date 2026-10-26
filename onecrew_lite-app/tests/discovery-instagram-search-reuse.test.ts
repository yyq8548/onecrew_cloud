import assert from "node:assert/strict";
import { backup, DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { DiscoveryRepository } from "../src/discovery/repository.ts";
import { parseApplicationJson } from "../src/contracts/application-json.ts";
import { creatorSearchMaterial } from "../src/platforms/opencli/search-results.ts";

test("真实 Instagram 搜索与主页回执重放：首次评分已有命中原帖，保持来源绑定且不自动查联系页面", { skip: !process.env.ONECREW_RETAINED_SEARCH_DATABASE }, async () => {
  const sourceCampaign = process.env.ONECREW_RETAINED_SEARCH_CAMPAIGN!;
  assert.ok(sourceCampaign);
  using source = new DatabaseSync(process.env.ONECREW_RETAINED_SEARCH_DATABASE!, { readOnly: true });
  const directory = await mkdtemp(fileURLToPath(new URL("../../.scratch/search-reuse-", import.meta.url))), path = join(directory, "creator.sqlite");
  await backup(source, path);
  using db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON");
  const repository = new DiscoveryRepository(db), original = repository.getPlan(sourceCampaign), campaign = randomUUID();
  repository.create({ id: campaign, brief: original.brief, criteria: original.criteria, scopes: original.scopes, target_count: original.target_count, opencli_version: original.opencli_version });
  const plan = repository.getPlan(campaign); repository.approve(campaign, plan.revision);
  const search = repository.claimSearch(campaign, plan.revision, "instagram", "cloud");
  const captured = db.prepare(`SELECT h.id,h.source_url,h.title,h.author_label,m.material_json FROM discovery_search_hits h
    JOIN discovery_search_materials m ON m.search_hit_id=h.id WHERE h.discovery_campaign_id=? AND h.search_keyword=?`).all(sourceCampaign, search.query);
  assert.ok(captured.length > 0);
  repository.finishSearch(search, "completed", null, captured.map(row => ({ source_url: String(row.source_url), title: String(row.title), author_label: String(row.author_label), author_id: null, author_url: null, material: creatorSearchMaterial.parse(parseApplicationJson(String(row.material_json))) })));
  for (const row of captured) {
    const hit = db.prepare("SELECT id FROM discovery_search_hits WHERE discovery_campaign_id=? AND source_url=?").get(campaign, String(row.source_url))!;
    const observed = repository.getWebSource(sourceCampaign, String(row.id));
    assert.equal(observed.status, "completed");
    const claim = repository.claimWebSource(campaign, plan.revision, String(hit.id));
    repository.finishWebSource(claim, observed.native_material, null);
  }
  const rows = db.prepare(`SELECT h.id,m.material_json,c.native_content_json,c.status FROM discovery_search_hits h
    JOIN discovery_search_materials m ON m.search_hit_id=h.id
    JOIN discovery_content_reads c ON c.search_hit_id=h.id
    WHERE h.discovery_campaign_id=? AND h.platform='instagram'`).all(campaign);
  assert.ok(rows.length > 0, "需要已经完成的真实搜索原帖复用记录");
  for (const row of rows) {
    const post = creatorSearchMaterial.parse(parseApplicationJson(String(row.material_json))).instagram_post!;
    const content = z.record(z.string(), z.unknown()).parse(parseApplicationJson(String(row.native_content_json)));
    assert.ok(post);
    assert.equal(row.status, "completed");
    assert.equal(content.source_url, post.source_url);
    assert.equal(content.post_id, post.post_id);
    assert.equal(content.text, post.text);
    assert.equal(content.text_truncated, post.text_truncated);
    const material = repository.prepareReviewMaterial(campaign, plan.revision, String(row.id));
    assert.equal(material.native_profile?.profile_url, post.author_url);
    assert.equal(db.prepare("SELECT count(*) n FROM discovery_evidence_reviews WHERE discovery_campaign_id=? AND search_hit_id=?").get(campaign, String(row.id))!.n, 0, "首次评分前必须已经保留搜索原帖");
  }
  assert.equal(db.prepare("SELECT count(*) n FROM discovery_public_page_reads p JOIN discovery_candidates c ON c.id=p.candidate_id WHERE c.discovery_campaign_id=?").get(campaign)!.n, 0);
  const step = repository.planStep(campaign, plan.revision, [], [], { automaticPublicPages: false });
  assert.notEqual(step.kind, "read_public_page");
  assert.equal(repository.nextContentHit(campaign, "instagram"), null, "已保留搜索内容，不得再次读取最近帖子");
  console.info(JSON.stringify({ replayedSearchHits: captured.length, retainedPosts: rows.length, modelCalls: 0, browserReads: 0, originalDatabaseUnchanged: true }));
});
