#!/usr/bin/env bash
set -e
TMP=$(mktemp)
crontab -l 2>/dev/null > "$TMP" || true
grep -q sprint-tick "$TMP" || echo "0 * * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/sprint-tick" >> "$TMP"
grep -q sprint-deadlines "$TMP" || echo "0 9 * * * curl -fsS -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/sprint-deadlines" >> "$TMP"
crontab "$TMP"
rm "$TMP"
echo "Crontab updated."
