#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/yopips-terminal/current

if [[ ! -f .env.production ]]; then
  echo "Missing /opt/yopips-terminal/current/.env.production" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.production
set +a

export NODE_ENV=production
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3012}"

exec node server.mjs --prod
