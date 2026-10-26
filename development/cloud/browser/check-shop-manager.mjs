import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { dockerCommand, DockerBrowserClient } from '../../../onecrew_lite-app/src/cloud/docker-browser-client.ts';

const { Session } = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url))('@shopify/shopify-api');
const directory = resolve(process.argv[2]);
const configuration = { image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json'), dataDirectory: directory };
const marker = randomBytes(24).toString('hex');
const suffix = randomBytes(4).toString('hex');
let storage = await openCloudStorage(directory, true);
let manager = new ShopBrowserManager(configuration, storage.installations, storage.browserSnapshots);
const session = shop => new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') });
const first = storage.installations.install(session(`validation-${suffix}-a.myshopify.com`), 0);
const second = storage.installations.install(session(`validation-${suffix}-b.myshopify.com`), 0);
const input = { platform: 'youtube', query: 'skincare', limit: 2 };
const signal = new AbortController().signal;
async function containerFor(shop) {
  const found = await dockerCommand(['ps', '-a', '--filter', `label=onecrew.shop=${shop}`, '--format', '{{.ID}}']);
  const id = found.stdout.trim();
  return id ? { id, state: JSON.parse((await dockerCommand(['inspect', id, '--format', '{{json .}}'])).stdout) } : null;
}
async function waitFor(shop, condition) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const value = await containerFor(shop);
    if (value && await condition(value)) return value;
    await delay(100);
  }
  throw new Error('Real browser check did not reach expected state');
}
try {
  // Shopify 归属仅为本地存储输入；平台读取与容器、快照均使用真实实现。
  const searches = Promise.all([manager.search(first, input, signal), manager.search(second, input, signal)]);
  const live = await waitFor(first.shop, value => value.state.State.Running);
  await dockerCommand(['exec', live.id, 'node', '-e', 'require("node:fs").writeFileSync("/data/restore-check",process.argv[1])', marker]);
  const hits = await searches;
  assert.deepEqual(hits.map(rows => rows.length), [2, 2]);
  const initial = await containerFor(first.shop), other = await containerFor(second.shop);
  assert.notEqual(initial.id, other.id);
  for (const value of [initial, other]) {
    assert.equal(value.state.State.Running, false);
    assert.ok(value.state.HostConfig.Tmpfs['/data']);
    assert.equal(value.state.Mounts.some(mount => mount.Destination === '/data' && mount.Type === 'volume'), false);
  }
  assert.notEqual(storage.installations.browserSnapshot(first.shop), storage.installations.browserSnapshot(second.shop));
  console.info(JSON.stringify({ event: 'cloud.shop_browser_isolation_verified', stores: 2 }));
  await manager.close(); await storage.close();
  storage = await openCloudStorage(directory);
  manager = new ShopBrowserManager(configuration, storage.installations, storage.browserSnapshots);
  await manager.recover();
  const restored = manager.search(first, input, signal);
  const loaded = await waitFor(first.shop, async value => value.state.State.Running && (await dockerCommand(['exec', value.id, '/usr/bin/test', '-f', '/data/restore-check'], undefined, [0, 1])).code === 0);
  assert.equal((await dockerCommand(['exec', loaded.id, 'cat', '/data/restore-check'])).stdout, marker);
  assert.equal((await restored).length, 2);
  console.info(JSON.stringify({ event: 'cloud.shop_browser_restart_verified', restoredMarker: true }));
  const stopping = manager.search(first, { ...input, query: 'vitamin c skincare', limit: 50 }, signal).then(() => { throw new Error('Uninstall did not stop active work'); }, error => error);
  await waitFor(first.shop, async value => {
    if (!value.state.State.Running || (await dockerCommand(['exec', value.id, '/usr/bin/test', '-S', '/data/worker.sock'], undefined, [0, 1])).code !== 0) return false;
    return (await new DockerBrowserClient(value.id).request('GET', '/status')).active_job !== null;
  });
  storage.installations.uninstall(first.shop);
  await manager.closeShop(first.shop);
  const stopped = await stopping;
  assert.match(stopped.message, /cancelled|installation_changed/);
  assert.equal((await containerFor(first.shop)).state.State.Running, false);
  await assert.rejects(manager.search(first, input, signal), /installation_changed/);
  assert.equal((await manager.search(second, input, signal)).length, 2);
  console.info(JSON.stringify({ event: 'cloud.shop_browser_manager_verified', stores: 2, resultsPerStore: 2, restartRestoredMarker: true, uninstalledStoreStopped: true, otherStoreStillWorks: true }));
  const ownerKey = createHash('sha256').update(JSON.stringify([first.shop, first.tenant_id, first.base_id])).digest('hex');
  const otherSnapshot = storage.installations.browserSnapshot(second.shop);
  await assert.rejects(manager.removeShop(second.shop), /redaction_requires_uninstall/);
  await manager.removeShop(first.shop);
  await manager.removeShop(first.shop);
  assert.equal(await containerFor(first.shop), null);
  await assert.rejects(lstat(join(directory, 'browser-snapshots', ownerKey)), { code: 'ENOENT' });
  assert.equal(storage.installations.browserSnapshot(second.shop), otherSnapshot);
  assert.equal((await containerFor(second.shop)).id, other.id);
  assert.equal((await manager.search(second, input, signal)).length, 2);
  console.info(JSON.stringify({ event: 'cloud.shop_browser_redaction_verified', containerRemoved: true, allOwnerSnapshotsRemoved: true, otherStoreStillWorks: true, repeatSafe: true }));
} finally { await manager.close(); await storage.close(); }
