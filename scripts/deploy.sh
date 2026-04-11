#!/usr/bin/env bash
# Run on the VPS after the repo is cloned once at $DEPLOY_ROOT.
#
# GitHub Actions secrets (Settings → Secrets → Actions):
#   VPS_HOST          — server hostname or IP
#   VPS_USERNAME      — SSH user (e.g. deploy)
#   VPS_SSH_KEY       — private key (PEM) for that user
#   VPS_SSH_PORT      — optional; omit for port 22, or set e.g. 22
#
# GitHub Actions variables (Settings → Secrets and variables → Actions → Variables):
#   VPS_DEPLOY_ROOT   — optional; default /var/www/okr (parent of OKR-frontend)
#   VPS_DEPLOY_BRANCH — optional; default main
#
# One-time on VPS:
#   - Clone this repo to $DEPLOY_ROOT, create OKR-frontend/.env (see .env.example)
#   - npm i -g pm2 && pm2 startup
#   - Point nginx at 127.0.0.1:3000 (see deploy/nginx-okr.conf.example at repo root)

set -euo pipefail

ROOT="${DEPLOY_ROOT:-/var/www/okr}"
BRANCH="${DEPLOY_BRANCH:-main}"
APP_DIR="${ROOT}/OKR-frontend"

cd "$ROOT"
git config --global --add safe.directory "$ROOT" 2>/dev/null || true
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$APP_DIR"
npm ci
npx prisma migrate deploy
npm run build
pm2 startOrReload ecosystem.config.cjs --only okr
