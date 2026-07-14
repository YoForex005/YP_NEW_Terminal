#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_USER="${APP_USER:-yopips-terminal}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_ROOT="/opt/yopips-terminal"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git nginx certbot python3-certbot-nginx ufw fail2ban redis-server

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(`.`)[0]' 2>/dev/null || true)" != "24" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

npm install --global pm2

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG "$APP_USER" "$DEPLOY_USER"

if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" && -f "/home/$SUDO_USER/.ssh/authorized_keys" ]]; then
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "/home/$DEPLOY_USER/.ssh"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0600 \
    "/home/$SUDO_USER/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_ROOT" "$APP_ROOT/releases" "$APP_ROOT/shared"
install -o root -g root -m 0755 "$SCRIPT_DIR/deploy-release.sh" /usr/local/sbin/deploy-yopips-terminal

cat >/etc/sudoers.d/yopips-terminal-deploy <<EOF
$DEPLOY_USER ALL=($APP_USER) NOPASSWD: /usr/local/sbin/deploy-yopips-terminal
EOF
chmod 0440 /etc/sudoers.d/yopips-terminal-deploy
visudo -cf /etc/sudoers.d/yopips-terminal-deploy

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now nginx fail2ban redis-server

echo "Bootstrap complete. Next:"
echo "1. Add the CI public key to /home/$DEPLOY_USER/.ssh/authorized_keys."
echo "2. Put the existing env at $APP_ROOT/shared/.env.production with mode 0600."
echo "3. Configure DNS and issue the initial Let's Encrypt certificate."
