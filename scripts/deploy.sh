#!/usr/bin/env bash
# Run on the VPS after the repo is cloned once.
#
# GitHub Actions secrets (Settings → Secrets → Actions):
#   VPS_HOST          — server hostname or IP
#   VPS_USERNAME      — SSH user (e.g. deploy)
#   VPS_SSH_KEY       — private key (PEM) for that user
#   VPS_SSH_PORT      — optional; omit for port 22, or set e.g. 22
#   VPS_APP_DIR       — absolute path to the repo on the VPS (e.g. /var/www/okr-frontend)
#
# GitHub Actions variables (Settings → Secrets and variables → Actions → Variables):
#   VPS_DEPLOY_BRANCH — optional; default main
#
# One-time on VPS:
#   - Clone this repo to $VPS_APP_DIR, create .env (see .env.example)
#   - npm i -g pm2 && pm2 startup
#   - Point nginx at 127.0.0.1:3000 (see deploy/nginx-okr.conf.example at repo root)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="${APP_DIR:-${DEPLOY_ROOT:-$DEFAULT_APP_DIR}}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npx prisma migrate deploy
npm run build
pm2 startOrReload ecosystem.config.cjs --only okr
