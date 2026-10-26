import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { openCloudStorage } from "../src/cloud/storage.ts";

test("durable Campaign jobs isolate stores, reject changed replay and recover only unfinished work", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "campaign-jobs-")), directory = join(root, "private");
  try {
    const storage = await openCloudStorage(directory, true);
    const id = randomUUID(), first = "first.myshopify.com", second = "second.myshopify.com";
    try {
      for (const shop of [first, second]) storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" }), 0);
      const jobs = storage.campaignJobs;
      const input = { id, campaign_id: id, kind: "draft" as const, brief: "寻找护肤创作者", expected_revision: null, request: { id, brief: "寻找护肤创作者" }, product: null };
      const job = jobs.begin({ ...input, shop: first });
      jobs.begin({ ...input, brief: "寻找鞋类创作者", shop: second });
      assert.equal(jobs.get(first, id)?.brief, "寻找护肤创作者");
      assert.equal(jobs.get(second, id)?.brief, "寻找鞋类创作者");
      assert.equal(jobs.get("unknown.myshopify.com", id), null);
      assert.equal(jobs.reuse(first, id, input.request)?.id, job.id);
      assert.throws(() => jobs.reuse(first, id, { id, brief: "修改任务" }), /job_conflict/u);
      assert.throws(() => jobs.begin({ ...input, id: randomUUID(), shop: first }), /campaign_busy/u);
      jobs.phase(first, id, "planning");
      assert.equal(jobs.get(first, id)?.phase, "planning");
      jobs.finish(first, id, "completed", "finished");
      jobs.phase(first, id, "planning");
      assert.equal(jobs.get(first, id)?.phase, "finished");
      assert.throws(() => jobs.finish(first, id, "failed", "failed"), /completion_conflict/u);
      assert.equal(jobs.busy(first), false);
      assert.equal(jobs.busy(second), true);
      storage.installations.uninstall(first);
      assert.throws(() => jobs.begin({ ...input, id: randomUUID(), shop: first }), /installation_required/u);
    } finally { await storage.close(); }
    const reopened = await openCloudStorage(directory);
    try {
      reopened.campaignJobs.recover();
      assert.equal(reopened.campaignJobs.get(first, id)?.state, "completed");
      assert.equal(reopened.campaignJobs.get(second, id)?.state, "interrupted");
      assert.equal(reopened.campaignJobs.get(second, id)?.error_code, "cloud.service_restarted");
      assert.equal(reopened.campaignJobs.busy(second), false);
      assert.deepEqual(reopened.campaignJobs.recent(first).map(job => job.shop), [first]);
    } finally { await reopened.close(); }
  } finally { await rm(root, { recursive: true }); }
});
