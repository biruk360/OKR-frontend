# System Cron Entries (VPS)

Add these to the deploy user's crontab on the VPS. Last reviewed: 2026-04-27.

## Sprint state transitions (hourly)
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/sprint-tick > /var/log/sprint-tick.log 2>&1

## Sprint deadline notifications (daily 09:00 local)
0 9 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/sprint-deadlines > /var/log/sprint-deadlines.log 2>&1

## Notification digest (daily 18:00) — already configured if applicable

## Project module: approval-clock escalations (daily 08:00 local)
0 8 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/approval-clock > /var/log/approval-clock.log 2>&1

## Project module: health recompute (daily 02:00)
0 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/project-health > /var/log/project-health.log 2>&1

## Project module: PM digest (daily 07:00)
0 7 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/cron/project-digest > /var/log/project-digest.log 2>&1

A one-time bootstrap is provided at `scripts/install-crontab.sh` (idempotent — safe to re-run; not invoked from `deploy.sh`).
