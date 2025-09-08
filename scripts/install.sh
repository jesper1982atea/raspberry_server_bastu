#!/usr/bin/env bash
set -euo pipefail

# Enkel installerare för Raspberry Pi (Debian-baserad)
# - Installerar Node.js om saknas
# - Installerar npm-dependencies
# - Sätter upp systemd-tjänst som startar vid boot

SERVICE_NAME=raspberry-bastu
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
ENV_FILE=/etc/${SERVICE_NAME}.env

echo "==> Arbetskatalog: $(pwd)"
WORKDIR="$(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installerar Node.js 18 (kräver sudo)"
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Node version: $(node -v)"

echo "==> Installerar npm-dependencies"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "==> Skapar/uppdaterar env-fil i ${ENV_FILE}"
if [ ! -f "${ENV_FILE}" ]; then
  sudo cp .env.example "${ENV_FILE}"
  echo "==> Redigera ${ENV_FILE} och sätt API_KEY m.m."
fi

echo "==> Installerar systemd service till ${SERVICE_FILE}"
TMP_SERVICE=$(mktemp)
cp systemd/raspberry-bastu.service "$TMP_SERVICE"
sudo cp "$TMP_SERVICE" "${SERVICE_FILE}"
sudo sed -i "s#^WorkingDirectory=.*#WorkingDirectory=${WORKDIR}#" "${SERVICE_FILE}"

RUN_USER="${SUDO_USER:-$USER}"
sudo sed -i "s#^User=.*#User=${RUN_USER}#" "${SERVICE_FILE}"

echo "==> Laddar om systemd och aktiverar tjänst"
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "==> Klart! Kolla status med: sudo systemctl status ${SERVICE_NAME}"
echo "==> Loggar: journalctl -u ${SERVICE_NAME} -f"
echo "==> OBS: Aktivera 1-wire på Pi (raspi-config > Interface Options > 1-Wire) och starta om om nödvändigt."

