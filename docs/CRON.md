# System Cron Entries (VPS)

Last reviewed: 2026-09-18.

> **Install with `scripts/install-crontab.sh`.** That script is the single source
> of truth for the schedule — it is idempotent, re-adds only what is missing, and
> handles the `CRON_SECRET` expansion correctly (see its header for why that is
> not obvious). This file documents what it installs and why; do not hand-copy
> the lines below when the script will do it.
>
> `deploy/notifications-crontab.example` is **superseded**. It listed 18 jobs
> that nothing installed, so on any host bootstrapped with the script the digest
> queue never drained and the project-module sweeps never ran. Everything in it
> now lives in `scripts/install-crontab.sh`.

All jobs authenticate with `Authorization: Bearer $CRON_SECRET` and are
idempotent — running one more often than scheduled is safe, just wasteful.

## Timezone

Schedules are **UTC**. The local times in the comments are
`Africa/Addis_Ababa` (EAT, UTC+3). If the host's crond honours `CRON_TZ` you can
pin it instead of pre-converting.

## Sprints

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 * * * *` | `/api/cron/sprint-tick` | Sprint state transitions, hourly. |
| `0 9 * * *` | `/api/cron/sprint-deadlines` | Sprint deadline notifications. |

## To-dos

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `*/5 * * * *` | `/api/cron/todo-reminders` | The per-card reminder the user set on the card (DTE-4). |
| `0 1 * * *` | `/api/cron/todo-recurrence` | Generates the next occurrence of each recurring card (DTE-5). |
| `0 5 * * *` | `/api/cron/notifications?job=todos` | The `TODO_DUE_TOMORROW` / `TODO_OVERDUE` sweep — 08:00 EAT. |

`todo-reminders` runs every 5 minutes because the shortest lead time the card UI
offers is "5 minutes before". Idempotent: a card is stamped with
`dueReminderSentAt` — claimed conditionally, before the emit, so two overlapping
runs cannot both notify — and a reminder whose moment passed more than 6 hours
ago is dropped rather than delivered late in a batch, so an outage does not
produce a flood on recovery.

`todo-recurrence` is only daily: recurrence has day-level granularity. A series
advances its cursor in the same transaction that creates the cards, and catch-up
after a dormant period is capped per series so a long-idle daily card cannot
flood the board.

## Notifications

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 4 * * *` | `/api/cron/notifications?job=daily` | Daily digest drain — 07:00 EAT. **Without this `EmailDigestQueue` never empties.** |
| `5 4 * * 1` | `/api/cron/notifications?job=weekly` | Weekly digest drain — Mon 07:05 EAT. |
| `10 4 1 * *` | `/api/cron/notifications?job=monthly` | Monthly digest drain — 1st, 07:10 EAT. |
| `0 6 * * *` | `/api/cron/notifications?job=escalation` | Check-in missed escalation (7d / 14d) — 09:00 EAT. |
| `30 3 * * *` | `/api/cron/notifications?job=timeframes` | Timeframe watcher — 06:30 EAT. |
| `15 4 * * 1` | `/api/cron/notifications?job=admin-weekly` | Admin weekly health digest. |
| `20 4 1 * *` | `/api/cron/notifications?job=admin-monthly` | Admin monthly exec summary. |
| `25 4 * * 1` | `/api/cron/weekly-digest` | Weekly per-user owner digest. |

## Project Management module

These three are listed in the build spec and were documented here from the day
the module shipped, but were absent from `install-crontab.sh` until 2026-09-18 —
so on a host bootstrapped with that script they had never run.

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 8 * * *` | `/api/cron/approval-clock` | ⭐ `CLIENT_APPROVAL_SLA_BREACH` at SLA, SLA+3, SLA+7 business days. Critical invariant #3 ("the Approval Clock is automatic") depends on this. |
| `0 2 * * *` | `/api/cron/project-health` | Nightly health recompute. |
| `0 7 * * *` | `/api/cron/project-digest` | Daily PM digest. |

## AI Automations

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `* * * * *` | `/api/cron/automations-tick` | Enqueues due slots. The long-lived worker executes them (`npm run worker:automations`). |
| `*/5 * * * *` | `/api/cron/automations-reap` | Reclaims runs whose worker lease expired. |
| `30 3 * * *` | `/api/cron/automations-prune` | Retention: nulls old run transcripts, deletes briefings past `AutomationSettings.retentionDays`. |

## Daily Scrum

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 23 * * *` | `/api/cron/scrum-health` | Health recompute — 02:00 EAT. |
| `0 5 * * 1-5` | `/api/cron/scrum-reminder` | Standup reminder — working days, 08:00 EAT. |
| `0 6 * * 1-5` | `/api/cron/scrum-finalize` | Finalize + manager digest — 09:00 EAT. |
| `5 6 * * 1-5` | `/api/cron/scrum-nudge` | Single nudge for anyone who has not posted. |
| `0 13 * * 5` | `/api/cron/scrum-weekly` | Weekly digest — Friday 16:00 EAT. |

## Hygiene

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 0 * * *` | `/api/cron/auto-confidence` | Recompute confidence for OKRs with no check-in in 14 days. |
| `30 0 * * *` | `/api/cron/prune-activity` | Drops `ActivityLog` rows older than ~18 months. |
| `45 0 * * *` | `/api/cron/notifications?job=prune-notifications` | Marks unread notifications older than 30d read; deletes read ones older than 90d. |

## Routes that exist but are deliberately NOT scheduled

These nine routes exist under `app/api/cron/` and are intentionally left
unscheduled:

- `prune-notifications` — superseded by the `?job=prune-notifications` variant
  above. The two are duplicate implementations of the same retention rule;
  scheduling both would do the work twice.
- `daily-digest` — superseded by `/api/cron/notifications?job=daily`.
- `client-report`, `wbr-pack`, `jira-sync`, `sprint-migration-check`,
  `permission-cleanup`, `confidence-calc` — ops/manual tools, or one-off
  migrations, run on demand rather than on a timer.
- `performance-nudge` — the performance-review module fires this per cycle;
  it has no standing cadence. **Revisit**: if that module is meant to nudge
  automatically, this needs a schedule.

Add a route here and to `scripts/install-crontab.sh` **together**. A schedule in
one but not the other is exactly what produced the gaps this file now records —
including a nightly `automations-prune` entry that curled a route which did not
exist.
