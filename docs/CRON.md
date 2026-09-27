# System Cron Entries (VPS)

Last reviewed: 2026-09-25.

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

## Authentication (since 2026-09-25)

Every route under `app/api/cron/` is wrapped in `withCronAuth` from
`lib/cron-auth.ts` (enforced by `lib/security/cron-auth.test.ts`). The rules:

- **Fail closed.** If the server has no `CRON_SECRET`, or it is shorter than
  16 characters, every cron route answers **503** `CRON_NOT_CONFIGURED` (logged
  once per process). Routes used to run unauthenticated in that case.
- **Headers only.** `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`.
  The `?key=<secret>` query form is **no longer accepted** (it ended up in nginx
  access logs); a request that tries it gets 401 and a one-time warning in the
  app log.
- **Constant-time comparison** (`crypto.timingSafeEqual` over SHA-256 digests).
- Errors use the standard envelope: `{ success: false, error, code }`.

Operationally: `CRON_SECRET` (≥16 chars, e.g. `openssl rand -hex 32`) must be in
the app's `.env` **and** in the crontab's `CRON_SECRET=` line.
`scripts/install-crontab.sh` refuses to run without it, keeps the crontab line in
sync with `.env`, and rewrites any hand-added `?key=` entry to the header form.
After rotating the secret: restart the app, then re-run the script.

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
| `*/10 * * * *` | `/api/cron/notifications?job=batch` | **Batched drain — the one most users depend on.** `BATCHED` is the default cadence, so if this stops, most notification email stops. Keep in step with `NOTIFICATION_BATCH_MINUTES` (default 10). Claims rows before sending, so overlapping runs cannot double-send. |
| `0 4 * * *` | `/api/cron/notifications?job=daily` | Daily digest drain — 07:00 EAT. **Without this `EmailDigestQueue` never empties.** |
| `5 4 * * 1` | `/api/cron/notifications?job=weekly` | Weekly digest drain — Mon 07:05 EAT. |
| `10 4 1 * *` | `/api/cron/notifications?job=monthly` | Monthly digest drain — 1st, 07:10 EAT. |
| `0 6 * * *` | `/api/cron/notifications?job=escalation` | Check-in missed escalation (7d / 14d) — 09:00 EAT. |
| `30 3 * * *` | `/api/cron/notifications?job=timeframes` | Timeframe watcher — 06:30 EAT. |
| `15 4 * * 1` | `/api/cron/notifications?job=admin-weekly` | Admin weekly health digest. |
| `20 4 1 * *` | `/api/cron/notifications?job=admin-monthly` | Admin monthly exec summary. |
| `25 4 * * 1` | `/api/cron/weekly-digest` | Weekly per-user owner digest. |

## Project Management module

approval-clock / project-health / project-digest were documented here from the
day the module shipped but absent from `install-crontab.sh` until 2026-09-18;
client-report, wbr-pack, jira-sync and the draft purge were added 2026-09-25.

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 8 * * *` | `/api/cron/approval-clock` | ⭐ `CLIENT_APPROVAL_SLA_BREACH` at SLA, SLA+3, SLA+7 business days. Critical invariant #3 ("the Approval Clock is automatic") depends on this. |
| `0 2 * * *` | `/api/cron/project-health` | Nightly health recompute. |
| `0 7 * * *` | `/api/cron/project-digest` | Daily PM digest. |
| `0 3 * * 1` | `/api/cron/client-report` | Client report drafts — Mon 06:00 EAT. Spec says bi-weekly; the report period is semi-monthly (1–15 / 16–end) and an existing draft for the current period is reused, so a weekly run yields at most one draft per project per period. |
| `0 3 * * 1` | `/api/cron/wbr-pack` | Weekly Business Review pack for CEO + PMs — Mon 06:00 EAT. Idempotent per week. |
| `*/30 * * * *` | `/api/cron/jira-sync` | Jira pull for every active `JiraConnection` (spec §G2). With no connection configured it is one empty query. Read-only toward Jira. |
| `40 0 * * *` | `/api/cron/project-creation-draft-purge` | Purges abandoned New Project creation drafts + uploaded source files past `PROJECT_CREATION_DRAFT_RETENTION_DAYS` (default 30). |

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

## Performance

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 5 * * *` | `/api/cron/performance-nudge` | Weekly improvement-focus nudge — 08:00 EAT. Scheduled **daily** on purpose: the route sends only on `PerformanceSettings.weeklyNudgeDay` (ISO, default Monday = 1) and is idempotent per ISO week (`PerformanceNudgeDelivery`), so changing the day in settings needs no crontab edit. `?force=1` bypasses the day gate for a manual run. |

## Hygiene

| Schedule (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 0 * * *` | `/api/cron/auto-confidence` | Recompute confidence for OKRs with no check-in in 14 days. |
| `15 0 * * *` | `/api/cron/permission-cleanup` | Revokes `UserRole` assignments and `UserPermissionOverride`s past `expiresAt`, invalidates the permission cache. Without it, time-boxed access never expires. |
| `30 0 * * *` | `/api/cron/prune-activity` | Drops `ActivityLog` rows older than ~18 months. |
| `45 0 * * *` | `/api/cron/prune-notifications` | Retention sweep — see below. |
| `50 0 * * *` | `/api/cron/attachment-staging-cleanup` | Deletes comment attachments staged in a composer but never posted (`CommentAttachment.commentId` null, older than 24h) — row, then file. Batched (200 × up to 50 per run), race-safe against a concurrent post, idempotent (`lib/attachments/staging-cleanup.ts`). |

### Retention (`/api/cron/prune-notifications`)

Notifications: unread rows older than 30d are marked read, read rows older than
90d deleted (shared rule: `runPruneNotifications` in `lib/notifications/jobs.ts`).
Then every other append-only table, via `lib/retention/prune-tables.ts`:

| Table | Kept for | Filter | Override env |
|---|---|---|---|
| `EmailDigestQueue` | 30 days | `sentAt` — **sent rows only**; unsent rows are still owed and kept | `RETENTION_EMAIL_DIGEST_DAYS` |
| `OutboundEmail` | 90 days | `createdAt` | `RETENTION_OUTBOUND_EMAIL_DAYS` |
| `ClientErrorLog` | 30 days | `createdAt` | `RETENTION_CLIENT_ERROR_DAYS` |
| `TelegramMessage` | 180 days | `sentAt` | `TELEGRAM_MESSAGE_RETENTION_DAYS` |
| `AiGenerationLog` | 180 days | `createdAt` | `RETENTION_AI_GENERATION_DAYS` |
| `JiraSyncLog` | 30 days | `createdAt` | `RETENTION_JIRA_SYNC_LOG_DAYS` |

Deletes run in batches of 2,000 ids (max 100 batches ≈ 200k rows per table per
night; the remainder goes next night — `capped: true` in the response). Each
table is independent: one failing is logged and reported without stopping the
rest. Overrides below 7 days are ignored. The response carries per-table counts,
and the app log gets one `[retention] pruned …` line.

This route used to duplicate the notification rule only, while the crontab ran
`/api/cron/notifications?job=prune-notifications`. `install-crontab.sh` now
rewrites that older entry to `/api/cron/prune-notifications` so the notification
half does not run twice. The `?job=` variant still works for manual runs.

## Routes that exist but are deliberately NOT scheduled

- `daily-digest` — superseded by `/api/cron/notifications?job=daily`.
- `confidence-calc` — the older bi-weekly (1st/15th) confidence recompute. The
  nightly `auto-confidence` above covers OKRs that have gone stale; run this one
  on demand. **Revisit** if a full bi-weekly recompute is wanted.
- `sprint-migration-check` — a one-off report on the Sprint v2 migration; run
  on demand.
- `/api/cron/notifications?job=prune-notifications` — kept for manual runs;
  the scheduled retention sweep is `/api/cron/prune-notifications` (above).

Everything else under `app/api/cron/` is scheduled. The 2026-09-25 pass added
`permission-cleanup`, `performance-nudge`, `client-report`, `wbr-pack`,
`jira-sync` and `project-creation-draft-purge`, which previously existed but
never ran.

Add a route here and to `scripts/install-crontab.sh` **together**. A schedule in
one but not the other is exactly what produced the gaps this file now records —
including a nightly `automations-prune` entry that curled a route which did not
exist.
