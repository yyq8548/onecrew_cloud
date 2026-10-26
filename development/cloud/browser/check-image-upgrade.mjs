import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { dockerCommand } from '../../../onecrew_lite-app/src/cloud/docker-browser-client.ts';

const { Session } = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url))('@shopify/shopify-api');
const directory = resolve(process.argv[2]);
await using ownership = new AsyncDisposableStack();
const storage = await openCloudStorage(directory, true);
ownership.defer(() => storage.close());
const configuration = { dataDirectory: directory, seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') };
const previous = new ShopBrowserManager({ ...configuration, image: 'onecrew-cloud-browser:worker-previous' }, storage.installations, storage.browserSnapshots);
ownership.defer(() => previous.close());
const shop = `upgrade-${randomBytes(4).toString('hex')}.myshopify.com`;
// 本地 Session 只提供隔离归属；没有输入任何平台账号。
const workspace = storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') }), 0);
const signal = AbortSignal.timeout(240000);
let oldImage, newImage;
await previous.connect(workspace, 'youtube', signal, async container => {
  oldImage = (await dockerCommand(['inspect', container, '--format', '{{.Image}}'])).stdout.trim();
  await dockerCommand(['exec', container, 'touch', '/data/profile/cloud-upgrade-marker']);
});
await previous.close();
const saved = storage.installations.browserSnapshot(shop);
assert.ok(saved);
const current = new ShopBrowserManager({ ...configuration, image: 'onecrew-cloud-browser:worker' }, storage.installations, storage.browserSnapshots);
ownership.defer(() => current.close());
await current.connect(workspace, 'youtube', signal, async container => {
  newImage = (await dockerCommand(['inspect', container, '--format', '{{.Image}}'])).stdout.trim();
  await dockerCommand(['exec', container, 'test', '-f', '/data/profile/cloud-upgrade-marker']);
});
assert.notEqual(oldImage, newImage);
assert.ok(storage.installations.browserSnapshot(shop));
console.info(JSON.stringify({ event: 'cloud.browser_image_upgrade_verified', oldImage, newImage, encryptedProfileRestored: true }));
