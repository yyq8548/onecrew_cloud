import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { openCloudStorage } from '../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopRuntimeRegistry } from '../../onecrew_lite-app/src/cloud/shop-runtime-registry.ts';
import { ShopDataService } from '../../onecrew_lite-app/src/cloud/shop-data.ts';
import { openCloudLibrary, ShopLibraryService } from '../../onecrew_lite-app/src/cloud/shop-library.ts';
import { ShopBrowserManager } from '../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { CloudCampaignService } from '../../onecrew_lite-app/src/cloud/campaign-service.ts';
import { shopifyProductSnapshot } from '../../onecrew_lite-app/src/cloud/campaign-jobs.ts';
import { ServerSemanticClient } from '../../onecrew_lite-app/src/discovery/server-semantic-client.ts';
import { parseApplicationJson, stringifyApplicationJson } from '../../onecrew_lite-contracts/src/json.ts';
import { campaignJobStatus } from '../../onecrew_lite-web/src/cloud/campaign-contracts.ts';

const { Session } = createRequire(new URL('../../onecrew_lite-app/package.json', import.meta.url))('@shopify/shopify-api');
const [dataDirectory, productFile] = process.argv.slice(2);
assert.ok(dataDirectory && productFile, '用法：node development/cloud/check-campaign.mjs <独立数据目录> <已保存的真实 Shopify 商品快照 JSON>');
const directory = resolve(dataDirectory), origin = 'https://cloud.example.com';
// 复用已保存的真实商品快照；本脚本不验证 Shopify 网络读取和成员权限。
const product = shopifyProductSnapshot.parse(parseApplicationJson(await readFile(resolve(productFile), 'utf8')));
const loadSavedProduct = async productId => { assert.equal(productId, product.id); return product; };
const modelEndpoint = 'http://127.0.0.1:8789/v1/chat/completions';
// 验证真实停止的模型服务故障，不启动替代响应服务器。
await assert.rejects(fetch('http://127.0.0.1:8789/health'), error => error instanceof TypeError && error.cause?.code === 'ECONNREFUSED');
const shop = `campaign-${randomBytes(4).toString('hex')}.myshopify.com`, id = randomUUID();
await using ownership = new AsyncDisposableStack();
const storage = await openCloudStorage(directory, true);
ownership.defer(() => storage.close());
const browsers = new ShopBrowserManager({ dataDirectory: directory, image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.installations, storage.browserSnapshots);
ownership.defer(() => browsers.close());
const tables = await openCloudLibrary(storage.lease, origin);
ownership.defer(() => tables.close());
const runtimes = new ShopRuntimeRegistry();
ownership.defer(() => runtimes.close());
// Session 仅用于本地存储归属；不代表真实 Shopify 安装验收。
storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') }), 0);
const data = new ShopDataService(storage.lease, storage.installations, runtimes), failures = [], fatal = [];
const service = new CloudCampaignService({ data, installations: storage.installations, jobs: storage.campaignJobs, templates: storage.campaignTemplates, browsers, library: new ShopLibraryService(tables, data, origin), model: new ServerSemanticClient({ endpoint: modelEndpoint, model: 'onecrew-qwen3-4b-q4', revision: 'Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29', timeoutMs: 600000, maximumOutputTokens: 4096, maximumResponseBytes: 1048576 }), reportFailure: value => failures.push(value), onFatal: error => fatal.push(error) });
const input = { id, product_id: product.id, platforms: ['youtube'], min_followers: 10000, max_followers: 100000 };
const job = await service.create(shop, input, loadSavedProduct);
assert.equal(job.state, 'running');
const deadline = AbortSignal.timeout(180000);
let status;
do {
  await setTimeout(250, undefined, { signal: deadline });
  status = await service.status(shop, id);
} while (status.job.state === 'running');
assert.equal(status.job.state, 'failed');
assert.equal(status.job.error_code, 'semantic_unavailable');
assert.equal(status.job.phase, 'failed');
assert.equal(status.draft_progress, null);
assert.equal(status.campaign, null);
assert.equal(status.counts, null);
assert.equal(campaignJobStatus.parse(parseApplicationJson(stringifyApplicationJson(status))).job.phase, 'failed');
assert.equal((await service.create(shop, input, () => assert.fail('重复请求不应重新取商品'))).state, 'failed');
await assert.rejects(service.create(shop, { ...input, max_followers: 200000 }, () => assert.fail('冲突请求不应取商品')), /job_conflict/u);
assert.deepEqual(await service.recent(shop), [status.job]);
assert.deepEqual(fatal, []);
assert.equal(failures.length, 1);
const cancelledId = randomUUID();
await service.create(shop, { ...input, id: cancelledId }, loadSavedProduct);
await assert.rejects(service.cancelDraft('other.myshopify.com', cancelledId), /installation_required/u);
await service.cancelDraft(shop, cancelledId);
let cancelled;
do {
  await setTimeout(250, undefined, { signal: deadline });
  cancelled = await service.status(shop, cancelledId);
} while (cancelled.job.state === 'running');
assert.equal(cancelled.job.state, 'interrupted');
assert.equal(cancelled.job.error_code, 'cloud.job_cancelled');
assert.equal(cancelled.campaign, null);
assert.equal((await service.cancelDraft(shop, cancelledId)).error_code, 'cloud.job_cancelled');
assert.equal(storage.campaignJobs.busy(shop), false);
assert.equal(failures.length, 1);
const resumedId = randomUUID();
await service.create(shop, { ...input, id: resumedId }, loadSavedProduct);
let resumed;
do {
  await setTimeout(250, undefined, { signal: deadline });
  resumed = await service.status(shop, resumedId);
} while (resumed.job.state === 'running');
assert.equal(resumed.job.state, 'failed');
assert.equal(resumed.job.error_code, 'semantic_unavailable');
assert.equal(failures.length, 2);
await ownership.disposeAsync();
const reopened = await openCloudStorage(directory);
try {
  reopened.campaignJobs.recover();
  const persisted = reopened.campaignJobs.get(shop, id);
  assert.equal(persisted.state, 'failed');
  assert.equal(persisted.error_code, 'semantic_unavailable');
  assert.equal(reopened.campaignJobs.busy(shop), false);
  assert.equal(reopened.campaignJobs.get(shop, cancelledId).error_code, 'cloud.job_cancelled');
  assert.equal(reopened.campaignJobs.get(shop, resumedId).error_code, 'semantic_unavailable');
  console.info(JSON.stringify({ event: 'cloud.campaign_failure_persisted', shop, jobId: id, cancelledJobId: cancelledId, actualBrowserCheck: true, modelConnectionRefused: true, errorCode: persisted.error_code, duplicateRequestReused: true, persistedAfterReopen: true, cancellationPersisted: true, newSearchAfterCancellation: true, browserContractDecoded: true, noPlanSaved: true, productSource: 'saved_snapshot', shopifyNetworkVerified: false }));
} finally { await reopened.close(); }
