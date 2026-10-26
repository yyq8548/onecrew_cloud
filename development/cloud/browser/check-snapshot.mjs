import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify, parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { openCloudStorage } from '../../../onecrew_lite-app/src/cloud/storage.ts';

const { values } = parseArgs({ options: { source: { type: 'string' }, target: { type: 'string' }, directory: { type: 'string' } } });
if (!values.source || !values.target || !values.directory || values.source === values.target) throw new Error('source, target and independent data directory are required');
const execute = promisify(execFile);
for (const container of [values.source, values.target]) {
  const state = await execute('docker', ['inspect', '--format', '{{.State.Running}}', container]);
  if (state.stdout.trim() !== 'false') throw new Error('Snapshot check requires stopped containers');
}
const successful = child => once(child, 'exit').then(([code]) => { if (code !== 0) throw new Error('Docker archive transfer failed'); });
const storage = await openCloudStorage(values.directory, true);
const owner = { shop: 'storage-contract.myshopify.com', tenant_id: randomUUID(), base_id: randomUUID() };
const signal = new AbortController().signal;
try {
  const source = spawn('docker', ['run', '--rm', '--volumes-from', `${values.source}:ro`, '--entrypoint', 'tar', 'onecrew-cloud-browser:linux-lifecycle', '-C', '/data', '--exclude=./profile/SingletonLock', '--exclude=./profile/SingletonCookie', '--exclude=./profile/SingletonSocket', '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const [snapshot] = await Promise.all([storage.browserSnapshots.save(owner, source.stdout, signal), successful(source)]);
  const target = spawn('docker', ['cp', '-a', '-', `${values.target}:/data`], { stdio: ['pipe', 'ignore', 'inherit'] });
  await Promise.all([storage.browserSnapshots.restoreTo(owner, snapshot.id, target.stdin, signal), successful(target)]);
  await writeFile(join(values.directory, 'check.json'), JSON.stringify({ source: values.source, target: values.target, owner, snapshot }, null, 2), { flag: 'wx', mode: 0o600 });
  console.info(JSON.stringify({ event: 'cloud.real_profile_snapshot_restored', encryptedBytes: snapshot.encryptedBytes }));
} finally { await storage.close(); }
