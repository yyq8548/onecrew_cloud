import { request } from 'node:http';
import { parse, stringify } from 'lossless-json';

const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes > 16384) throw new Error('cloud.worker_input_too_large');
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!['GET', 'POST'].includes(input.method) || typeof input.path !== 'string' || !/^\/(?:status|pause|connect|disconnect|jobs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?)$/.test(input.path)) throw new Error('cloud.worker_request_invalid');
const response = await new Promise((resolve, reject) => {
  const operation = request({ socketPath: '/data/worker.sock', method: input.method, path: input.path, headers: { 'content-type': 'application/json' } }, resolve);
  operation.once('error', reject);
  operation.setTimeout(120000, () => operation.destroy(new Error('cloud.worker_request_timeout')));
  operation.end(input.body === undefined ? undefined : JSON.stringify(input.body));
});
const output = [];
bytes = 0;
for await (const chunk of response) {
  bytes += chunk.length;
  if (bytes > 4 * 1024 * 1024) throw new Error('cloud.worker_output_too_large');
  output.push(chunk);
}
console.info(stringify({ status: response.statusCode, body: parse(Buffer.concat(output).toString('utf8')) }));
if (response.statusCode >= 400) process.exitCode = 1;
