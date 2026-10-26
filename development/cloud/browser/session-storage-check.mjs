import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Page } from '@jackwener/opencli/browser/page';

const [profile, operation, marker, expectedCookies] = process.argv.slice(2);
if (!profile || !['seed', 'retained', 'verify'].includes(operation) || !marker) throw new Error('A profile, operation and marker are required');
const page = new Page('onecrew-session-validation', undefined, profile, 'background');
await page.goto('https://www.youtube.com/', { settleMs: 200 });
const storage = 'onecrew-validation-session';
const fingerprint = cookie => ({ name: cookie.name, domain: cookie.domain, session: cookie.expirationDate === undefined, digest: createHash('sha256').update(JSON.stringify([cookie.domain, cookie.path, cookie.name, cookie.value])).digest('hex') });
let retainedCookies = expectedCookies === undefined ? [] : JSON.parse(expectedCookies);
async function verifyOtherPlatform() {
  assert.ok(Array.isArray(retainedCookies) && retainedCookies.length > 0);
  const actual = (await page.getCookies({ domain: 'instagram.com' })).map(fingerprint);
  const current = new Set(actual.map(cookie => cookie.digest));
  const missing = retainedCookies.filter(cookie => !current.has(cookie.digest));
  if (missing.length) console.error(JSON.stringify({ event: 'cloud.cookie_retention_mismatch', expected: retainedCookies.map(({ digest, ...cookie }) => cookie), actual: actual.map(({ digest, ...cookie }) => cookie), missing: missing.map(cookie => cookie.name) }));
  assert.equal(missing.length, 0, 'Actual Instagram cookies must be retained');
}
if (operation === 'seed') {
  await assert.rejects(page.cdp('Storage.clearDataForOrigin', { origin: 'https://www.youtube.com', storageTypes: 'all' }), /CDP method not permitted/);
  const cleanup = new Page('onecrew-cloud-session', undefined, profile, 'background', 'adapter', 'persistent', profile);
  const target = await cleanup.newTab();
  assert.equal(typeof target, 'string');
  cleanup.setActivePage(target);
  for (const params of [
    { origin: 'https://example.com', storageTypes: 'all' },
    { origin: 'https://youtube.com.example.com', storageTypes: 'all' },
    { origin: 'https://www.youtube.com:8443', storageTypes: 'all' },
    { origin: 'https://www.youtube.com', storageTypes: 'cookies' },
    { origin: 'https://www.youtube.com', storageTypes: 'all', extra: true },
  ]) await assert.rejects(cleanup.cdp('Storage.clearDataForOrigin', params), /CDP method not permitted/);
  await assert.rejects(cleanup.cdp('Network.clearBrowserCookies', {}), /CDP method not permitted/);
  await cleanup.closeTab();
  // 存储标记不是平台登录凭据；Cookie 使用网站实际设置的值。
  await page.evaluate(`(async () => {
    if (location.origin !== 'https://www.youtube.com') throw new Error('Unexpected validation origin');
    localStorage.setItem(${JSON.stringify(storage)}, ${JSON.stringify(marker)});
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(${JSON.stringify(storage)}, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onerror = () => reject(new Error('IndexedDB validation setup failed'));
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    return true;
  })()`);
  const youtubeCookies = await page.getCookies({ domain: 'youtube.com' });
  assert.ok(youtubeCookies.length > 0, 'Actual YouTube cookies are required');
  await page.goto('https://www.instagram.com/', { settleMs: 200 });
  await page.goto('https://www.google.com/', { settleMs: 200 });
  const googleCookies = await page.getCookies({ domain: 'google.com' });
  assert.equal([...googleCookies, ...youtubeCookies].some(cookie => cookie.httpOnly === true), true, 'A real provider HttpOnly cookie is required for this acceptance check');
  // 使用站点实际 Cookie 的摘要；Instagram 会自行删除未知人工 Cookie。
  retainedCookies = (await page.getCookies({ domain: 'instagram.com' })).map(fingerprint);
  assert.ok(retainedCookies.length > 0, 'Actual Instagram cookies are required');
} else if (operation === 'retained') {
  await verifyOtherPlatform();
  const cookies = [...await page.getCookies({ domain: 'youtube.com' }), ...await page.getCookies({ domain: 'google.com' })];
  assert.ok(cookies.some(cookie => cookie.httpOnly === true), 'Actual HttpOnly cookies must exist before cleanup');
  const retained = await page.evaluate(`(async () => ({ localStorage: localStorage.getItem(${JSON.stringify(storage)}) === ${JSON.stringify(marker)}, indexedDB: (await indexedDB.databases()).some(database => database.name === ${JSON.stringify(storage)}) }))()`);
  assert.equal(retained.localStorage, true);
  assert.equal(retained.indexedDB, true);
} else {
  await verifyOtherPlatform();
  const cleared = await page.evaluate(`(async () => {
    if (location.origin !== 'https://www.youtube.com') throw new Error('Unexpected validation origin');
    const databases = await indexedDB.databases();
    return { localStorage: localStorage.getItem(${JSON.stringify(storage)}) === null, indexedDB: !databases.some(database => database.name === ${JSON.stringify(storage)}) };
  })()`);
  assert.equal(cleared.localStorage, true);
  assert.equal(cleared.indexedDB, true);
}
await page.closeTab();
console.info(JSON.stringify({ operation, verified: true, retainedCookies }));
