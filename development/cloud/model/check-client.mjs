import assert from 'node:assert/strict';
import { ServerSemanticClient } from '../../../onecrew_lite-app/src/discovery/server-semantic-client.ts';

export const checkModelRuntime = process.env.ONECREW_MODEL_RUNTIME ?? 'linux-cpu';
assert.ok(['linux-cpu', 'macos-metal'].includes(checkModelRuntime), 'ONECREW_MODEL_RUNTIME 必须为 linux-cpu 或 macos-metal');
export const checkModelSize = process.env.ONECREW_MODEL_SIZE ?? '4b';
assert.ok(['4b', '8b'].includes(checkModelSize), 'ONECREW_MODEL_SIZE 必须为 4b 或 8b');
const weights = checkModelSize === '4b' ? 'Qwen-bc640142-Q4_K_M:7485fe6f' : 'Qwen-7c41481f-Q4_K_M:d98cdcbd';
export const checkModelRevision = `${weights}:${checkModelRuntime === 'linux-cpu' ? 'llama-8c74db29' : 'llama-c7fc509-macos-metal'}`;
export function createCheckModel() {
  return new ServerSemanticClient({ endpoint: 'http://127.0.0.1:8789/v1/chat/completions', model: `onecrew-qwen3-${checkModelSize}-q4`, revision: checkModelRevision, timeoutMs: 300000, maximumOutputTokens: 4096, maximumResponseBytes: 1024 * 1024 });
}
