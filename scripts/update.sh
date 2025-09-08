#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME=raspberry-bastu

# Hitta repo-rot
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"
echo "==> Repo-rot: ${REPO_ROOT}"

if command -v git >/dev/null 2>&1; then
  echo "==> Uppdaterar från git (pull --rebase)"
  git pull --rebase || true
else
  echo "==> git saknas, hoppar över pull"
fi

echo "==> Installerar npm-dependencies"
if [ -f package-lock.json ]; then
  npm ci --omit=dev || npm install --omit=dev
else
  npm install --omit=dev
fi

echo "==> Startar om tjänsten ${SERVICE_NAME}"
sudo systemctl restart ${SERVICE_NAME}
sleep 1
sudo systemctl --no-pager --full status ${SERVICE_NAME} || true

echo "==> Hälsokontroll"
PORT=${PORT:-$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo 5000)}
curl -fsS http://localhost:${PORT}/health || true

echo "==> Klart. Loggar: journalctl -u ${SERVICE_NAME} -f"

