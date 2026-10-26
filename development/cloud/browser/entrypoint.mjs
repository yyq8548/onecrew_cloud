import { startBrowserWorker } from './browser-worker.mjs';

process.umask(0o077);
const shutdown = new AbortController();
let browser;
let stopped;
const close = () => stopped ??= browser?.close().then(() => undefined, () => {
  process.exitCode = 1;
  console.error(JSON.stringify({ event: 'cloud.browser_shutdown_failed' }));
});
const stop = () => { shutdown.abort(new Error('cloud.browser_stopping')); void close(); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
browser = await startBrowserWorker({
  dataDirectory: '/data', addonsDirectory: '/opt/onecrew/addons',
  chromiumPath: '/usr/lib/chromium/chromium', extensionDirectory: '/opt/opencli-source/extension-cloud-1',
  openCliScript: '/usr/local/lib/node_modules/@jackwener/opencli/dist/src/main.js',
  daemonScript: '/usr/local/lib/node_modules/@jackwener/opencli/dist/src/daemon.js',
}, shutdown.signal, process.env.ONECREW_BROWSER_START_COLD === '1').then(value => value, error => {
  const code = error.code === 'runtime.already_owned' ? error.code : /^(?:cloud\.|opencli_)[a-z_]{1,80}$/.test(error.message) ? error.message : 'cloud.browser_start_failed';
  console.error(JSON.stringify({ event: 'cloud.browser_start_failed', errorClass: error.name, code }));
  throw new Error('cloud.browser_start_failed');
});
console.info(JSON.stringify({ event: 'cloud.browser_worker_ready' }));
void browser.failed.then(error => {
  process.exitCode = 1;
  console.error(JSON.stringify({ event: error.message }));
  return close();
});
