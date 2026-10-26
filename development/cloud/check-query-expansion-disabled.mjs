import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openCloudStorage } from '../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopRuntimeRegistry } from '../../onecrew_lite-app/src/cloud/shop-runtime-registry.ts';
import { ShopDataService } from '../../onecrew_lite-app/src/cloud/shop-data.ts';
import { DiscoveryQueryRoundExecutor } from '../../onecrew_lite-app/src/discovery/query-round-execution.ts';

const [inputDirectory, campaign] = process.argv.slice(2);
assert.ok(inputDirectory && campaign, '请提供真实任务数据目录和 Campaign ID');
const directory = resolve(inputDirectory);
const metadata = new DatabaseSync(join(directory, 'cloud.sqlite'), { readOnly: true });
const shops = metadata.prepare('SELECT shop FROM shopify_installations WHERE uninstalled_at IS NULL').all();
metadata.close();
assert.equal(shops.length, 1);
await using resources = new AsyncDisposableStack();
const storage = await openCloudStorage(directory);
resources.defer(() => storage.close());
const runtimes = new ShopRuntimeRegistry();
resources.defer(() => runtimes.close());
const data = await new ShopDataService(storage.lease, storage.installations, runtimes).resolve(shops[0].shop);
const repositories = data.databases.discoveryResolver();
const { repository } = await repositories.resolve(data.runtime.context);
const before = repository.getPlan(campaign);
assert.equal(before.criteria.automatic_query_expansion, false);
// 没有注入平台或模型依赖；关闭的自动扩词应只读取真实任务，不请求外部工作。
assert.equal(await new DiscoveryQueryRoundExecutor(data.runtime.accounts, repositories).expand(data.runtime.context, campaign, before.revision), false);
assert.deepEqual(repository.getPlan(campaign), before);
console.info(JSON.stringify({ event: 'cloud.disabled_query_expansion_verified', campaign, usedCalls: before.used_calls, modelCalled: false, platformCalled: false, planUnchanged: true }));
