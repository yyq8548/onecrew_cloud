import assert from 'node:assert/strict';
import { cloudKeywordRequest } from '../../../onecrew_lite-app/src/cloud/campaign-planner.ts';
import { cloudCampaignConditions } from '../../../onecrew_lite-app/src/cloud/campaign-parameters.ts';
import { createCheckModel, checkModelRuntime, checkModelRevision } from './check-client.mjs';

// 商品文字是明确的本地性能输入；仅检验真实模型调用，不代表 Shopify 商品或四平台验收。
const [title, description, selected = 'youtube'] = process.argv.slice(2);
assert.ok(title && description, '请传入商品标题和说明，可选第三参数为逗号分隔的平台');
const conditions = cloudCampaignConditions.parse({ platforms: selected.split(','), min_followers: 10000, max_followers: 100000 });
const signal = AbortSignal.timeout(300000);
const model = createCheckModel();
const started = performance.now(), usage = [];
const request = cloudKeywordRequest({ title, description }, conditions, signal, async () => { signal.throwIfAborted(); });
const output = await model.structured({ ...request, onUsage: value => usage.push(value) });
console.info(JSON.stringify({ event: 'cloud.short_keywords_verified', runtime: checkModelRuntime, revision: checkModelRevision, elapsedMs: Math.round(performance.now() - started), usage, platforms: conditions.platforms, output }));
