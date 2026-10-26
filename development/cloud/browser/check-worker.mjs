import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

const container = process.argv[2];
if (!container) throw new Error('A test container name is required');
async function call(method, path, body) {
  const child = spawn('docker', ['exec', '-i', container, 'node', '/opt/onecrew/request.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = once(child, 'exit');
  child.stdin.end(JSON.stringify({ method, path, body }));
  let stdout = '';
  for await (const chunk of child.stdout) stdout += chunk;
  const [code] = await exited;
  const reply = JSON.parse(stdout);
  assert.equal(code, reply.status >= 400 ? 1 : 0);
  return reply;
}

const status = await call('GET', '/status');
assert.deepEqual(status.body.platforms, ['youtube', 'tiktok', 'instagram', 'twitter']);
const rejected = await call('POST', '/jobs', { id: randomUUID(), platform: 'facebook', query: 'skincare', limit: 2 });
assert.equal(rejected.status, 400);
const input = { id: randomUUID(), platform: 'youtube', query: 'skincare', limit: 2 };
assert.equal((await call('POST', '/jobs', input)).status, 202);
assert.equal((await call('POST', '/jobs', input)).status, 202);
const first = await call('GET', `/jobs/${input.id}`);
assert.equal(first.body.state, 'completed', JSON.stringify(first.body));
assert.equal(first.body.hits.length, 2);
const cancelled = { id: randomUUID(), platform: 'youtube', query: 'vitamin c skincare', limit: 50 };
assert.equal((await call('POST', '/jobs', cancelled)).status, 202);
const stopped = await call('POST', `/jobs/${cancelled.id}/cancel`);
assert.equal(stopped.body.state, 'cancelled', JSON.stringify(stopped.body));
const after = { ...input, id: randomUUID() };
assert.equal((await call('POST', '/jobs', after)).status, 202);
const resumed = await call('GET', `/jobs/${after.id}`);
assert.equal(resumed.body.state, 'completed', JSON.stringify(resumed.body));
assert.equal(resumed.body.hits.length, 2);
console.info(JSON.stringify({ event: 'cloud.browser_worker_verified', hits: first.body.hits.length, sample: first.body.hits[0].source_url, cancellation: stopped.body.state, resumedHits: resumed.body.hits.length }));
