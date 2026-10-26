import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopRuntimeRegistry } from '../../../onecrew_lite-app/src/cloud/shop-runtime-registry.ts';
import { ShopDataService } from '../../../onecrew_lite-app/src/cloud/shop-data.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';

// 使用已完成真实搜索的本地验收目录；仅验证获准来源的网页读取，不声明模型评分通过。
assert.ok(process.argv[2], '请提供已保存真实搜索结果的 Cloud 数据目录');
const directory = resolve(process.argv[2]);
await using ownership = new AsyncDisposableStack();
const storage = await openCloudStorage(directory);
ownership.defer(() => storage.close());
const runtimes = new ShopRuntimeRegistry();
ownership.defer(() => runtimes.close());
const manager = new ShopBrowserManager({ dataDirectory: directory, image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.installations, storage.browserSnapshots);
ownership.defer(() => manager.close());
const metadata = new DatabaseSync(join(directory, 'cloud.sqlite'), { readOnly: true });
const shops = metadata.prepare('SELECT shop FROM shopify_installations WHERE uninstalled_at IS NULL').all();
metadata.close();
assert.equal(shops.length, 1);
const shop = shops[0].shop, campaign = 'cloud-live-search';
const data = new ShopDataService(storage.lease, storage.installations, runtimes);
const results = await data.results(shop, campaign, null, null);
assert.ok(results.candidates.length > 0);
const candidate = results.candidates[0];
const hit = results.hits.find(hit => candidate.evidence.source_urls.includes(hit.source_url));
assert.ok(hit, '公开来源必须来自本任务保存的真实搜索结果和候选证据');
const workspace = storage.installations.workspace(shop);
assert.ok(workspace);
let approvalChecks = 0;
const started = performance.now();
const page = await manager.readPublicWeb(workspace, {
  url: hit.source_url,
  async assertApproved() {
    const current = await data.results(shop, campaign, null, null);
    assert.equal(current.campaign.revision, results.campaign.revision);
    assert.ok(current.candidates.some(saved => saved.id === candidate.id && saved.evidence.source_urls.includes(hit.source_url)));
    assert.ok(current.hits.some(saved => saved.id === hit.id && saved.source_url === hit.source_url));
    approvalChecks++;
  },
}, AbortSignal.timeout(180000));
assert.equal(page.requested_url, hit.source_url);
assert.ok(page.document_url.startsWith('https://'));
assert.ok(page.title.length > 0);
assert.ok(page.markdown_excerpt.trim().length > 0);
assert.ok(approvalChecks >= 3);
console.info(JSON.stringify({ event: 'cloud.authorized_public_page_verified', source: page.requested_url, destination: page.document_url, markdownBytes: Buffer.byteLength(page.markdown_excerpt), truncated: page.truncated, approvalChecks, elapsedMs: Math.round(performance.now() - started) }));
