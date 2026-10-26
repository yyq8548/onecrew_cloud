import assert from "node:assert/strict";
import test from "node:test";
import { CLOUD_PLATFORMS, cloudCreatorSearchArguments } from "../src/cloud/platforms.ts";

test("cloud discovery exposes exactly the four approved platforms", () => {
  assert.deepEqual(CLOUD_PLATFORMS, ["youtube", "tiktok", "instagram", "twitter"]);
  for (const platform of CLOUD_PLATFORMS) {
    const args = cloudCreatorSearchArguments("store-profile", { platform, query: "beauty", limit: 10 });
    assert.equal(args[1], "store-profile");
    assert.equal(args.at(-1), "beauty");
  }
  for (const platform of ["facebook", "linkedin", "bilibili", "douyin", "weibo", "google", "yahoo"]) {
    assert.throws(() => cloudCreatorSearchArguments("store-profile", { platform, query: "beauty", limit: 10 }));
  }
  assert.throws(() => cloudCreatorSearchArguments("store-profile", { platform: "instagram", query: "beauty", limit: 21 }));
});
