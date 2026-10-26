FROM node:26.7.0-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.32.1
WORKDIR /opt/onecrew

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY onecrew_lite-contracts ./onecrew_lite-contracts
COPY onecrew_lite-app ./onecrew_lite-app
COPY onecrew_lite-library ./onecrew_lite-library
COPY onecrew_lite-web ./onecrew_lite-web
COPY development/schema-codegen ./development/schema-codegen

RUN pnpm --filter onecrew_lite-app... --filter onecrew-web... --filter '@teable/*...' install --frozen-lockfile
RUN pnpm --filter onecrew_lite_tables build:teable
RUN pnpm --filter onecrew_lite_tables build:server
RUN pnpm --filter onecrew-web build:cloud
COPY onecrew_lite-opencli ./onecrew_lite-opencli
COPY development/cloud/browser/seccomp-profile.json ./development/cloud/browser/seccomp-profile.json
RUN pnpm --filter onecrew_lite-app typecheck
RUN mkdir -p .scratch onecrew_lite-app/.scratch onecrew_lite-library/.scratch && chown node:node .scratch onecrew_lite-app/.scratch onecrew_lite-library/.scratch

USER node
WORKDIR /opt/onecrew/onecrew_lite-app
CMD ["sh", "-c", "node --test --test-concurrency=1 tests/cloud-*.test.ts"]
