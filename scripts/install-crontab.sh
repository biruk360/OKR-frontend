#!/usr/bin/env bash
#
# Install the app's cron entries. Idempotent: re-running adds only what is missing.
#
# WHY THE CRON_SECRET LINE EXISTS
# -------------------------------
# Every cron route authenticates with `Authorization: Bearer $CRON_SECRET`.
# This script previously wrote that header inside SINGLE quotes, which meant the
# crontab contained a literal `$CRON_SECRET`: cron runs each command through
# /bin/sh, and single quotes suppress expansion, so curl sent the nine characters
# "$CRON_SECRET" as the token and every job was 401'd whenever the secret was set.
# The jobs only appeared to work because the routes fall open when CRON_SECRET is
# unset in the server environment.
#
# The fix is two parts, and both are required:
#   1. cron itself exports variables declared as `NAME=value` lines in the crontab,
#      so we write CRON_SECRET there once, read from .env at install time;
#   2. the header uses DOUBLE quotes so /bin/sh actually expands it.
#
# The secret therefore lands in the user's crontab, which is mode 0600 and readable
# only by that user and root — the same trust boundary as the .env it came from.

set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"

# Prefer an already-exported value; otherwise lift it out of .env without sourcing
# the whole file (which would run any command substitution it happens to contain).
if [ -z "${CRON_SECRET:-}" ] && [ -f "$ENV_FILE" ]; then
  CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "WARNING: CRON_SECRET is not set in the environment or $ENV_FILE."
  echo "         The cron routes fall open when the server also has no CRON_SECRET,"
  echo "         but if the server sets one, every job below will be rejected with 401."
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
crontab -l 2>/dev/null > "$TMP" || true

# Declare the secret once, at the top, so cron exports it to every command.
if [ -n "${CRON_SECRET:-}" ]; then
  if grep -q '^CRON_SECRET=' "$TMP"; then
    # Keep it current — the secret may have been rotated since the last install.
    sed -i.bak "s|^CRON_SECRET=.*|CRON_SECRET=${CRON_SECRET}|" "$TMP" && rm -f "$TMP.bak"
  else
    printf 'CRON_SECRET=%s\n' "$CRON_SECRET" | cat - "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
  fi
fi

# add <match> <schedule> <path> [comment]
add() {
  local match="$1" schedule="$2" path="$3" comment="${4:-}"
  if grep -q "$match" "$TMP"; then
    echo "  = $match (already present)"
    return
  fi
  [ -n "$comment" ] && echo "# $comment" >> "$TMP"
  # Double quotes on purpose — see the header. $CRON_SECRET must expand at run time.
  echo "$schedule curl -fsS -H \"Authorization: Bearer \$CRON_SECRET\" ${APP_URL}${path}" >> "$TMP"
  echo "  + $match"
}

add sprint-tick        "0 * * * *"   "/api/cron/sprint-tick"
add sprint-deadlines   "0 9 * * *"   "/api/cron/sprint-deadlines"
add todo-reminders     "*/5 * * * *" "/api/cron/todo-reminders" \
  "Card due-date reminders. Every 5 min because the shortest lead time the card UI offers is 5 minutes."
add automations-tick   "* * * * *"   "/api/cron/automations-tick" \
  "AI Automations: enqueues due slots only (cheap, idempotent). The long-lived worker executes them: npm run worker:automations"
add automations-reap   "*/5 * * * *" "/api/cron/automations-reap" \
  "Reclaims automation runs whose worker lease expired (worker crashed mid-run)."
add automations-prune  "30 3 * * *"  "/api/cron/automations-prune" \
  "Retention: nulls old run transcripts and deletes briefings past AutomationSettings.retentionDays."

crontab "$TMP"
echo "Crontab updated."

# Prove the header actually resolves, rather than trusting that it does.
if [ -n "${CRON_SECRET:-}" ]; then
  echo -n "Verifying the tick authenticates... "
  if curl -fsS -o /dev/null -H "Authorization: Bearer $CRON_SECRET" "${APP_URL}/api/cron/automations-tick"; then
    echo "OK"
  else
    echo "FAILED — the app may not be running yet, or CRON_SECRET does not match the server's."
  fi
fi
