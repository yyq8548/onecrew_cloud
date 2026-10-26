import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { OpenCliError } from "../src/platforms/opencli/errors.ts";
import { cloudBrowserRead, browserJobInput, browserJobResult } from "../src/cloud/browser-operations.ts";
import { parseApplicationJson, stringifyApplicationJson } from "../src/contracts/application-json.ts";

test("cloud read boundary rejects unsupported platform selectors and arbitrary commands", () => {
  for (const read of [
    { method: "facebookPublicProfile", args: ["123"] },
    { method: "creatorProfileEvidence", args: ["facebook", "123", "https://www.facebook.com/123"] },
    { method: "checkCreatorAuthStatus", args: ["linkedin"] },
    { method: "nativeComments", args: [{ kind: "weibo_post", source: "123" }, 5] },
    { method: "youtubeChannel", args: ["UCtest"], argv: ["web", "read"] },
    { method: "youtubeChannel", args: ["UCtest", "--no-sandbox"] },
    { method: "readPublicWeb", args: ["https://example.com"] },
  ]) assert.equal(cloudBrowserRead.safeParse(read).success, false);
  assert.equal(browserJobInput.safeParse({ id: randomUUID(), platform: "youtube", query: "skincare", limit: 2, read: { method: "youtubeChannel", args: ["UCtest"] } }).success, false);
});

test("private public-page grants are outside the browser-facing read whitelist", () => {
  assert.equal(browserJobInput.safeParse({ id: randomUUID(), public_source: { url: "https://example.com", grant: "a".repeat(64) } }).success, true);
  assert.equal(browserJobInput.safeParse({ id: randomUUID(), public_source: { url: "https://example.com" } }).success, false);
  assert.equal(cloudBrowserRead.safeParse({ method: "readPublicWeb", args: ["https://example.com"], grant: "a".repeat(64) }).success, false);
});

test("the worker error envelope preserves original error identity and redacted diagnostics", () => {
  const original = new OpenCliError("opencli_invalid_output", 3, { stage: "youtube/read:decode", exit_code: 3, stdout: "Authorization: Bearer private-token", stderr: "Cookie: private-cookie" });
  const result = browserJobResult.parse(parseApplicationJson(stringifyApplicationJson({ id: randomUUID(), state: "failed", code: original.code, opencli: { code: original.code, exit_code: original.exitCode, diagnostics: original.diagnostics } })));
  assert.equal(result.state, "failed");
  if (result.state !== "failed" || !result.opencli) throw new Error("typed error missing");
  const restored = new OpenCliError(result.opencli.code, result.opencli.exit_code, result.opencli.diagnostics);
  assert.equal(restored.code, original.code);
  assert.equal(restored.exitCode, 3);
  assert.deepEqual(restored.diagnostics, original.diagnostics);
  assert.equal(stringifyApplicationJson(result).includes("private-token"), false);
  assert.equal(stringifyApplicationJson(result).includes("private-cookie"), false);
});

test("read result envelope keeps exact integer evidence through the inherited JSON codec", () => {
  const result = { id: randomUUID(), state: "completed", read: { method: "tiktokPublicProfile", data: { native_id: 18446744073709551615n } } };
  const restored = browserJobResult.parse(parseApplicationJson(stringifyApplicationJson(result)));
  assert.ok("read" in restored);
  assert.deepEqual(restored.read.data, result.read.data);
  assert.equal(browserJobResult.safeParse({ ...result, hits: [] }).success, false);
});
