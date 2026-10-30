import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, 'onecrew_lite-app/package.json'));
const { build } = require('esbuild');
const contractsRequire = createRequire(join(root, 'onecrew_lite-contracts/package.json'));
const stage = join(root, '.artifacts/cloud-login');
const assets = join(root, 'onecrew_lite-app/src/cloud/assets');
await mkdir(stage, { recursive: true });
await build({ entryPoints: [join(root, 'onecrew_lite-app/src/cloud/browser-worker.ts')], outfile: join(stage, 'browser-worker.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node26', alias: { 'jsonc-parser': contractsRequire.resolve('jsonc-parser/lib/esm/main.js') }, banner: { js: "import {createRequire as __onecrewRequire} from 'node:module'; const require = __onecrewRequire(import.meta.url);" }, logLevel: 'warning' });
for (const name of ['browser-request.mjs', 'browser-login-policy.json']) await copyFile(join(assets, name), join(stage, name));
await copyFile(join(assets, 'Dockerfile.login'), join(stage, 'Dockerfile'));
const result = await promisify(execFile)('docker', ['build', '--pull=false', '--network=none', '-t', process.argv[2] ?? 'onecrew-cloud-browser:login-form-20261028', stage], { maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
