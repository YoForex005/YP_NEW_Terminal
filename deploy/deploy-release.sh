#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/yopips-terminal"
ARCHIVE="${1:?Usage: deploy-release.sh <archive> <release-id>}"
RELEASE_ID="${2:?Usage: deploy-release.sh <archive> <release-id>}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"
ENV_FILE="$APP_ROOT/shared/.env.production"
PREVIOUS_TARGET=""

[[ -f "$ARCHIVE" ]] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Environment not found: $ENV_FILE" >&2; exit 1; }
[[ "$RELEASE_ID" =~ ^[a-f0-9]{7,40}$ ]] || { echo "Invalid release id" >&2; exit 1; }

# Production API is backend.yopips.com. api.yopips.com is a dead Cloudflare tunnel.
sed -i \
  -e 's#https://api.yopips.com#https://backend.yopips.com#g' \
  -e 's#http://api.yopips.com#https://backend.yopips.com#g' \
  -e 's#wss://api.yopips.com#wss://backend.yopips.com#g' \
  -e 's#ws://api.yopips.com#wss://backend.yopips.com#g' \
  -e 's#https://backend.yopips.com/docs#https://backend.yopips.com#g' \
  -e 's#wss://backend.yopips.com/docs#wss://backend.yopips.com#g' \
  "$ENV_FILE"
chmod 0600 "$ENV_FILE"

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

rollback() {
  if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
    ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
    cd "$CURRENT_LINK"
    pm2 startOrReload ecosystem.config.cjs --update-env || true
  fi
}
trap 'echo "Deployment failed; restoring previous release" >&2; rollback' ERR

rm -rf "$RELEASE_DIR"
install -d -m 0750 "$RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
ln -s "$ENV_FILE" "$RELEASE_DIR/.env.production"
cd "$RELEASE_DIR"

npm ci
npm run typecheck
npm run build

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
cd "$CURRENT_LINK"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3012/api/node-bridge/health >/dev/null; then
    trap - ERR
    find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
      | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
    echo "Release $RELEASE_ID deployed successfully."
    exit 0
  fi
  sleep 2
done

echo "Health check failed for release $RELEASE_ID" >&2
exit 1
