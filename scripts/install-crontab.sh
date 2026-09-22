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
add todo-recurrence    "0 1 * * *"   "/api/cron/todo-recurrence" \
  "Generates the next occurrence of each recurring card (DTE-5). Daily is enough — recurrence has day-level granularity."

# ── Project Management module ────────────────────────────────────────────────
# These three were documented in docs/CRON.md from the day the module shipped
# but were never added here, so anyone who bootstrapped with this script did not
# get them. approval-clock matters most: CLAUDE.md lists "the Approval Clock is
# automatic" as a critical invariant, and without this sweep the SLA-breach
# escalations it promises never fire.
add approval-clock     "0 8 * * *"   "/api/cron/approval-clock" \
  "Fires CLIENT_APPROVAL_SLA_BREACH at SLA, SLA+3 and SLA+7 business days (build spec C3/5.3)."
add project-health     "0 2 * * *"   "/api/cron/project-health" \
  "Nightly project health recompute."
add project-digest     "0 7 * * *"   "/api/cron/project-digest" \
  "Daily PM digest."

# ── Notifications ────────────────────────────────────────────────────────────
# Schedules lifted from deploy/notifications-crontab.example, which nothing ever
# installed — so the digest queue grew without ever draining and no digest email
# was sent. Times are UTC; the comments give the Africa/Addis_Ababa (EAT, +3)
# local time they were chosen for. Converted to the Bearer-header form the rest
# of this script uses instead of the example's `?key=` query parameter.
add "notifications?job=batch"        "*/10 * * * *" "/api/cron/notifications?job=batch" \
  "Batched notification emails. BATCHED is the default cadence, so this is the drain most users depend on — keep the interval in step with NOTIFICATION_BATCH_MINUTES."
add "notifications?job=daily"        "0 4 * * *"   "/api/cron/notifications?job=daily" \
  "Daily digest drain — 07:00 EAT. Without this, EmailDigestQueue never empties."
add "notifications?job=weekly"       "5 4 * * 1"   "/api/cron/notifications?job=weekly" \
  "Weekly digest drain — Monday 07:05 EAT."
add "notifications?job=monthly"      "10 4 1 * *"  "/api/cron/notifications?job=monthly" \
  "Monthly digest drain — 1st of month, 07:10 EAT."
add "notifications?job=escalation"   "0 6 * * *"   "/api/cron/notifications?job=escalation" \
  "Check-in missed escalation (7d / 14d) — 09:00 EAT."
add "notifications?job=todos"        "0 5 * * *"   "/api/cron/notifications?job=todos" \
  "TODO_DUE_TOMORROW + TODO_OVERDUE sweep — 08:00 EAT. Distinct from todo-reminders above, which delivers the per-card lead time the user set."
add "notifications?job=timeframes"   "30 3 * * *"  "/api/cron/notifications?job=timeframes" \
  "Timeframe watcher (ending 7d / closing 1d / closed) — 06:30 EAT."
add "notifications?job=admin-weekly" "15 4 * * 1"  "/api/cron/notifications?job=admin-weekly" \
  "Admin weekly health digest — Monday 07:15 EAT."
add "notifications?job=admin-monthly" "20 4 1 * *" "/api/cron/notifications?job=admin-monthly" \
  "Admin monthly exec summary — 1st of month, 07:20 EAT."
add weekly-digest      "25 4 * * 1"  "/api/cron/weekly-digest" \
  "Weekly per-user owner digest — Monday 07:25 EAT."

# ── OKR hygiene ──────────────────────────────────────────────────────────────
add auto-confidence    "0 0 * * *"   "/api/cron/auto-confidence" \
  "Recompute confidence for OKRs with no check-in in 14 days — 03:00 EAT."
add prune-activity     "30 0 * * *"  "/api/cron/prune-activity" \
  "Retention: drops ActivityLog rows older than ~18 months — 03:30 EAT."
add "notifications?job=prune-notifications" "45 0 * * *" "/api/cron/notifications?job=prune-notifications" \
  "Retention: marks unread notifications older than 30d as read, deletes read ones older than 90d. Nothing pruned this table before, so it grew without bound."


# ── Daily Scrum ──────────────────────────────────────────────────────────────
add scrum-health       "0 23 * * *"  "/api/cron/scrum-health" \
  "Scrum health recompute — 02:00 EAT (23:00 UTC the previous day)."
add scrum-reminder     "0 5 * * 1-5" "/api/cron/scrum-reminder" \
  "Standup reminder — working days, 08:00 EAT."
add scrum-finalize     "0 6 * * 1-5" "/api/cron/scrum-finalize" \
  "Finalize the day's updates + manager digest — working days, 09:00 EAT."
add scrum-nudge        "5 6 * * 1-5" "/api/cron/scrum-nudge" \
  "Single nudge for anyone who has not posted — working days, 09:05 EAT."
add scrum-weekly       "0 13 * * 5"  "/api/cron/scrum-weekly" \
  "Scrum weekly digest — Friday 16:00 EAT."

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
