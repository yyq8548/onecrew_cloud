FROM node:26.7.0-bookworm-slim AS browser-build
WORKDIR /build
RUN npm install --no-save --ignore-scripts esbuild@0.28.2 zod@4.6.5 semver@7.8.5 lossless-json@4.3.1 jsonc-parser@3.3.1 hono@4.13.8 @hono/node-server@2.1.1
COPY onecrew_lite-app/src ./src
COPY onecrew_lite-contracts ./node_modules/@onecrew/runtime-contracts
RUN ./node_modules/.bin/esbuild src/cloud/linux-browser-host.ts --bundle --platform=node --format=esm --main-fields=module,main --target=node26 --external:fs-native-extensions --banner:js='import { createRequire as __onecrewRequire } from "node:module"; const require = __onecrewRequire(import.meta.url);' --outfile=/build/linux-browser-host.mjs
RUN ./node_modules/.bin/esbuild src/cloud/browser-worker.ts --bundle --platform=node --format=esm --main-fields=module,main --target=node26 --external:fs-native-extensions --banner:js='import { createRequire as __onecrewRequire } from "node:module"; const require = __onecrewRequire(import.meta.url);' --outfile=/build/browser-worker.mjs

FROM node:26.7.0-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox xvfb x11-utils x11vnc novnc websockify git ca-certificates tini && rm -rf /var/lib/apt/lists/*
RUN npm install --global @jackwener/opencli@1.8.8
RUN npm install --prefix /opt/onecrew --save-exact fs-native-extensions@1.5.0 lossless-json@4.3.1
RUN git clone --depth 1 --branch v1.8.8 https://github.com/jackwener/opencli.git /opt/opencli-source && test -f /opt/opencli-source/extension/dist/background.js
COPY development/cloud/browser/opencli-session-cleanup.patch /opt/onecrew/patches/opencli-session-cleanup.patch
COPY development/cloud/browser/opencli-domain-cookie-cleanup.patch /opt/onecrew/patches/opencli-domain-cookie-cleanup.patch
COPY development/cloud/browser/tsconfig.opencli-build.json /opt/opencli-source/extension/tsconfig.cloud.json
RUN git -C /opt/opencli-source apply --check /opt/onecrew/patches/opencli-session-cleanup.patch && git -C /opt/opencli-source apply /opt/onecrew/patches/opencli-session-cleanup.patch && git -C /opt/opencli-source apply --check /opt/onecrew/patches/opencli-domain-cookie-cleanup.patch && git -C /opt/opencli-source apply /opt/onecrew/patches/opencli-domain-cookie-cleanup.patch && npm --prefix /opt/opencli-source/extension ci && npm --prefix /opt/opencli-source/extension run typecheck -- --project tsconfig.cloud.json && npm --prefix /opt/opencli-source/extension run build && rm -rf /opt/opencli-source/extension/node_modules
RUN mv /opt/opencli-source/extension /opt/opencli-source/extension-cloud-1
RUN usermod --home /data node && mkdir -p /data/profile /data/.opencli && chown -R node:node /data && chmod 700 /data /data/profile /data/.opencli

COPY development/cloud/browser/entrypoint.mjs /opt/onecrew/entrypoint.mjs
COPY development/cloud/browser/request.mjs /opt/onecrew/request.mjs
COPY development/cloud/browser/viewer.mjs /opt/onecrew/viewer.mjs
COPY --from=browser-build /build/linux-browser-host.mjs /opt/onecrew/linux-browser-host.mjs
COPY --from=browser-build /build/browser-worker.mjs /opt/onecrew/browser-worker.mjs
COPY --from=browser-build /build/node_modules/zod/LICENSE /opt/onecrew/licenses/zod/LICENSE
COPY --from=browser-build /build/node_modules/semver/LICENSE /opt/onecrew/licenses/semver/LICENSE
COPY --from=browser-build /build/node_modules/lossless-json/LICENSE.md /opt/onecrew/licenses/lossless-json/LICENSE.md
COPY --from=browser-build /build/node_modules/jsonc-parser/LICENSE.md /opt/onecrew/licenses/jsonc-parser/LICENSE.md
COPY --from=browser-build /build/node_modules/hono/LICENSE /opt/onecrew/licenses/hono/LICENSE
COPY --from=browser-build /build/node_modules/@hono/node-server/LICENSE /opt/onecrew/licenses/hono-node-server/LICENSE
COPY onecrew_lite-opencli /opt/onecrew/addons/
USER node
ENV DISPLAY=:99 OPENCLI_CONFIG_DIR=/data/.opencli
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/onecrew/entrypoint.mjs"]
