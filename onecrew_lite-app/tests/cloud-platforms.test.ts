import assert from "node:assert/strict";
import test from "node:test";
import { CLOUD_PLATFORMS, cloudCreatorSearchArguments } from "../src/cloud/platforms.ts";

test("cloud discovery exposes exactly the three approved platforms", () => {
  assert.deepEqual(CLOUD_PLATFORMS, ["youtube", "tiktok", "instagram"]);
  for (const platform of CLOUD_PLATFORMS) {
    const args = cloudCreatorSearchArguments("store-profile", { platform, query: "beauty", limit: 10 });
    assert.equal(args[1], "store-profile");
    assert.equal(args.at(-1), "beauty");
  }
  for (const platform of ["twitter", "x", "facebook", "linkedin", "bilibili", "douyin", "weibo", "google", "yahoo"]) {
    assert.throws(() => cloudCreatorSearchArguments("store-profile", { platform, query: "beauty", limit: 10 }));
  }
  assert.throws(() => cloudCreatorSearchArguments("store-profile", { platform: "instagram", query: "beauty", limit: 21 }));
});
