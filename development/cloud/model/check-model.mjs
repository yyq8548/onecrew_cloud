import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ServerSemanticClient } from '../../../onecrew_lite-app/src/discovery/server-semantic-client.ts';
import { DiscoverySemanticPlanner, loadBundledDiscoveryQueryGuidance, structuredSemanticSchema } from '../../../onecrew_lite-app/src/discovery/semantic-planner.ts';
import { CLOUD_PLATFORMS } from '../../../onecrew_lite-app/src/cloud/platforms.ts';
import { DiscoverySemanticError } from '../../../onecrew_lite-app/src/discovery/semantic-client.ts';

const { z } = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url))('zod');
const client = new ServerSemanticClient({ endpoint: 'http://127.0.0.1:8789/v1/chat/completions', model: 'onecrew-qwen3-4b-q4', revision: 'Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29', timeoutMs: 600000, maximumOutputTokens: 4096, maximumResponseBytes: 1024 * 1024 });
const signal = AbortSignal.timeout(900000);
const assertCurrent = async () => { signal.throwIfAborted(); };
const decode = z.strictObject({ platforms: z.array(z.enum(CLOUD_PLATFORMS)).length(4) });
const short = new ServerSemanticClient({ endpoint: 'http://127.0.0.1:8789/v1/chat/completions', model: 'onecrew-qwen3-4b-q4', revision: 'Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29', timeoutMs: 1, maximumOutputTokens: 128, maximumResponseBytes: 65536 });
await assert.rejects(short.structured({ prompt: 'Return the four platforms.', schema: structuredSemanticSchema(decode), decode, planning: true, signal, assertCurrent }), error => error instanceof DiscoverySemanticError && error.code === 'semantic_timeout');
console.info(JSON.stringify({ event: 'cloud.model_timeout_verified' }));
if (process.argv[2] === '--timeout-only') process.exit(0);
const usage = [], timings = [];
const started = performance.now();
const result = await client.structured({ prompt: 'Return exactly the four allowed platforms in this order: youtube, tiktok, instagram, twitter.', schema: structuredSemanticSchema(decode), decode, planning: true, signal, assertCurrent, onUsage: value => usage.push(value), onTiming: (phase, elapsedMs) => timings.push({ phase, elapsedMs }) });
assert.deepEqual(result.platforms, CLOUD_PLATFORMS);
console.info(JSON.stringify({ event: 'cloud.model_structured_verified', elapsedMs: Math.round(performance.now() - started), usage, timings }));
// 本地规划输入只验证现有规划器与真实模型，不代表已执行平台搜索或质量基准通过。
const brief = process.argv[2];
if (brief) {
  const planner = new DiscoverySemanticPlanner(client, await loadBundledDiscoveryQueryGuidance());
  const began = performance.now();
  const draft = await planner.prepare({ id: 'local-model-validation', brief, profile_ref: 'local-validation', opencli_version: '1.8.8' }, CLOUD_PLATFORMS.map(platform => ({ platform, registered: true, allowed_values: [] })), signal, assertCurrent, phase => console.info(JSON.stringify({ event: 'cloud.model_planning_phase', phase })));
  console.info(JSON.stringify({ event: 'cloud.model_existing_planner_verified', elapsedMs: Math.round(performance.now() - began), target_count: draft.target_count, platforms: draft.scopes.map(scope => scope.platform) }));
}
