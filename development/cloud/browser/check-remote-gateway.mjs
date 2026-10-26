import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { RemoteBrowserGateway } from '../../../onecrew_lite-app/src/cloud/remote-browser-gateway.ts';

const require = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url));
const { Session } = require('@shopify/shopify-api');
const { WebSocket } = require('ws');
const directory = resolve(process.argv[2]);
const storage = await openCloudStorage(directory, true);
const browsers = new ShopBrowserManager({ dataDirectory: directory, image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.installations, storage.browserSnapshots);
const failures = [];
const origin = 'https://cloud.example.com';
const gateway = new RemoteBrowserGateway(storage.installations, browsers, origin, error => failures.push(error));
const server = createServer((_request, response) => response.end());
gateway.attach(server);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const base = `ws://127.0.0.1:${address.port}`;
// 此 Session 只作为本地存储归属输入，不代表 Shopify 身份验收。
const shop = `remote-${randomBytes(4).toString('hex')}.myshopify.com`;
const workspace = storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') }), 0);
function rejected(ticket, requestOrigin = origin) {
  return new Promise((resolve, reject) => {
    let expected = false;
    const socket = new WebSocket(base + ticket.path, ['binary', ticket.protocol], { origin: requestOrigin });
    socket.once('unexpected-response', (_request, response) => {
      expected = response.statusCode === 401;
      response.resume(); socket.terminate();
      if (expected) resolve(); else reject(new Error('Unexpected upgrade response'));
    });
    socket.once('open', () => { socket.terminate(); reject(new Error('Unauthorized remote connection accepted')); });
    socket.on('error', error => { if (!expected) reject(error); });
  });
}
try {
  await rejected({ path: '/connections/socket', protocol: `onecrew.${randomBytes(32).toString('hex')}` });
  await rejected(gateway.issue(workspace, 'member-1', 'instagram'), 'https://foreign.example.com');
  const ticket = gateway.issue(workspace, 'member-1', 'instagram');
  const socket = new WebSocket(base + ticket.path, ['binary', ticket.protocol], { origin });
  const bytes = await Promise.race([
    once(socket, 'message').then(([data]) => data),
    once(socket, 'close').then(() => { throw new Error('Remote stream closed before protocol header'); }),
  ]);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RFB ');
  socket.close();
  await once(socket, 'close');
  await browsers.closeShop(shop);
  await rejected(ticket);
  const revoked = gateway.issue(workspace, 'member-1', 'instagram');
  storage.installations.uninstall(shop);
  await rejected(revoked);
  assert.ok(storage.installations.browserSnapshot(shop));
  assert.deepEqual(failures, []);
  console.info(JSON.stringify({ event: 'cloud.remote_gateway_verified', realRfbStream: true, foreignOriginRejected: true, credentialSingleUse: true, uninstallRevokesAccess: true, encryptedProfileSaved: true }));
} finally {
  await gateway.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await browsers.close(); await storage.close();
}
