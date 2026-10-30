#!/bin/zsh
set -euo pipefail

cd -- "${0:A:h}/../../.."

if ! docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  print -r -- 'cloud.startup: 正在启动 Docker Desktop'
  /usr/bin/open -gj -a Docker
  for attempt in {1..60}; do
    /bin/sleep 2
    if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
      break
    fi
    if (( attempt == 60 )); then
      print -u2 -r -- 'cloud.startup: Docker 在 120 秒内未就绪，网站未启动'
      exit 1
    fi
  done
fi

exec node --env-file=.env.cloud onecrew_lite-app/src/cloud/cli.ts serve
