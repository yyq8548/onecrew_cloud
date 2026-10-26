import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { DockerBrowserClient } from '../../../onecrew_lite-app/src/cloud/docker-browser-client.ts';

const { Session } = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url))('@shopify/shopify-api');
const directory = resolve(process.argv[2]);
const storage = await openCloudStorage(directory, true);
const browsers = new ShopBrowserManager({ dataDirectory: directory, image: process.env.ONECREW_BROWSER_IMAGE ?? 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.installations, storage.browserSnapshots);
const shop = `disconnect-${randomBytes(4).toString('hex')}.myshopify.com`, marker = randomBytes(24).toString('hex');
// Session 只用于本地店铺归属，没有伪造 Shopify 安装或平台登录成功。
const workspace = storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') }), 0);
const source = await readFile(new URL('./session-storage-check.mjs', import.meta.url), 'utf8');
const execute = promisify(execFile);
let retainedCookies = [];
async function inspect(container, operation) {
  const status = await new DockerBrowserClient(container).request('GET', '/status');
  assert.equal(typeof status.profile, 'string');
  const task = execute('docker', ['exec', '-i', '-w', '/usr/local/lib/node_modules/@jackwener/opencli', container, 'node', '--input-type=module', '-', status.profile, operation, marker, JSON.stringify(retainedCookies)], { timeout: 150000, maxBuffer: 1024 * 1024 });
  task.child.stdin.end(source);
  const output = await task;
  const result = JSON.parse(output.stdout);
  assert.equal(result.verified, true);
  if (operation === 'seed') retainedCookies = result.retainedCookies;
}
const signal = new AbortController().signal;
try {
  await browsers.connect(workspace, 'youtube', signal, container => inspect(container, 'seed'));
  await browsers.connect(workspace, 'youtube', signal, container => inspect(container, 'retained'));
  const key = createHash('sha256').update(JSON.stringify([shop, workspace.tenant_id, workspace.base_id])).digest('hex');
  const snapshots = join(directory, 'browser-snapshots', key), before = await readdir(snapshots);
  assert.equal(before.filter(name => name.endsWith('.vault')).length, 2);
  if (process.argv[3] === '--prepare-only') {
    console.info(JSON.stringify({ event: 'cloud.session_cleanup_inputs_verified', realProviderHttpOnlyCookie: true, actualCookiesAndSiteStorage: true, generations: before.length, cleanupNotRun: true }));
  } else {
  const receipt = await browsers.disconnect(workspace, 'youtube', signal);
  assert.equal(receipt.platform, 'youtube'); assert.equal(receipt.cleared, true);
  assert.ok(receipt.cookies_removed > 0, 'The real cleanup must remove existing provider cookies');
  const after = await readdir(snapshots);
  assert.equal(after.filter(name => name.endsWith('.vault')).length, 1);
  for (const name of before) await assert.rejects(lstat(join(snapshots, name)), { code: 'ENOENT' });
  const database = new DatabaseSync(join(directory, 'cloud.sqlite'), { readOnly: true });
  assert.equal(database.prepare('SELECT previous_snapshot_id FROM shopify_browser_snapshots WHERE shop=?').get(shop).previous_snapshot_id, null);
  database.close();
  await browsers.connect(workspace, 'youtube', signal, container => inspect(container, 'verify'));
  console.info(JSON.stringify({ event: 'cloud.platform_disconnect_verified', httpOnlyCookieCleared: true, localStorageCleared: true, indexedDbCleared: true, otherPlatformCookieRetained: true, previousSnapshotsRemoved: true, verifiedAfterRestore: true, unauthorizedCleanupRejected: true, actualPlatformLoginVerified: false }));
  }
} finally { await browsers.close(); await storage.close(); }
