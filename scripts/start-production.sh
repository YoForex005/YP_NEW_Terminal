#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/yopips-terminal/current

if [[ ! -f .env.production ]]; then
  echo "Missing /opt/yopips-terminal/current/.env.production" >&2
  exit 1
fi

# api.yopips.com is a dead Cloudflare tunnel. Point every origin at the live API
# before the process reads env so session exchange cannot inherit HTTP 530.
sed -i \
  -e 's#https://api.yopips.com#https://backend.yopips.com#g' \
  -e 's#http://api.yopips.com#https://backend.yopips.com#g' \
  -e 's#wss://api.yopips.com#wss://backend.yopips.com#g' \
  -e 's#ws://api.yopips.com#wss://backend.yopips.com#g' \
  -e 's#https://backend.yopips.com/docs#https://backend.yopips.com#g' \
  -e 's#wss://backend.yopips.com/docs#wss://backend.yopips.com#g' \
  .env.production
chmod 0600 .env.production || true

set -a
# shellcheck disable=SC1091
source .env.production
set +a

export NODE_ENV=production
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3012}"

exec node server.mjs --prod
