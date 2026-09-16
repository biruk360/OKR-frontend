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
#   - Clone this repo to $VPS_APP_DIR, create .env with DATABASE_URL + NEXTAUTH_SECRET (see env.example)
#   - Install postgres and create the `okr_system` database
#   - npm i -g pm2 && pm2 startup
#   - Point nginx at 127.0.0.1:3000 (see deploy/nginx-okr.conf.example at repo root)
#
# Schema management strategy:
#   We use `prisma db push` instead of `prisma migrate deploy` because the production
#   database was seeded via `db push` from an earlier schema and never had a migration
#   history. Destructive changes are gated by a pre-deploy SQL preflight (below) that
#   performs safe renames before `db push` runs its diff.

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

# --- 1. Install deps (only if package-lock changed, for speed) ---------------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi

# --- 2. Pre-deploy schema preflight ------------------------------------------
# `prisma db push` is not aware that `todos` was renamed to `initiatives`.
# Rename it here so push sees the new table already in place and preserves rows.
# Idempotent: safe to run on every deploy (no-op after the first rename).
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo "[deploy] running schema preflight (scripts/preflight.sql)..."
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP_DIR/scripts/preflight.sql"; then
    echo "[deploy] preflight failed — aborting before db push"
    exit 1
  fi
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "[deploy] DATABASE_URL not set; skipping preflight"
else
  echo "[deploy] psql not installed; skipping preflight (prisma db push will still run)"
fi

# --- 3. Sync schema + regenerate client --------------------------------------
# --skip-generate so we control when the client is generated (right before build).
npx prisma db push --skip-generate --accept-data-loss=false
npx prisma generate

# Idempotently create missing roles, DocTypes, permission rows, features, and
# scope rules. Existing administrator configuration is preserved by the seed.
npx tsx scripts/seed-permissions.ts
npm run db:seed:project-templates
# AI Automations doctypes, role matrix and the canAuthorAutomations capability.
# Without this the module's API refuses every write (canDocType fails closed),
# so the UI would ship visible but unusable.
npm run db:seed:automation-permissions

# --- 4. Build + restart -------------------------------------------------------
# Build into a scratch dir, then swap it in. The old build keeps serving for the
# whole build, so there is no window where the live process has no static assets.
#
# This previously did `rm -rf .next && npm run build` with the app still running,
# which meant every chunk request 404'd for the length of the build (~8 min on
# this box) and users saw "Loading chunk N failed". The scratch dir also
# preserves the original intent — a clean build, never a stale mix of outputs.
BUILD_DIR=".next.build"
PREV_DIR=".next.prev"

rm -rf "$BUILD_DIR" "$PREV_DIR"
if ! NEXT_DIST_DIR="$BUILD_DIR" npm run build; then
  echo "[deploy] build failed — leaving the running app untouched"
  rm -rf "$BUILD_DIR"
  exit 1
fi

# Swap: mv is atomic within a filesystem, so the gap is milliseconds, not minutes.
if [ -d .next ]; then mv .next "$PREV_DIR"; fi
mv "$BUILD_DIR" .next

# Both processes: the web app and the automations worker. Naming them explicitly
# rather than dropping --only keeps the blast radius of this line obvious.
pm2 startOrReload ecosystem.config.cjs --only okr,okr-automations-worker
pm2 save

# Keep the previous build until the reload has settled, then drop it.
rm -rf "$PREV_DIR"

echo "[deploy] done: $(git rev-parse --short HEAD) on $BRANCH"

# --- 5. One-time manual steps (NOT performed here) ----------------------------
# The automations tick is a crontab entry, and crontab is installed once per box
# rather than rewritten on every deploy. If /api/cron/automations-tick is not in
# `crontab -l`, run: bash scripts/install-crontab.sh
if ! crontab -l 2>/dev/null | grep -q automations-tick; then
  echo "[deploy] NOTE: automations-tick is not in crontab — run scripts/install-crontab.sh once, or automations will never fire."
fi
