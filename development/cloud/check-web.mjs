import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { openCloudStorage } from '../../onecrew_lite-app/src/cloud/storage.ts';
import { startCloudApplication } from '../../onecrew_lite-app/src/cloud/application.ts';

const { load } = createRequire(new URL('../../onecrew_lite-app/package.json', import.meta.url))('cheerio');
const directory = resolve(process.argv[2]), webDirectory = resolve('onecrew_lite-web/dist-cloud');
const initialized = await openCloudStorage(directory, true); await initialized.close();
const failures = [];
const application = await startCloudApplication({ directory, webDirectory, port: 0, shopify: { apiKey: randomBytes(16).toString('hex'), apiSecretKey: randomBytes(32).toString('hex'), applicationUrl: 'https://cloud.example.com' }, reportFailure: value => failures.push(value), onUninstallFailure: value => failures.push(value), onBackgroundFailure: value => failures.push(value) });
try {
  const document = load(await readFile(resolve(webDirectory, 'cloud.html'), 'utf8'));
  assert.equal(document('meta[name="shopify-api-key"]').attr('content'), '__ONECREW_SHOPIFY_API_KEY__');
  for (const route of ['/', '/?shop=foreign.myshopify.com', '/api/search', '/api/connections']) assert.equal((await fetch(application.origin + route, { method: route.startsWith('/api/') ? 'POST' : 'GET' })).status, 401);
  const scripts = document('script[src^="/assets/"]').map((_index, node) => document(node).attr('src')).get();
  const styles = document('link[href^="/assets/"]').map((_index, node) => document(node).attr('href')).get();
  assert.ok(scripts.length && styles.length);
  for (const route of [...scripts, ...styles, '/licenses/NOTICE.txt', '/licenses/noVNC-LICENSE.MPL-2.0.txt']) {
    const response = await fetch(application.origin + route); assert.equal(response.status, 200, route); assert.ok((await response.arrayBuffer()).byteLength);
  }
  assert.equal((await fetch(application.origin + '/cloud.html')).status, 404);
  assert.deepEqual(failures, []);
  console.info(JSON.stringify({ event: 'cloud.web_assets_verified', realBuildAssetsServed: true, unsignedDocumentsRejected: true, unauthenticatedApisRejected: true, licensesIncluded: true }));
} finally { await application.close(); }
