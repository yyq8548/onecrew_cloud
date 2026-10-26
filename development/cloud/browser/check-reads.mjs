import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';
import { ShopBrowserManager } from '../../../onecrew_lite-app/src/cloud/shop-browser-manager.ts';
import { youtubeVideoId } from '../../../onecrew_lite-app/src/platforms/opencli/youtube.ts';

const { Session } = createRequire(new URL('../../../onecrew_lite-app/package.json', import.meta.url))('@shopify/shopify-api');
const directory = resolve(process.argv[2]);
const storage = await openCloudStorage(directory, true);
const manager = new ShopBrowserManager({ dataDirectory: directory, image: 'onecrew-cloud-browser:worker', seccompProfile: resolve('development/cloud/browser/seccomp-profile.json') }, storage.installations, storage.browserSnapshots);
const shop = `reads-${randomBytes(4).toString('hex')}.myshopify.com`;
// Session 只提供本地存储归属；全部页面数据由真实适配器读取。
const workspace = storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: '', isOnline: false, scope: 'read_products', accessToken: randomBytes(32).toString('hex') }), 0);
const signal = AbortSignal.timeout(360000);
try {
  const sources = await manager.read(workspace, { method: 'creatorSearchCapabilities', args: [] }, signal);
  assert.deepEqual(sources.map(source => source.platform).sort(), ['instagram', 'tiktok', 'twitter', 'youtube']);
  const hits = await manager.search(workspace, { platform: 'youtube', query: 'skincare', limit: 2 }, signal);
  assert.equal(hits.length, 2);
  const selected = hits.find(hit => hit.author_id?.startsWith('UC'));
  assert.ok(selected);
  const profile = await manager.read(workspace, { method: 'youtubeChannel', args: [selected.author_id] }, signal);
  assert.equal(profile.channel_id, selected.author_id);
  assert.ok(profile.name);
  console.info(JSON.stringify({ event: 'cloud.youtube_profile_verified', channelId: profile.channel_id, source: profile.url }));
  const videoId = youtubeVideoId(selected.source_url);
  const video = await manager.read(workspace, { method: 'youtubeVideoEvidence', args: [videoId] }, signal);
  assert.equal(video.videoId, videoId);
  assert.equal(video.channelId, selected.author_id);
  assert.equal(video.descriptionSource, 'ytInitialPlayerResponse.videoDetails.shortDescription');
  assert.ok(video.title);
  assert.equal(video.playabilityStatus, 'OK');
  console.info(JSON.stringify({ event: 'cloud.browser_reads_verified', platforms: sources.map(source => source.platform), channelId: profile.channel_id, videoSource: video.sourceUrl, descriptionBytes: Buffer.byteLength(video.description), descriptionSource: video.descriptionSource }));
} finally { await manager.close(); await storage.close(); }
