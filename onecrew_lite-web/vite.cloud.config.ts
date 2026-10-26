import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'cloud-third-party-notices',
    generateBundle() {
      for (const name of ['LICENSE.MPL-2.0', 'LICENSE.BSD-2-Clause', 'LICENSE.BSD-3-Clause', 'LICENSE.OFL-1.1']) this.emitFile({ type: 'asset', fileName: `licenses/noVNC-${name}.txt`, source: readFileSync(new URL(`./node_modules/@novnc/novnc/docs/${name}`, import.meta.url), 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'licenses/NOTICE.txt', source: 'noVNC 1.7.0, unmodified source: https://github.com/novnc/noVNC/tree/v1.7.0\nCopyright and contributors: https://github.com/novnc/noVNC/blob/v1.7.0/AUTHORS\nLicensed under MPL-2.0 with bundled third-party BSD/OFL notices. Copies are in this directory.\n' });
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist-cloud', rollupOptions: { input: fileURLToPath(new URL('./cloud.html', import.meta.url)) } },
});
