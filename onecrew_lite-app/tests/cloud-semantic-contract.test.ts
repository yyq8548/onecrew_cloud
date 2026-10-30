import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ServerSemanticClient, serverSemanticPayload, type ServerSemanticConfiguration } from "../src/discovery/server-semantic-client.ts";

const config: ServerSemanticConfiguration = { endpoint: "http://127.0.0.1:8080/v1/chat/completions", model: "Qwen3-8B", revision: "weights-and-prompt-v1", timeoutMs: 60000, maximumOutputTokens: 2048, maximumResponseBytes: 1024 * 1024 };

test("cloud model contract retains schema, rules and saved evidence", async () => {
  const decode = z.strictObject({ selected: z.boolean() });
  const schema = z.toJSONSchema(decode);
  const payload = serverSemanticPayload({ prompt: "Evaluate saved evidence", scoringContext: "Use only provided evidence", savedEvidence: [{ id: "source-1", citation: { url: "https://example.com" } }], schema, decode, planning: false, signal: new AbortController().signal, assertCurrent: async () => {} }, config);
  assert.deepEqual(payload.response_format.json_schema.schema, schema);
  assert.equal(payload.messages[0]!.content, "Use only provided evidence");
  const [prompt, evidence] = payload.messages[1]!.content.split("\nUNTRUSTED_SAVED_EVIDENCE:\n");
  assert.equal(prompt, "Evaluate saved evidence");
  assert.deepEqual(JSON.parse(evidence!), [{ id: "source-1", citation: { url: "https://example.com" } }]);
  const first = await new ServerSemanticClient(config).scoringIdentity();
  const changed = await new ServerSemanticClient({ ...config, revision: "weights-and-prompt-v2" }).scoringIdentity();
  assert.notEqual(first, changed);
});

test("model endpoint rejects embedded credentials, invalid protocols and invalid limits", () => {
  assert.throws(() => new ServerSemanticClient({ ...config, endpoint: "https://user:secret@example.com/v1/chat/completions" }), /endpoint_invalid/u);
  assert.throws(() => new ServerSemanticClient({ ...config, timeoutMs: 0 }));
  assert.throws(() => new ServerSemanticClient({ ...config, endpoint: "file:///model" }), /endpoint_invalid/u);
});
