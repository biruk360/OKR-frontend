#!/usr/bin/env bash
set -e
TMP=$(mktemp)
crontab -l 2>/dev/null > "$TMP" || true
grep -q sprint-tick "$TMP" || echo "0 * * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/sprint-tick" >> "$TMP"
grep -q sprint-deadlines "$TMP" || echo "0 9 * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/sprint-deadlines" >> "$TMP"
# Card due-date reminders. Every 5 min because the shortest lead time the card UI offers is "5 minutes before".
# Idempotent: each card is stamped with dueReminderSentAt once emitted, and reminders more than 6h stale are dropped.
grep -q todo-reminders "$TMP" || echo "*/5 * * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/todo-reminders" >> "$TMP"
# AI Automations: the tick only enqueues due slots (cheap, idempotent, safe every minute).
# The actual runs are executed by the long-lived worker: npm run worker:automations
grep -q automations-tick "$TMP" || echo "* * * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/automations-tick" >> "$TMP"
# Reclaims runs whose worker lease expired (worker crashed mid-run).
grep -q automations-reap "$TMP" || echo "*/5 * * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/automations-reap" >> "$TMP"
crontab "$TMP"
rm "$TMP"
echo "Crontab updated."
