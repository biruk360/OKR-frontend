# Notifications — Cadence, Recipients, Permissions

Single-source reference for every notification event in the OKR system: what fires it, who receives it, when the email goes out, and what each role is allowed to do. Pair this with [User_Permissions.md](./User_Permissions.md) (email matrix) and [CRON.md](./CRON.md) (job schedule).

- Event registry: [`lib/notifications/events.ts`](../lib/notifications/events.ts)
- Recipient routing: [`lib/notifications/dispatcher.ts`](../lib/notifications/dispatcher.ts)
- Cron jobs: [`lib/notifications/jobs.ts`](../lib/notifications/jobs.ts)
- Per-user prefs: [`lib/notifications/preferences.ts`](../lib/notifications/preferences.ts)
- RBAC: [`lib/permissions.ts`](../lib/permissions.ts)

---

## 1. How a notification flows

```
domain code → emit(eventKey, payload)
                ├─ resolveRecipients()         ← role-based routing per event
                ├─ getUserPrefsBulk()          ← per-user override (or org default)
                ├─ redact()                    ← per-recipient privacy mask
                ├─ renderTemplate()            ← subject/text/html
                ├─ write Notification (in-app)
                └─ email:
                     IMMEDIATE → sendMail() now
                     DAILY/WEEKLY/MONTHLY → enqueue to EmailDigestQueue
                                           → drained by /api/cron/notifications?job=…
```

Cadence is resolved as: **per-user pref → org default → hard-coded `IMMEDIATE`**. The `ACCOUNT` category is mandatory and cannot be disabled.

---

## 2. Cadence & recipients matrix

Cadence shown is the **org default** from `EVENT_META`. Users may override per category at `/dashboard/settings/notifications` (admins set org defaults at `/dashboard/settings/notification-defaults`).

### Account / Security — `ACCOUNT` (mandatory)

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `ACCOUNT_INVITE` | IMMEDIATE | Invited user | — |
| `ACCOUNT_VERIFY_EMAIL` | IMMEDIATE | Target user | — |
| `ACCOUNT_PASSWORD_RESET_REQUESTED` | IMMEDIATE | Target user | — |
| `ACCOUNT_PASSWORD_CHANGED` | IMMEDIATE | Self only | — |
| `ACCOUNT_ROLE_CHANGED` | IMMEDIATE | Target user + managers + all admins | — |
| `ACCOUNT_DEACTIVATED` | IMMEDIATE | Target user + managers + all admins | — |

### Objective — `OBJECTIVE`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `OBJECTIVE_ASSIGNED` | IMMEDIATE | Owner + owner's managers | ✅ |
| `OBJECTIVE_CREATED_IN_TEAM` | DAILY | Owners + managers + watchers | ✅ |
| `OBJECTIVE_EDITED` | DAILY | Owners + managers + parent owner + watchers | ✅ |
| `OBJECTIVE_ARCHIVED` | IMMEDIATE | Owners + managers + parent owner + watchers + admins | ✅ |
| `OBJECTIVE_VISIBILITY_CHANGED` | IMMEDIATE | Owners + managers + watchers | ✅ |

### Key Result — `KEY_RESULT` / `CHECK_IN`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `KR_ASSIGNED` | IMMEDIATE | KR owner + owner's managers | ✅ |
| `KR_ADDED_TO_OBJECTIVE` | IMMEDIATE | KR owner + managers + parent owner + watchers | ✅ |
| `KR_PROGRESS_UPDATED` | DAILY | KR owner + managers + parent owner + watchers | ✅ |
| `KR_AT_RISK` | IMMEDIATE | KR owner + managers + parent owner + watchers | ✅ |
| `KR_COMPLETED` | IMMEDIATE | KR owner + managers + parent owner + watchers | ✅ |
| `KR_ARCHIVED` | IMMEDIATE | KR owner + managers + parent owner + watchers | ✅ |

### Check-ins — `CHECK_IN` (cron-driven)

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `CHECKIN_WEEKLY_DUE` | WEEKLY | Owner | — |
| `CHECKIN_MISSED_7D` | WEEKLY | Owner + owner's managers | — |
| `CHECKIN_MISSED_14D` | IMMEDIATE | Owner + managers + all admins (escalation) | — |

> ✅ As of the digest hardening, `CHECKIN_MISSED_7D`, `CHECKIN_MISSED_14D`, `CHECKIN_WEEKLY_DUE`, `TODO_DUE_TOMORROW`, `TODO_DUE_TODAY`, and `TODO_OVERDUE` are **force-coalesced into the DAILY digest** even if the recipient set IMMEDIATE — preventing the previous one-email-per-day-per-item flood. See [`FORCE_DIGEST_EVENTS` in dispatcher.ts](../lib/notifications/dispatcher.ts).

### To-dos / Sprints — `TODO`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `TODO_ASSIGNED` | IMMEDIATE | Assignee | — |
| `TODO_REASSIGNED_AWAY` | IMMEDIATE | Previous assignee | — |
| `TODO_DUE_TOMORROW` | DAILY | Assignee | — |
| `TODO_DUE_TODAY` | DAILY | Explicit (assignees) | — |
| `TODO_OVERDUE` | DAILY | Assignee + assignee's managers | — |
| `TODO_COMPLETED` | DAILY | Assignee's managers + watchers | — |
| `SPRINT_TASK_ASSIGNED` | IMMEDIATE | Explicit (sprint task assignee) | — |
| `SPRINT_STARTING_TOMORROW` | IMMEDIATE | Explicit (sprint participants) | — |
| `SPRINT_ENDING_SOON` | IMMEDIATE | Explicit (sprint participants) | — |
| `SPRINT_ENDED_BY_USER` | IMMEDIATE | Explicit (sprint participants) | — |
| `INITIATIVE_CARRIED_OVER` | IMMEDIATE | Explicit (assignees) | — |

### Timeframe — `TIMEFRAME` (cron-driven)

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `TIMEFRAME_OPENED` | IMMEDIATE | All active users | — |
| `TIMEFRAME_ENDING_7D` | IMMEDIATE | Owners of objectives in TF + managers | — |
| `TIMEFRAME_CLOSING_1D` | IMMEDIATE | Owners + managers + all admins | — |
| `TIMEFRAME_CLOSED` | IMMEDIATE | Owners + managers + all admins | — |

### Alignment — `ALIGNMENT`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `ALIGNMENT_REQUESTED` | IMMEDIATE | Requester's managers | ✅ |
| `ALIGNMENT_DECISION` | IMMEDIATE | Child owners + parent owners | ✅ |
| `OBJECTIVE_ALIGNED_CHILD_ADDED` | IMMEDIATE | Parent owners + parent watchers + child owners | ✅ |
| `PARENT_OBJECTIVE_ARCHIVED_ORPHAN` | IMMEDIATE | Orphaned objective owners + managers | ✅ |

### Comments / Mentions — `COMMENT`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `USER_MENTIONED` | IMMEDIATE | Mentioned users (explicit) | ✅ |
| `COMMENT_ON_OWNED_ENTITY` | DAILY | Entity owner(s) + watchers | ✅ |

### Admin / System — `ADMIN`

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `ADMIN_USER_CREATED` | IMMEDIATE | All admins (+ team if dept set) | — |
| `ADMIN_BULK_JOB_DONE` | IMMEDIATE | All admins | — |
| `ADMIN_SECURITY_ALERT` | IMMEDIATE | All admins | — |
| `ADMIN_WEEKLY_HEALTH_DIGEST` | WEEKLY | All admins | — |
| `ADMIN_MONTHLY_EXEC_SUMMARY` | MONTHLY | All admins | — |

---

## 3. Recipient role tags

`resolveRecipients()` returns `userId → Set<RecipientRoleTag>` so templates can address recipients by role. Self-suppression always applies (actors don't notify themselves) except for `EXPLICIT`.

| Tag | Meaning |
|---|---|
| `OWNER` | Direct owner of the entity |
| `MANAGER` | Owner's department lead / manager chain |
| `PARENT_OWNER` | Owner of the parent objective in the alignment tree |
| `ADMIN` | Users with role `ADMIN` |
| `WATCHER` | User who explicitly subscribed to the entity |
| `TEAM` | Members of the relevant department |
| `ASSIGNEE` | Todo's assignee |
| `EXPLICIT` | Caller-supplied recipient (mentions, sprint participants, invites) |

---

## 4. Cron schedule

Endpoint: `POST /api/cron/notifications?job=<name>` — Bearer `CRON_SECRET`.

| Job | Recommended cadence | Effect |
|---|---|---|
| `daily` | every day | Drain DAILY `EmailDigestQueue` → one bundled email per user |
| `weekly` | weekly | Drain WEEKLY queue |
| `monthly` | monthly | Drain MONTHLY queue |
| `escalation` | daily | Scan objectives + KRs for overdue check-ins → fire 7D/14D events |
| `todos` | daily | Fire `TODO_DUE_TOMORROW` / `TODO_OVERDUE` |
| `timeframes` | daily | Fire `TIMEFRAME_ENDING_7D` / `CLOSING_1D` / `CLOSED` |
| `admin-weekly` | weekly | Fire `ADMIN_WEEKLY_HEALTH_DIGEST` |
| `admin-monthly` | monthly | Fire `ADMIN_MONTHLY_EXEC_SUMMARY` |

---

## 5. Redaction (privacy)

For events with `redactable: true`, when the entity is `isPrivate`:

- **Owner + owner's managers + ADMIN** → see the real title and numeric values.
- **Everyone else** (watchers, team, parent-owner outside the chain) → title becomes `[Private Objective]` / `[Private Key Result]`, numbers masked.

Non-redactable events (account, todo, timeframe, check-in reminders, admin) always show full content.

---

## 6. RBAC matrix

From [`lib/permissions.ts`](../lib/permissions.ts).

| Capability | ADMIN | EXECUTIVE | DEPARTMENT_LEAD | EMPLOYEE |
|---|---|---|---|---|
| Create COMPANY objective | ✅ | ✅ | ❌ | ❌ |
| Create DEPARTMENT objective | ✅ | ✅ | ✅ (own dept) | ❌ |
| Create INDIVIDUAL objective | ✅ | ✅ | ✅ | ✅ (own) |
| Edit any objective | ✅ | ✅ | Dept + own | Own only |
| Archive / delete objective | ✅ | ✅ | Dept + own | Own only |
| See PRIVATE objectives | ✅ | ✅ | Owner's manager only | Owner only |
| Manage users (create / role / deactivate) | ✅ | ❌ | ❌ | ❌ |
| Manage departments | ✅ | ❌ | View own | View own |
| Manage timeframes | ✅ | ✅ | ❌ | ❌ |
| Set org notification defaults | ✅ | ❌ | ❌ | ❌ |
| Trigger cron / bulk imports | ✅ | ❌ | ❌ | ❌ |
| Receive admin broadcasts | ✅ | partial | ❌ | ❌ |
| Approve alignment requests | ✅ | ✅ | Own reports | ❌ |
| Comment / mention | ✅ | ✅ | ✅ | ✅ |
| Watch any entity | ✅ | ✅ | Visible entities | Visible entities |

---

## 7. Per-user preferences

- UI: `/dashboard/settings/notifications` — toggle in-app + email, pick IMMEDIATE / DAILY / WEEKLY / MONTHLY per category.
- Org defaults UI (admin): `/dashboard/settings/notification-defaults`.
- `ACCOUNT` is forced ON / IMMEDIATE — cannot be disabled.
- Resolution order: `NotificationPreference` row → `OrgNotificationDefault` row → hard-coded `{ inApp:true, email:true, IMMEDIATE }`.

---

## 8. Recommendations & optimizations

### 1. Coalesce cron-driven reminders ✅ implemented

`runCheckinEscalation`, `runTodoReminders`, and `runTimeframeWatcher` all re-fire the same event every cron run, but the dispatcher used to honor the recipient's cadence — so any `IMMEDIATE` user got a fresh email every day for the same overdue item.

**Implemented:** `FORCE_DIGEST_EVENTS` in [`dispatcher.ts`](../lib/notifications/dispatcher.ts) now overrides cadence to `DAILY` for `CHECKIN_MISSED_7D/14D`, `CHECKIN_WEEKLY_DUE`, `TODO_DUE_TOMORROW/TODAY`, and `TODO_OVERDUE`.

### 2. Idempotency on the queue ✅ implemented

**Implemented:** dispatcher now `findFirst`s an unsent queue row with the same `userId + eventKey + entityId` queued in the current UTC day before inserting — same overdue item enqueues at most once per day per user. (A unique partial index `(userId, eventKey, entityId, queuedDay)` would be a stronger guarantee — open work for a future migration.)

### 3. Beautify the digest template ✅ implemented

**Implemented:** new [`lib/email/templates/digest.ts`](../lib/email/templates/digest.ts) groups items by category and uses the system design tokens (`#F2F2F7` app bg, `#FFFFFF` card, `#007AFF` primary, `#1D1D1F` ink, `#8E8E93` secondary, `#E5E5EA` divider). `wrapHtml()` in [`templates/index.ts`](../lib/email/templates/index.ts) was upgraded to the same tokens so per-event emails are consistent.

### 4. Per-day in-app dedup is too narrow

`Notification` rows are deduped by `userId + eventKey + day`, but two different overdue objectives produce two rows (correct) and the same objective on day 8 produces a *new* row (correct), yet there's no upper bound on retention or a "stale" sweeper.

**Fix:** add a nightly job to mark unread notifications older than 30 days as read (or archive), and run a `DELETE` for read notifications older than 90 days. Keeps the bell icon useful and `Notification` table small.

### 5. Quiet hours / per-user timezone

All emails fire in server time. A user in a different TZ may get a "due tomorrow" email at 3 a.m. local.

**Fix:** store `timezone` on `User`, run cron in UTC but **filter** recipients by local-time window (e.g. only fire 8 a.m.–6 p.m. local). Add an optional "quiet hours" preference.

### 6. Observability

There's no dashboard counting `sent / failed / queued` per event. With ~50 events and several crons, silent failures hide easily.

**Fix:** add an admin page reading `OutboundEmail` (status, eventKey, lastError) with 7-day rollups per event. Also surface queue depth (`EmailDigestQueue` rows where `sentAt IS NULL` grouped by cadence).

### 7. One-click email controls

Every email currently links to the settings page. Add `unsubscribe` and `snooze 7 days` one-click links signed with a JWT — major fatigue reducer for the inevitable busy weeks.

### 8. Batch sendMail calls

Inside the digest drain, sends are sequential — for 1k users at 200ms each = ~3 min cron time. Either parallelize with `Promise.all` chunked at 10–20 concurrent, or move to the SMTP provider's batch API. Same applies to `TIMEFRAME_OPENED` (broadcasts to all active users sequentially today).

### 9. Watcher subscriptions need a UI

`resolveWatchers()` is wired into the dispatcher but there's no UI to subscribe/unsubscribe — currently watcher rows can only be created programmatically. Either ship the UI (a "Watch" button on objective/KR pages) or remove the WATCHER tag from the routing table to avoid a dead concept.

### 10. Mandatory category list is too narrow

`MANDATORY_CATEGORIES = ['ACCOUNT']`. Security-sensitive events under other categories (e.g. `ADMIN_SECURITY_ALERT`) can be silenced by an admin who turned off the `ADMIN` category. Either move security alerts into `ACCOUNT`, or introduce per-event mandatory flags.

### 11. Test the cron via the test endpoint

There's `/api/email/test` for outbound mail. Add a `?dryRun=1` flag to `/api/cron/notifications` that resolves recipients and renders templates without persisting or sending — invaluable when changing routing.

---

## 9. Where to look in code

| Concern | File |
|---|---|
| Add a new event | [`events.ts`](../lib/notifications/events.ts) + [`templates/index.ts`](../lib/email/templates/index.ts) + recipient case in [`dispatcher.ts`](../lib/notifications/dispatcher.ts) |
| Change who receives what | [`dispatcher.ts:resolveRecipients`](../lib/notifications/dispatcher.ts) |
| Change who can do what | [`permissions.ts`](../lib/permissions.ts) |
| Tweak digest formatting | [`jobs.ts:runDigestDrain`](../lib/notifications/jobs.ts) |
| Adjust cron cadence | external scheduler hitting `/api/cron/notifications?job=…` (see [CRON.md](./CRON.md)) |
| Per-user prefs API | [`app/api/notifications/preferences/route.ts`](../app/api/notifications/preferences/route.ts) |
| Org-default prefs API | [`app/api/settings/notification-defaults/route.ts`](../app/api/settings/notification-defaults/route.ts) |
