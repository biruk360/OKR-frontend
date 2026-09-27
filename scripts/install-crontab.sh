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
# The jobs only appeared to work because the routes used to fall open when
# CRON_SECRET was unset in the server environment. They no longer do: since
# 2026-09-25 every route authenticates through lib/cron-auth.ts, which refuses
# (503) when the secret is unset and accepts it ONLY as a header —
# `Authorization: Bearer …` (what this script sends) or `x-cron-secret: …`.
# The old `?key=<secret>` query form is ignored; it leaked into access logs.
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

# The routes fail CLOSED (lib/cron-auth.ts): with no CRON_SECRET, or one shorter
# than 16 characters, every /api/cron/* call is refused with 503. Installing a
# schedule that can only ever fail would hide that, so refuse instead.
if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET is not set in the environment or $ENV_FILE." >&2
  echo "       Every /api/cron/* route refuses requests without it. Generate one with" >&2
  echo "         openssl rand -hex 32" >&2
  echo "       add CRON_SECRET=... to $ENV_FILE, restart the app, and re-run this script." >&2
  exit 1
fi
if [ "${#CRON_SECRET}" -lt 16 ]; then
  echo "ERROR: CRON_SECRET is shorter than 16 characters; the cron routes treat that as unset (503)." >&2
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
crontab -l 2>/dev/null > "$TMP" || true

# Declare the secret once, at the top, so cron exports it to every command.
if grep -q '^CRON_SECRET=' "$TMP"; then
  # Keep it current — the secret may have been rotated since the last install.
  sed -i.bak "s|^CRON_SECRET=.*|CRON_SECRET=${CRON_SECRET}|" "$TMP" && rm -f "$TMP.bak"
else
  printf 'CRON_SECRET=%s\n' "$CRON_SECRET" | cat - "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
fi

# Migrate any hand-added entry that still passes the secret as ?key= — the
# routes ignore it now, so such a line would 401 forever. Rewrite it to the
# header form (the query parameter is dropped, other parameters kept).
if grep -qE 'curl .*[?&]key=' "$TMP"; then
  echo "  ~ rewriting legacy ?key= cron entries to the Authorization header"
  sed -E -i.bak \
    -e '/curl .*[?&]key=/ s#[?]key=[^&[:space:]"]*&#?#' \
    -e '/curl .*[?&]key=/ s#[?&]key=[^&[:space:]"]*##' \
    "$TMP" && rm -f "$TMP.bak"
  # Lines that had no Authorization header get one.
  sed -E -i.bak '/curl /{/Authorization: Bearer/!s#curl #curl -H "Authorization: Bearer $CRON_SECRET" #;}' "$TMP" && rm -f "$TMP.bak"
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
add client-report      "0 3 * * 1"   "/api/cron/client-report" \
  "Client report drafts — Monday 06:00 EAT. The spec says bi-weekly; the report period is semi-monthly (1-15 / 16-end) and a draft already existing for the current period is reused, so a weekly run creates at most one draft per project per period."
add wbr-pack           "0 3 * * 1"   "/api/cron/wbr-pack" \
  "Weekly Business Review pack for CEO + PMs — Monday 06:00 EAT. Idempotent per week."
add jira-sync          "*/30 * * * *" "/api/cron/jira-sync" \
  "Jira pull for every ACTIVE JiraConnection (build spec G2). With no connection configured it queries one table and returns an empty result."

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
# The nightly retention sweep used to be `/api/cron/notifications?job=prune-notifications`
# (notifications only). /api/cron/prune-notifications now runs that same rule
# AND bounds the other append-only tables, so point any existing entry at it
# rather than running the notification half twice.
if grep -q 'cron/notifications?job=prune-notifications' "$TMP"; then
  echo "  ~ migrating notifications?job=prune-notifications to /api/cron/prune-notifications"
  sed -i.bak 's#/api/cron/notifications?job=prune-notifications#/api/cron/prune-notifications#' "$TMP" && rm -f "$TMP.bak"
fi
add cron/prune-notifications "45 0 * * *" "/api/cron/prune-notifications" \
  "Retention — 03:45 EAT: notifications (unread >30d marked read, read >90d deleted) plus EmailDigestQueue sent >30d, OutboundEmail >90d, ClientErrorLog >30d, TelegramMessage >180d, AiGenerationLog >180d, JiraSyncLog >30d (lib/retention/prune-tables.ts)."
add permission-cleanup "15 0 * * *"  "/api/cron/permission-cleanup" \
  "Revokes UserRole assignments and permission overrides past their expiresAt — 03:15 EAT. Without it, time-boxed access never expires."
add project-creation-draft-purge "40 0 * * *" "/api/cron/project-creation-draft-purge" \
  "Purges abandoned New Project creation drafts and their uploaded source files — 03:40 EAT."
add attachment-staging-cleanup "50 0 * * *" "/api/cron/attachment-staging-cleanup" \
  "Deletes comment attachments staged in a composer but never posted (unclaimed, older than 24h) — rows and files — 03:50 EAT."


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

# ── Performance ──────────────────────────────────────────────────────────────
add performance-nudge  "0 5 * * *"   "/api/cron/performance-nudge" \
  "Weekly improvement-focus nudge — 08:00 EAT. Scheduled DAILY on purpose: the route sends only on PerformanceSettings.weeklyNudgeDay (ISO, default Monday) and is idempotent per ISO week, so an admin changing the day needs no crontab edit."

crontab "$TMP"
echo "Crontab updated."

# Prove the header actually resolves, rather than trusting that it does.
echo -n "Verifying the tick authenticates... "
if curl -fsS -o /dev/null -H "Authorization: Bearer $CRON_SECRET" "${APP_URL}/api/cron/automations-tick"; then
  echo "OK"
else
  echo "FAILED — the app may not be running yet, CRON_SECRET does not match the server's (401),"
  echo "         or the server has no CRON_SECRET / one under 16 characters (503)."
fi
