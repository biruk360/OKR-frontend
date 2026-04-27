# System Cron Entries (VPS)

Add these to the deploy user's crontab on the VPS. Last reviewed: 2026-04-27.

## Sprint state transitions (hourly)
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/sprint-tick > /var/log/sprint-tick.log 2>&1

## Sprint deadline notifications (daily 09:00 local)
0 9 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/sprint-deadlines > /var/log/sprint-deadlines.log 2>&1

## Notification digest (daily 18:00) — already configured if applicable

A one-time bootstrap is provided at `scripts/install-crontab.sh` (idempotent — safe to re-run; not invoked from `deploy.sh`).
