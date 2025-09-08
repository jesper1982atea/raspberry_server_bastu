#!/usr/bin/env bash
set -euo pipefail

# Enkel installerare för Raspberry Pi (Debian-baserad)
# - Installerar Node.js om saknas
# - Installerar npm-dependencies
# - Sätter upp systemd-tjänst som startar vid boot

SERVICE_NAME=raspberry-bastu
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
ENV_FILE=/etc/${SERVICE_NAME}.env

SCRIPT_DIR="$(cd \"$(dirname \"$0\")\" && pwd)"
REPO_ROOT="$(cd \"${SCRIPT_DIR}/..\" && pwd)"
echo "==> Repo-rot: ${REPO_ROOT}"
cd "${REPO_ROOT}"
WORKDIR="${REPO_ROOT}"

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

echo "==> Säkerställer lokal .env"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "PORT=${PORT:-5000}" >> .env
    echo "NODE_ENV=production" >> .env
    echo "==> Skapade .env från .env.example (lägg in API_KEY m.m.)"
  else
    echo "PORT=5000" > .env
    echo "NODE_ENV=production" >> .env
    echo "==> Skapade minimal .env (lägg in API_KEY m.m.)"
  fi
fi

echo "==> Skapar/uppdaterar system-env i ${ENV_FILE}"
if [ ! -f "${ENV_FILE}" ]; then
  if [ -f .env ]; then
    sudo cp .env "${ENV_FILE}"
  else
    sudo cp .env.example "${ENV_FILE}" 2>/dev/null || echo "PORT=5000" | sudo tee "${ENV_FILE}" >/dev/null
  fi
  echo "==> Redigera ${ENV_FILE} och sätt API_KEY m.m."
else
  echo "==> System-env finns redan: ${ENV_FILE} (hoppar över kopiering)"
fi

echo "==> Installerar systemd service till ${SERVICE_FILE}"
if [ ! -f "${REPO_ROOT}/systemd/raspberry-bastu.service" ]; then
  echo "!! Kunde inte hitta systemd/raspberry-bastu.service i ${REPO_ROOT}" >&2
  echo "   Kontrollera att du kör scriptet i rätt repo och att filen finns." >&2
  exit 1
fi
TMP_SERVICE=$(mktemp)
cp "${REPO_ROOT}/systemd/raspberry-bastu.service" "$TMP_SERVICE"
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
