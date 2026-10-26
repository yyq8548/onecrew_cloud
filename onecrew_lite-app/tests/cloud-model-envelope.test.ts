import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { LosslessNumber, stringify } from "lossless-json";
import { parseApplicationJson } from "../src/contracts/application-json.ts";
import { parseServerSemanticCompletion } from "../src/discovery/server-semantic-client.ts";

// 原样保存本机 4B 的真实响应；后续变体只验证解析合同，不代表模型或平台观测。
const bytes = await readFile(new URL("./fixtures/cloud-score/model-envelope.json", import.meta.url));
const envelope = JSON.parse(bytes.toString("utf8"));
const encode = (value: unknown) => Buffer.from(stringify(value)!);

test("real 4B response retains content and integer usage", () => {
  const result = parseServerSemanticCompletion(bytes);
  assert.equal(result.choices[0]!.message.content, envelope.choices[0].message.content);
  assert.deepEqual(result.usage, { prompt_tokens: 158, completion_tokens: 38 });
  assert.deepEqual(parseApplicationJson(result.choices[0]!.message.content), JSON.parse(envelope.choices[0].message.content));
  assert.equal("timings" in result, false);
});

test("extra decimal metadata cannot invalidate otherwise valid completion", () => {
  for (const number of ["0.1234567890123456789", "1e-400", "1e400"]) {
    const input = encode({ ...envelope, timings: { ...envelope.timings, predicted_per_second: new LosslessNumber(number) } });
    assert.throws(() => parseApplicationJson(input), /cannot be represented without loss/u);
    assert.deepEqual(parseServerSemanticCompletion(input), parseServerSemanticCompletion(bytes));
  }
});

test("usage and completion status remain strict", () => {
  for (const usage of [-1, 1.5, new LosslessNumber("9007199254740993"), new LosslessNumber("0.1234567890123456789")]) {
    for (const field of ["prompt_tokens", "completion_tokens"]) {
      assert.throws(() => parseServerSemanticCompletion(encode({ ...envelope, usage: { ...envelope.usage, [field]: usage } })), /semantic_invalid_output/u);
    }
  }
  assert.throws(() => parseServerSemanticCompletion(encode({ ...envelope, choices: [{ ...envelope.choices[0], finish_reason: "length" }] })), /semantic_invalid_output/u);
  assert.throws(() => parseServerSemanticCompletion(encode({ ...envelope, choices: [] })), /semantic_invalid_output/u);
});

test("strict JSON, duplicate keys and invalid Unicode remain rejected", () => {
  const text = bytes.toString("utf8").trim();
  for (const input of [
    `{"choices":[],${text.slice(1)}`,
    `${text.slice(0, -1)},}`,
    `/* comment */${text}`,
    encode({ ...envelope, metadata: "\ud800" }),
    encode({ ...envelope, "\ud800": 1 }),
    Buffer.from([0xff]),
  ]) assert.throws(() => parseServerSemanticCompletion(typeof input === "string" ? Buffer.from(input) : input));
});

test("generated business JSON retains its original numeric checks", () => {
  const content = stringify({ value: new LosslessNumber("0.1234567890123456789") })!;
  const result = parseServerSemanticCompletion(encode({ ...envelope, choices: [{ ...envelope.choices[0], message: { content } }] }));
  assert.equal(result.choices[0]!.message.content, content);
  assert.throws(() => parseApplicationJson(result.choices[0]!.message.content), /cannot be represented without loss/u);
});
