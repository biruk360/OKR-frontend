# Recurring Sub-tasks (and two fixes to card-level recurrence)

> Status: **SPECIFIED, NOT STARTED — open questions decided 2026-09-25 (§8).** Owner: TBD. Last updated: 2026-09-25.
>
> Legend: **[V]** verified against code in this repo on 2026-09-25 · **[A]** assumption needing
> confirmation. Every requirement has an ID and Given/When/Then acceptance criteria.
>
> ID prefixes: `RST` model and behaviour · `RSG` generator · `RSA` API · `RSU` UI/UX ·
> `RSC` calendar integration · `RSPM` permissions, notifications and audit · `RSO` cron and ops ·
> `REC-FIX` fixes to the existing card-level recurrence (DTE-5). None of these prefixes is used by
> another spec. Permissions use `RSPM`, not `RSP`, because `trello_parity_sprint_board_REQUIREMENTS.md`
> already uses `RSP-*` for its responsive requirements (e.g. RSP-6).
>
> Line numbers are as of 2026-09-25. Other work was editing code in parallel, so treat symbol
> names as the stable reference.

---

## Context

The request, verbatim: *"for recurring to/do lets add a unique recurring sub task / to do list
which would create the respective task for the specific recurring rule"*.

The requester then chose, from the options offered, **"Sub-tasks with their own repeat"**:

> Inside any card, a "Recurring sub-tasks" list where EACH item has its own rule
> (daily/weekly/monthly…). Each item creates its own task on its schedule, e.g. a "Finance
> operations" card with "Reconcile bank — weekly · Mon", "Payroll run — monthly · 25th",
> "Petty cash count — daily"; each generated task links back to the parent card.

Two further decisions were delegated ("you decide") and are included as requirements here:

1. **REC-FIX-1** — the existing card-level generator must advance the series head's `startDate`
   together with its `dueDate` cursor, keeping the start→due span, so a head never stretches
   across weeks in a calendar.
2. **REC-FIX-2** — when occurrences copy checklists, checklist items' `startDate`/`dueDate` are
   currently dropped; they must be copied **shifted by the occurrence's offset**.

---

## 1. Current implementation **[V]**

### 1.1 Card-level recurrence (DTE-5)

- **Engine** `lib/todos/recurrence.ts` — pure, `now` injected. `RECURRENCE_RULES` = `DAILY`,
  `WEEKDAYS`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `YEARLY`. `nextOccurrence(rule, from)` returns the
  next local-midnight date strictly after `from`; `MONTHLY`/`YEARLY` go through
  `addMonthsClamped` (Jan 31 → Feb 28, not Mar 3). `shouldGenerate(head, now, horizonDays=1)`
  and `occurrencesUpTo(head, now, horizonDays=1, maxPerRun=5)`. Tests R-01..R-12 in
  `lib/todos/recurrence.test.ts`; run with `npm run test:todos` (`tsx --test lib/todos/*.test.ts`).
- **Schema** (`prisma/schema.prisma`, `model Todo`, table `initiatives`): `recurrenceRule`,
  `recurrenceEndsAt`, `recurrenceParentId` (plain string + index, **no FK on purpose** —
  `scripts/preflight.sql` §"Recurring cards (Trello parity, DTE-5) — 2026-09-18"). Only the
  **series head** carries a rule; occurrences point at it and carry none, so a series cannot fan out.
- **Generator** `lib/todos/recurrence-generator.ts` `runTodoRecurrence(now)`:
  - scans `recurrenceRule != null, dueDate != null, archivedAt == null`, `take: 500`, no ordering
    and no paging;
  - `HORIZON_DAYS = 1`, `MAX_PER_SERIES_PER_RUN = 5` (module constants, not exported);
  - copies title, description, priority, cover, `startTime`/`endTime`, `dueReminder` (with
    `dueReminderSentAt` left null so the reminder re-arms), `assigneeId`, `creatorId`, KR/objective,
    `sprintId`, `columnId`, `taskType`, **`progressValue`**, members, labels and checklists
    (unticked);
  - computes the occurrence's `startDate` as `due − (head.dueDate − head.startDate)` in **ms**;
  - in the same transaction, advances **only** `head.dueDate` to the last generated date
    (`tx.todo.update({ data: { dueDate: lastDate } })`);
  - copies checklist items as `{ title, position, assigneeId, completed: false, completedAt: null }`
    — **`startDate` and `dueDate` are dropped**;
  - writes **no** `ActivityLog` row and sends **no** notification for an occurrence.
- **Cron** `app/api/cron/todo-recurrence/route.ts` — `POST`/`GET`, `Bearer $CRON_SECRET` (500 when
  unset), returns `{ success, data: { scanned, generated, seriesAdvanced } }`. Scheduled
  `0 1 * * *` UTC (04:00 EAT) in `scripts/install-crontab.sh` (`add todo-recurrence …`) and
  documented in `docs/CRON.md` §To-dos.
- **UI** `components/todos/TodoCardModal.tsx` `DatesPanel` (`:651+`): a native `<select id="recurring">`
  (Never + `RECURRENCE_RULES`), disabled without a due date, plus an optional "Ends on" date;
  helper text "A fresh card is created before each occurrence is due, carrying the members, labels
  and checklist across." (`:818-857`). No card front or board surface shows that a card repeats.

### 1.2 The head-`startDate` defect is worse than a calendar glitch

`calendar_view_REQUIREMENTS.md` §1.3 / A9 records that the head's `startDate` never moves, so the
head's span keeps growing. Reading the generator shows a second consequence: the span used for
**new occurrences** is read from the head on every run (`head.dueDate − head.startDate`), and
because `dueDate` moved but `startDate` did not, **each run's occurrences inherit the inflated
span**. Example: head start Mon 14 Sep, due Wed 16 Sep, weekly.

| Run | Head before | Span used | Occurrence created |
|---|---|---|---|
| 1 | 14 → 16 Sep | 2 d | **21 → 23 Sep** ✓ |
| 2 | 14 → 23 Sep | 9 d | **21 → 30 Sep** ✗ (should be 28 → 30) |
| 3 | 14 → 30 Sep | 16 d | **21 Sep → 7 Oct** ✗ |

So every occurrence after the first starts on the same day as the first one. REC-FIX-1 fixes both.

### 1.3 Checklists

- `TodoChecklist { id, todoId, title, position }`; `TodoChecklistItem { checklistId, title,
  completed, assigneeId, startDate, dueDate, position, completedAt }` (item assignee `SetNull`).
- Routes: `app/api/todos/[id]/checklists/route.ts` (GET, POST),
  `…/[checklistId]/route.ts` (PATCH title, DELETE), `…/[checklistId]/items/route.ts` (POST
  `{ title, assigneeId, dueDate }`), `…/items/[itemId]/route.ts` (PATCH `{ title, completed,
  assigneeId, dueDate }`, DELETE). **None accepts `startDate`**, so item start dates are only ever
  set by other writers (duplicate, AI/import).
- **Observed, not changed here (flagged):** none of the checklist routes checks write access to the
  parent card, none applies the closed-sprint guard, and none verifies that `checklistId`/`itemId`
  belong to the `[id]` in the URL. Only checklist-create and item-toggle write `ActivityLog`. The
  new routes in this spec must **not** copy that pattern (RSPM-1, RSPM-2).
- UI (`TodoCardModal.tsx:2143-2330`): per item a checkbox, inline rename, due-date chip, assignee
  avatar, and hover actions — due date (`Popover` + `AppleDatePicker`), assign (`Popover` over
  `useUsersForSelection().users`), and an `ActionsMenu` with **Rename / Delete item**. The
  **"Convert to card"** entry named by CDM-8 is **not built**.
- `POST /api/todos/[id]/duplicate` copies checklist items **with** `dueDate`/`startDate` unshifted
  (fine for a duplicate; noted for contrast with REC-FIX-2).

### 1.4 Write access, closed sprints, lanes

- `PATCH /api/todos/[id]` (`app/api/todos/[id]/route.ts:176-231`): access =
  `hasTodoParticipantWriteAccess` (assignee / creator / member, `lib/todos/access.ts`) **or**
  `canEditKeyResultWithObjectiveContext` for a KR-linked card **or** role
  ADMIN/EXECUTIVE/DEPARTMENT_LEAD **or** DB-RBAC `resolveDocTypePermission(user,'todo','write')`
  within `buildScopeFilter`. The logic is inline; `calendar_view_REQUIREMENTS.md` **CPM-3** plans
  to extract it to `lib/todos/access.ts` `canWriteTodo()`.
- Closed sprint (BR-06, `:262-290`): 409 `SPRINT_CLOSED` only for status/position changes and moves
  into a closed sprint. `lib/sprints/guards.ts` exports `sprintClosedGuard(sprintId)` and
  `sprintEditGuard(...)`. The modal renders read-only when `todo.sprint.state` is
  COMPLETED/CANCELLED (`sprintClosed`, `:1296`, CDM-11).
- `DELETE /api/todos/[id]`: creator or ADMIN only (`:649-655`).
- Lane placement on create (`app/api/todos/route.ts:240-254`): `getSprintLanes(sprintId)`
  (`lib/sprints/columns.ts:53`) → the first lane with `statusKey === 'PENDING'`; `sprintPosition`
  left at its default.
- Sprint close (`lib/sprints/close-sprint.ts` `executeSprintClose`, `lib/sprints/end-sprint.ts`
  BR-02): **every incomplete card** is moved to the next sprint, the backlog (`sprintId = null`)
  or cancelled. Only COMPLETED cards stay in a closed sprint. `SprintCompletionSummary.nextSprintId`
  records the successor.

### 1.5 Notifications, reminders, audit

- `emit()` (`lib/notifications`): `actorId` is optional (`events.ts:290`), so a system emit is
  allowed. `TODO_ASSIGNED` (IMMEDIATE), `SPRINT_TASK_ASSIGNED` (IMMEDIATE), `TODO_DUE_REMINDER`
  (IMMEDIATE), `TODO_DUE_TOMORROW` (**DAILY** digest) exist (`events.ts:191-201`).
- `POST /api/todos` emits `TODO_ASSIGNED` (+ `SPRINT_TASK_ASSIGNED` for sprint cards) when the
  assignee is someone other than the actor, and records `INITIATIVE_CREATED`.
- `app/api/cron/todo-reminders` (every 5 min): recipients = members + watchers + assignee; claims
  `dueReminderSentAt` before emitting; skips archived and done cards.
- `/api/cron/notifications?job=todos` (`0 5 * * *` UTC, 08:00 EAT): `TODO_DUE_TOMORROW` to the
  **assignee** of every open card due tomorrow, `TODO_OVERDUE` to assignee + manager
  (`lib/notifications/jobs.ts:174+`). Because recurrence runs at 04:00 EAT with a 1-day horizon,
  a card generated for tomorrow is picked up by the 08:00 sweep the same morning.
- `recordActivity()` (`lib/activity-log.ts`) with `ActivityEntityType` `'TODO'` and a closed
  `ActivityAction` union (`INITIATIVE_CREATED`, `INITIATIVE_CHECKLIST_CREATED`, …). `actorId` is
  optional.
- `User.isActive` exists (`schema.prisma:28`).

### 1.6 Where to-dos show up

The sprint board (`GET /api/sprints/[id]/board`, `include` of every `Todo` scalar), the to-dos page
(assignee / creator / KR owner / objective owner), the work board (assignee / creator / member) —
see `calendar_view_REQUIREMENTS.md` §1.4 for the three visibility rules. `GET /api/todos/[id]` has
no view check beyond `withAuth` (observed; left for CPM-2 of the calendar spec).

---

## 2. Conflict check against existing specs **[V]**

| Existing requirement | Relationship |
|---|---|
| Trello parity **DTE-5** (card-level recurring; head + occurrences) | **Kept, and fixed** by REC-FIX-1/2. Recurring sub-tasks are a **separate lineage** (`Todo.recurringSubtaskId`), never `recurrenceParentId`, so the two generators cannot interfere and a card may use both. |
| Trello parity **CDM-8** (checklist item due date, assign, overflow Rename / Delete / Convert to card) | Not changed. Recurring sub-tasks are **not** checklist items (decision D1). A "Make recurring…" entry on the checklist-item overflow is added in P2 (RSU-12), beside the still-unbuilt "Convert to card". |
| Trello parity **CDM-11** / BR-06 (closed sprint read-only) | Followed: server 409 `SPRINT_CLOSED` on every sub-task mutation of a card in a closed sprint (RSPM-2); the section renders read-only; history stays readable. |
| Trello parity **DTE-4** (per-card reminder via cron) | Reused unchanged: a sub-task's optional `dueReminder` is copied onto each generated card, which the existing sweep delivers. |
| Trello parity **DTE-7** (outside-sprint-window warning, non-blocking) | Generated cards may fall outside the sprint window; that is allowed, as for manual cards. |
| Calendar **CDT-8** (occurrences are ordinary cards) | Applies to sub-task-generated cards too (RSC-1). |
| Calendar **CDT-9** + **A9** (head drawn on `dueDate` only; "should the generator also advance `startDate`?") | **A9 is answered: yes** (REC-FIX-1). Once REC-FIX-1 and its repair ship, CDT-9's "its `startDate` is ignored for spanning" may be relaxed to "the head is drawn with its span"; the "hide head where an occurrence shares its due day" rule still stands. |
| Calendar **CDT-10/11** (projected repeats as ghosts, capped 62 per series per range, not counted) | **Extended** by RSC-2..4: ghosts for each active recurring sub-task. The calendar spec should add **CDT-10a** pointing here (the coordinator owns that file). |
| Calendar **CAPI-1** (sprint calendar uses the board payload) and **CAPI-4** (projection includes heads whose next occurrence is in range) | **Extended**: the board payload and CAPI-4 projection gain an active-sub-task summary so ghosts can be drawn (RSC-3). |
| Calendar **CPM-3** (`canWriteTodo()` extracted to `lib/todos/access.ts`) | **Shared prerequisite.** Whichever spec lands first extracts it; the other reuses it (RSPM-1). |
| Calendar **CUX-13** / **CA11Y-6** (↻ glyph with "repeats weekly" accessible name) | Same glyph and wording on generated cards and on board card fronts (RSU-9, RSU-10). |
| Card comments **AFL-1..4** (board assignee filter matches assignee **or** members) | Generated cards get the assignee as a member too (RST-8), so they show up under that person's filter and avatar stack. |
| Sprint close **BR-02** (incomplete cards go next / backlog / cancel) | Unchanged. Generated cards are normal cards and are disposed like any other. Parent-card moves drive where *future* cards land (RST-10). |
| `docs/CRON.md` — "Add a route here and to `scripts/install-crontab.sh` together" | Followed by **not adding a route**: the existing `todo-recurrence` job also runs sub-tasks (RSO-1). |
| CLAUDE.md — reuse first, `withAuth`, envelope, `recordActivity`, `emit`, `react-hook-form` + Zod, `Modal`/`ConfirmDialog`/`EmptyState`, design tokens | Followed throughout; see §5 Reuse audit. |

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **A new model, `TodoRecurringSubtask`**, not recurrence fields on `TodoChecklistItem`. | A checklist item is a *tick inside one card*; a recurring sub-task is a *rule that makes cards*. Putting a rule on an item would (a) make the card-level generator copy rules into every occurrence (fan-out, exactly what DTE-5's "only the head carries a rule" prevents), (b) give the rule a meaningless `completed` flag and a place in the checklist progress bar and card-front `n/m` badge, (c) inherit checklist routes that have no permission or closed-sprint checks (§1.3), and (d) need a "special checklist kind" flag that every existing checklist reader would have to learn to skip. A dedicated table is additive, keeps both readers simple, and gives the cursor, pause state and counters a natural home. |
| D2 | **Generated tasks are ordinary `Todo` rows** with `recurringSubtaskId` + `subtaskOccurrenceDate`, linked to the parent through the sub-task. | Per-occurrence completion history is the point (same reasoning as DTE-5). One FK is the single source of truth for "which rule / which parent"; a second `parentTodoId` column would be redundant and could disagree. A unique `(recurringSubtaskId, subtaskOccurrenceDate)` makes duplicates impossible even under concurrent runs. |
| D3 | **Generated tasks follow the parent card**: they land in the sprint the parent is in *at generation time*, in its first PENDING lane; a backlog parent produces backlog cards. | With a 1-day horizon, generation happens the day before each due date, so "wherever the parent is now" is always the current sprint once close-sprint dispositions have moved the parent. |
| D4 | **Parent done, cancelled or archived ⇒ the sub-tasks are suspended** (derived, not stored). While suspended the generator advances the cursor without creating cards, so reopening never back-fills. | A completed "Finance operations" card means the operation is over; continuing to spawn chores from a closed card surprises people. Advancing the cursor removes any need to hook reopen/unarchive in `PATCH /api/todos/[id]`. [A] |
| D5 | **Rules are the existing six**, with an **anchor**: weekday for WEEKLY/BIWEEKLY (from the start date), day-of-month for MONTHLY/YEARLY (1–31, "Last day" = 31, clamped per month). Custom intervals ("every 3 days", "2nd Tuesday", "Mon and Thu") are **out of scope** [A] — "Mon and Thu" is two sub-tasks. | Covers all three examples given. Keeps one engine. |
| D6 | **Notify on assignment, not on every generation.** `TODO_ASSIGNED` fires when a sub-task is created with, or changed to, an assignee other than the actor. Each generated card is announced by the existing 08:00 EAT `TODO_DUE_TOMORROW` sweep and the optional per-sub-task reminder. | A daily sub-task with an IMMEDIATE `TODO_ASSIGNED` per card would email its assignee every day forever. [A] |
| D7 | **Extend the existing daily `todo-recurrence` cron**, no new job. | Same granularity, same auth, same schedule; one crontab line; nothing to install on the VPS. |

---

## 4. Requirements

### 4.1 Model and behaviour — `RST`

| ID | Requirement |
|---|---|
| RST-1 | **New model** (additive; `prisma db push`, plus an idempotent block in `scripts/preflight.sql` following the DTE-5 block's style): |

```prisma
/// A rule inside a card that creates its own task on its own schedule
/// (docs/recurring_subtasks_REQUIREMENTS.md). The parent card is the container;
/// each generated task is an ordinary Todo with recurringSubtaskId set.
model TodoRecurringSubtask {
  id              String    @id @default(cuid())
  todoId          String    // the parent card
  title           String
  description     String?
  /// DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY | YEARLY (lib/todos/recurrence.ts)
  rule            String
  /// First due date the user chose. Fixes the weekday for WEEKLY/BIWEEKLY,
  /// the fortnight parity for BIWEEKLY, and the month for YEARLY.
  anchorDate      DateTime
  /// Intended day of month for MONTHLY/YEARLY, 1..31. 31 = "last day".
  /// Stored so a 31st rule does not drift to the 28th after February.
  monthDay        Int?
  /// Cursor: the due date of the NEXT task to create. Advanced in the same
  /// transaction that creates the task(s).
  nextDueDate     DateTime
  startTime       String?   // "HH:mm"
  endTime         String?   // "HH:mm" — the due time
  dueReminder     String?   // AT_TIME | M5 | H1 | D1 | D2 (lib/todos/due-reminders.ts)
  priority        String?   // null = use the parent's priority at generation time
  assigneeId      String?
  endsAt          DateTime? // inclusive last date; null = open-ended
  pausedAt        DateTime? // user pause
  archivedAt      DateTime? // "deleted": stops future tasks, keeps history
  position        Int       @default(0)
  generatedCount  Int       @default(0)
  lastGeneratedAt DateTime?
  createdById     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  todo      Todo   @relation("TodoRecurringSubtasks", fields: [todoId], references: [id], onDelete: Cascade)
  assignee  User?  @relation("RecurringSubtaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  createdBy User?  @relation("RecurringSubtaskCreator", fields: [createdById], references: [id], onDelete: SetNull)
  generated Todo[] @relation("RecurringSubtaskOccurrences")

  @@index([todoId, position])
  /// The generator's scan predicate.
  @@index([archivedAt, pausedAt, nextDueDate])
  @@map("todo_recurring_subtasks")
}
```

| ID | Requirement |
|---|---|
| RST-2 | **`Todo` gains** `recurringSubtaskId String?` (relation `"RecurringSubtaskOccurrences"`, `onDelete: SetNull`) and `subtaskOccurrenceDate DateTime?`, with `@@index([recurringSubtaskId, status])` and `@@unique([recurringSubtaskId, subtaskOccurrenceDate])` (Postgres allows many NULL pairs, so ordinary cards are unaffected). `Todo` also gains the back-relation `recurringSubtasks TodoRecurringSubtask[] @relation("TodoRecurringSubtasks")`. `User` gains the two back-relations. |
| RST-3 | **No chains.** A card with `recurringSubtaskId` set cannot hold recurring sub-tasks (`POST` returns 400 "This task was created by a recurring sub-task. Add repeats on its parent card.") and cannot be given a card-level `recurrenceRule` (`PATCH /api/todos/[id]` returns 400 with the same message). Card-level series heads **may** hold recurring sub-tasks; `runTodoRecurrence` does **not** copy them to occurrences (it copies only the relations it lists, §1.1). |
| RST-4 | **Anchor semantics** (one pure helper, RSG-1): DAILY — every day from `anchorDate`. WEEKDAYS — Mon–Fri; a weekend `anchorDate` is normalised to the next Monday on save. WEEKLY — the weekday of `anchorDate`. BIWEEKLY — the weekday of `anchorDate`, every 14 days from it. MONTHLY — day `monthDay ?? anchorDate.getDate()`, clamped to the month's length (31 → 28/29/30/31). YEARLY — `anchorDate`'s month, day `monthDay` clamped (Feb 29 → Feb 28). |
| RST-5 | **First occurrence.** On create, `nextDueDate = anchorDate` (normalised per RST-4). `anchorDate` must be ≥ today (local) — the UI defaults it to the next matching day (e.g. "weekly · Mon" on a Thursday → next Monday). |
| RST-6 | **Limits.** At most **20** non-archived sub-tasks per card [A]; title 1–200 chars; description ≤ 2 000 chars; times `^([01]\d\|2[0-3]):[0-5]\d$` with `endTime > startTime` when both are set; `endsAt ≥ anchorDate`; `monthDay` 1–31 and only for MONTHLY/YEARLY; `assigneeId` must be an active user (`isActive`). Validated with one Zod schema shared by POST and PATCH (`lib/todos/recurring-subtasks.schema.ts`). |
| RST-7 | **What a generated task inherits** (decision table; read from the parent **at generation time**, so later edits to the parent apply to future tasks only): |

| Field on the generated `Todo` | Value | Why |
|---|---|---|
| `title` | sub-task `title` | The chore's own name ("Reconcile bank"). The parent's name appears as the "From" link (RSU-9). |
| `description` | sub-task `description` | Parent's description describes the container, not the chore. |
| `status` | `PENDING` | |
| `sprintId` / `columnId` | parent's current sprint (RST-10) and that sprint's first `PENDING` lane via `getSprintLanes()` — same rule as `POST /api/todos`; `sprintPosition` default | D3. The parent's own lane is not used: the parent may sit in "In Progress" permanently. |
| `assigneeId` | sub-task `assigneeId` | The whole point of per-item assignment. |
| members | the sub-task assignee if set; **otherwise the parent's members** | The board filter (AFL-4) and reminders (DTE-4) key off members; an unassigned chore with no members would notify nobody. [A] |
| `creatorId` | sub-task `createdById`, else the parent's `creatorId` | `creatorId` is required; the rule's author is who "made" it. |
| `keyResultId` / `objectiveId` | parent's | The chore is part of the parent's OKR work and stays visible to the KR/objective owner exactly as the parent is. |
| `progressValue` | **null** | Never re-count the parent's contribution into the KR on every completion (`recalcKrFromInitiatives` sums completed initiatives). |
| labels | parent's labels | "Finance" on the parent makes every chore filterable as Finance. |
| `priority` | sub-task `priority ?? parent.priority` | |
| `dueDate` | the occurrence date | |
| `startDate` | = `dueDate` when `startTime` is set, else null | Gives the calendar a timed block (`CDT-2`: start = due + start/end times) or a deadline point (due + `endTime`). |
| `startTime` / `endTime` | sub-task's | |
| `dueReminder` / `dueReminderSentAt` | sub-task's / **null** | Null arms the existing reminder sweep. |
| `recurringSubtaskId` / `subtaskOccurrenceDate` | the sub-task / the occurrence date | Lineage + idempotency key (RST-2). |
| `recurrenceRule` / `recurrenceParentId` | null / null | Separate lineage; no fan-out (RST-3). |
| not copied | cover, `taskType`, checklists, attachments, comments, watchers, carryover fields, `aiSuggested` (false) | Describe the container or a single run, not the chore. Watchers of the parent watch the parent. [A] |

| ID | Requirement |
|---|---|
| RST-8 | When the sub-task has an assignee, that user is **also** added as a `TodoMember` of the generated card (skip duplicates). |
| RST-9 | **Parent state gates generation (D4).** The parent is *active* when `archivedAt IS NULL` and `status ∉ {COMPLETED, CANCELLED}`. Otherwise its sub-tasks are *suspended*: the generator advances their cursor past every date inside the horizon **without creating** cards, and counts them as `skipped`. The UI shows "Paused while this card is done" / "…archived". Reopening or unarchiving needs no hook. |
| RST-10 | **Target sprint.** (a) Parent in an open sprint (PLANNING/ACTIVE) → that sprint. (b) Parent in no sprint → backlog (`sprintId = null`, `columnId = null`). (c) Parent in a closed sprint while still active — not reachable through `executeSprintClose`, which moves every incomplete card, but reachable after a manual status change on a closed sprint's card — → the closed sprint's `SprintCompletionSummary.nextSprintId` if that sprint is PLANNING/ACTIVE, else the backlog. [A] |
| RST-11 | **Moving the parent** to another sprint or to the backlog changes where **future** tasks land. Already-generated tasks stay where they are; they are independent cards. |
| RST-12 | **Deleting the parent card** cascades its sub-tasks (`onDelete: Cascade`); generated tasks survive with `recurringSubtaskId` set to null (`SetNull`), so their "From" link disappears but their `ActivityLog` creation row keeps `parentTodoId`/`parentTitle` in its metadata (RSPM-6). |
| RST-13 | **Deleting a sub-task** is a soft delete: `archivedAt = now`. Future tasks stop; generated tasks keep their link and history. Archived sub-tasks are listed under "Stopped (n)" and can be **restored**, which resumes them per RST-15. Hard deletion happens only through RST-12. |
| RST-14 | **Pause** sets `pausedAt`; the generator ignores paused rows (they are not advanced). |
| RST-15 | **Resume** (and restore) clears `pausedAt`/`archivedAt` and sets `nextDueDate` to the first rule date **≥ today** and **> the latest generated `subtaskOccurrenceDate`**. It never back-fills missed dates. |
| RST-16 | **Editing mid-series** changes future tasks only. Editing `title`, `description`, `assigneeId`, `priority`, times or `dueReminder` leaves the cursor alone. Editing `rule`, `anchorDate` or `monthDay` recomputes `nextDueDate` as in RST-15. Already-generated tasks are never modified (an "also update open tasks" option is P2, open question Q5). Editing `endsAt` to a date before `nextDueDate` makes the rule *ended* (shown as "Ended 30 Sep"), not paused. |
| RST-17 | **Duplicating the parent** (`POST /api/todos/[id]/duplicate`) copies its non-archived sub-tasks **paused**, with counters zeroed and `nextDueDate = anchorDate` recomputed on resume, so a copy never silently doubles the chores. [A] |
| RST-18 | **Card-level recurrence occurrences** of a parent do not receive its sub-tasks (RST-3); the sub-tasks stay on the head. |

- **RST-AC-1** — *Given* a "Finance operations" card and a sub-task "Reconcile bank · weekly · Mon"
  created on Thu 24 Sep, *then* `anchorDate = nextDueDate = Mon 28 Sep` and no task exists yet.
- **RST-AC-2** — *Given* a sub-task "Payroll run · monthly · Last day" anchored 31 Jan, *then* its
  tasks are due 31 Jan, 28 Feb, 31 Mar, 30 Apr (no drift to the 28th).
- **RST-AC-3** — *Given* a generated task, *when* anyone POSTs a recurring sub-task to it or PATCHes a
  `recurrenceRule` onto it, *then* the response is 400 and nothing changes.
- **RST-AC-4** — *Given* a parent in sprint S1 whose sub-task generated a task for 28 Sep, *when* the
  parent is carried into S2 at close and the next task (5 Oct) is generated, *then* the 28 Sep task
  is wherever close put it and the 5 Oct task is in S2's first PENDING lane.
- **RST-AC-5** — *Given* a parent marked COMPLETED on 1 Oct with a daily sub-task, *when* the
  generator runs on 2–9 Oct, *then* no tasks are created; *when* the parent is reopened on 10 Oct
  and the generator runs that night, *then* exactly one task (due 11 Oct) is created — none for 2–10 Oct.
- **RST-AC-6** — *Given* a sub-task with 12 generated tasks, *when* it is deleted, *then* the 12 tasks
  still exist, still show "From: Finance operations", and no further task is ever generated.
- **RST-AC-7** — *Given* a sub-task paused on 1 Oct and resumed on 20 Oct, *then* its next task is the
  first rule date ≥ 20 Oct; nothing is created for 1–19 Oct.
- **RST-AC-8** — *Given* "Reconcile bank · weekly · Mon" with a task generated for Mon 28 Sep, *when*
  the rule is changed on Wed 30 Sep to "weekly · Tue", *then* `nextDueDate` becomes Tue 6 Oct (the
  first Tuesday ≥ today and > 28 Sep), the 28 Sep task is unchanged, and no task is created for
  Tue 29 Sep.
- **RST-AC-9** — *Given* a sub-task without an assignee on a parent with members A and B, *then* each
  generated task has members A and B and no assignee.

### 4.2 Generator — `RSG`

| ID | Requirement |
|---|---|
| RSG-1 | **Engine extension, pure** (`lib/todos/recurrence.ts`): `nextOccurrence(rule, from, opts?: { monthDay?: number })` — when `monthDay` is given, MONTHLY/YEARLY clamp to `min(monthDay, daysInTargetMonth)` instead of `from`'s day. Without `opts` the behaviour is byte-for-byte today's, so R-01..R-12 pass unchanged. New `normaliseAnchor(rule, date)` (WEEKDAYS weekend → Monday) and `firstOnOrAfter(rule, anchor, monthDay, floor)` (used by RST-15/16). New `subtaskOccurrencesUpTo({ rule, nextDueDate, monthDay, endsAt }, now, horizonDays, maxPerRun, staleGraceDays)` returning `{ create: Date[], skip: Date[], nextCursor: Date }`. |
| RSG-2 | **Horizon and cap reuse DTE-5's semantics.** `HORIZON_DAYS` (1) and `MAX_PER_SERIES_PER_RUN` (5) are exported from `recurrence-generator.ts` and used by both generators. A date is due for creation when `date ≤ today + HORIZON_DAYS` and `date ≤ endsAt` (inclusive). |
| RSG-3 | **No stale back-fill.** Dates older than `today − STALE_GRACE_DAYS` (**7**) are skipped (cursor advances, `skipped++`), so a cron outage produces at most a week of catch-up and at most 5 cards per sub-task per run. [A] (DTE-5 has no grace; the difference is deliberate: a 30-day-old "Petty cash count" is noise.) |
| RSG-4 | **Scan.** `runRecurringSubtasks(now)` pages through `archivedAt IS NULL AND pausedAt IS NULL AND nextDueDate ≤ today + HORIZON_DAYS` ordered by `id`, 200 per page, until exhausted — **no silent `take` cap**. Each row is loaded with its parent (`status`, `archivedAt`, `sprintId`, sprint `state`, `creatorId`, `priority`, KR/objective ids, members, labels) and assignee `isActive`. |
| RSG-5 | **Idempotency.** Per sub-task, one `prisma.$transaction`: (1) `updateMany({ where: { id, nextDueDate: <cursor read> }, data: { nextDueDate: nextCursor, generatedCount: { increment: n }, lastGeneratedAt: now } })` — if `count === 0` another run won; abort this sub-task; (2) create the `n` cards (RST-7) with their members and labels. The `(recurringSubtaskId, subtaskOccurrenceDate)` unique index is the backstop: a `P2002` aborts the transaction and is counted as `conflicts`, never as an error. A re-run the same day creates nothing. |
| RSG-6 | **Suspended parent** (RST-9): advance the cursor past in-horizon dates, create nothing, `suspended++`. |
| RSG-7 | **Inactive assignee.** If the assignee is no longer `isActive`, the task is still created, **unassigned**, with the parent's members (RST-7 fallback), and the sub-task gets a warning flag in the API (`assigneeInactive: true`) so the UI can prompt a reassignment. The rule is not silently paused. [A] |
| RSG-8 | **Per-row isolation.** One failing sub-task is logged (`console.error` with its id) and counted in `failed`; the run continues. |
| RSG-9 | **Summary** `{ scanned, generated, skipped, suspended, conflicts, failed }`. |
| RSG-10 | **Timezone.** Date arithmetic follows the existing engine: local-midnight on the server, calendar-day maths via `date-fns` (`addDays`, `differenceInCalendarDays`), never ms offsets (calendar CDT-13). Stored dates follow the app's "`YYYY-MM-DD` → UTC midnight, read as local day" convention (calendar §1.3). [A — see Q8 on server TZ.] |

- **RSG-AC-1** — *Given* a daily sub-task with `nextDueDate` = tomorrow, *when* the generator runs
  twice today, *then* exactly one task exists for tomorrow and the cursor is the day after.
- **RSG-AC-2** — *Given* a daily sub-task whose cursor is 30 days old (cron outage), *when* the
  generator runs, *then* dates older than 7 days are skipped and 5 tasks are created; the next run
  creates the remaining ones up to tomorrow; no run creates more than 5.
- **RSG-AC-3** — *Given* two overlapping generator runs, *then* each date is created exactly once and
  the loser reports a conflict or no-op, not an error.
- **RSG-AC-4** — *Given* 450 due sub-tasks, *then* all 450 are processed in one run.
- **RSG-AC-5** — *Given* a sub-task with `endsAt = 30 Sep` and `nextDueDate = 30 Sep`, *then* the
  30 Sep task is created and no later one ever is.

### 4.3 API — `RSA`

All routes: `withAuth`, the standard envelope (`apiSuccess`/`apiBadRequest`/…), thin handlers over
`lib/todos/recurring-subtasks.ts` (service) and the shared Zod schema (RST-6).

| ID | Requirement |
|---|---|
| RSA-1 | `GET /api/todos/[id]/recurring-subtasks[?includeStopped=1]` → `data: RecurringSubtaskDTO[]` ordered by `position`. DTO: `id, title, description, rule, ruleLabel, anchorDate, monthDay, nextDueDate, startTime, endTime, dueReminder, priority, assignee{id,name,avatar}, assigneeInactive, endsAt, state ('ACTIVE'\|'PAUSED'\|'SUSPENDED'\|'ENDED'\|'STOPPED'), counts{ generated, open, done }, canEdit`. Counts come from **one** `groupBy(recurringSubtaskId, status)` per card, not per row. |
| RSA-2 | `POST /api/todos/[id]/recurring-subtasks` → 201 with the DTO. Body per RST-6. `position` = end of list. |
| RSA-3 | `PATCH /api/todos/[id]/recurring-subtasks/[subtaskId]` — any subset of the editable fields plus `paused: boolean`, `stopped: boolean` (restore = `stopped:false`) and `position`. Applies RST-14..16. |
| RSA-4 | `DELETE /api/todos/[id]/recurring-subtasks/[subtaskId]` — soft delete (RST-13). Idempotent. |
| RSA-5 | `GET /api/todos/[id]/recurring-subtasks/[subtaskId]/occurrences?cursor=&limit=20` — generated tasks newest-first: `id, cardNumber, title, status, dueDate, completedAt, archivedAt, sprint{id,name,state}`, with `pagination` in the envelope. `limit ≤ 50`. |
| RSA-6 | **Ownership checks:** every `[subtaskId]` route verifies the sub-task's `todoId` equals `[id]` (404 otherwise) — unlike the checklist routes (§1.3). |
| RSA-7 | `GET /api/todos/[id]` (`TODO_INCLUDE`) gains `recurringSubtasks` (non-archived, the RSA-1 DTO without counts) and, on generated cards, `recurringSubtask { id, title, rule, monthDay, anchorDate, todo { id, title, cardNumber, sprintId } }` for the "From" link. |
| RSA-8 | `GET /api/sprints/[id]/board` `TODO_INCLUDE` gains `_count.recurringSubtasks` (non-archived) for the parent badge and the same small `recurringSubtask` include for generated cards' badge tooltip. The ghost-source summary for the calendar is RSC-3. |
| RSA-9 | Mutations invalidate the client caches the card modal already invalidates (`['sprint-board', id]`, todo store refresh) plus `['recurring-subtasks', todoId]`. |

- **RSA-AC-1** — *Given* a sub-task id belonging to card B, *when* it is PATCHed under card A's URL,
  *then* 404 and nothing changes.
- **RSA-AC-2** — *Given* a card with 5 sub-tasks, *when* RSA-1 is called, *then* the query count is
  constant (not 5 + 1).

### 4.4 UI/UX — `RSU`

Design system per `docs/DESIGN_SYSTEM.md` §12: the card modal is an `--ap-*` surface. Lucide
`Repeat` (↻) at ~1.75 px; no hardcoded hex; skeletons over spinners; `ease-apple` 180 ms.

| ID | Requirement |
|---|---|
| RSU-1 | **Section.** A distinct **"Recurring sub-tasks"** section in the card modal's content pane, **after the checklists and before attachments**, headed by ↻ + title + a count ("3"), visually separate from checklists (no checkbox, no progress bar). It is shown when the card has sub-tasks; otherwise it is reached from "+ Add" (ATC-1 gains a row "Recurring sub-task — A to-do that creates its own task on a schedule") and from the right sidebar's action list, beside "Checklist". |
| RSU-2 | **Row** (one per sub-task): ↻ glyph · title · rule chip ("Weekly · Mon", "Monthly · 25th", "Daily", "Every weekday", "Monthly · Last day", "Yearly · 14 Mar") with time if set ("· 09:00") · assignee avatar (or "Unassigned") · **"Next: Mon 28 Sep"** (or the state text: "Paused", "Paused while this card is done", "Ended 30 Sep") · counts "12 made · 2 open" as a button that opens the history popover (RSU-5) · a **pause toggle** (switch with `aria-label="Pause Reconcile bank"`) · an `ActionsMenu` overflow: **Edit**, **Skip next** (P2), **Pause/Resume**, **Delete**. Hover-only controls use the checklist row's fade pattern (opacity, reserved space, `group-focus-within`) so rows never reflow. |
| RSU-3 | **Add / edit form** (inline, expands in place of the row or below the list; `react-hook-form` + the RST-6 Zod schema): **Title** · **Repeats** (`FilterSelect` over `RECURRENCE_RULES` with a "Monthly (last day)" convenience) · **On** — weekday chips `M T W T F S S` in an `.ap-segmented` group for WEEKLY/BIWEEKLY; a day select `1…31, Last day` for MONTHLY; a date for YEARLY; nothing for DAILY/WEEKDAYS · **Starts** (`AppleDatePicker`, default = next matching day, min today) · **Time** (optional start/end `HH:mm`, same inputs as `DatesPanel`) · **Assign** (the checklist assign `Popover` pattern over `useUsersForSelection`, active users only) · **Reminder** (`DUE_REMINDERS`, default None) · **Ends** (optional date) · **Priority** (optional; placeholder "Same as card"). A live sentence under the form summarises it: "Creates 'Reconcile bank' every Monday for Abebe, starting Mon 28 Sep." Save is disabled until valid; errors are inline. |
| RSU-4 | **Delete** goes through `ConfirmDialog`: "Stop 'Reconcile bank'? No more tasks will be created. The 12 tasks already created are kept." |
| RSU-5 | **History popover** (`Popover`, width 320): the RSA-5 list — status dot (`todoStatusMeta`), title, due date, sprint name — each row opens that card; "Load more" for pagination; `EmptyState` "No tasks yet — the first one is created the day before Mon 28 Sep." Skeleton rows while loading. |
| RSU-6 | **Stopped sub-tasks** are behind a "Show stopped (n)" disclosure with a **Restore** action. |
| RSU-7 | **Reorder** by drag handle or ↑/↓ in the overflow (keyboard path first; the handle uses `@dnd-kit` only if the checklist section has migrated by then). |
| RSU-8 | **Closed sprint (CDM-11)** and users without write access (RSPM-1): the section renders as a record — no add button, no toggles, no overflow — but rows, "Next:", counts and the history popover remain. |
| RSU-9 | **Generated card modal**: under the title, a quiet banner "↻ From **Finance operations** · Reconcile bank — weekly · Mon", where the parent name opens the parent card (same deep-link mechanism as Copy link / `?card=` on the board, `?open=` on the to-dos page). If the parent was deleted the banner reads "↻ From a recurring sub-task that was removed". The card-level Recurring select in `DatesPanel` is disabled with "Repeats are set on the parent card" (RST-3). |
| RSU-10 | **Card front** (`TaskCardTrello` badge row and the to-dos list row): generated cards show a ↻ badge with `title`/`aria-label` "Repeats weekly · from Finance operations"; parent cards show "↻ 3" ("3 recurring sub-tasks"). Card-level series heads get the same ↻ badge (they have none today, §1.1) so the three cases read consistently. |
| RSU-11 | **Deleting a parent** that has sub-tasks: the existing delete `ConfirmDialog` adds "Its 3 recurring sub-tasks will stop. The 42 tasks they created are kept." |
| RSU-12 | **P2 — "Make recurring…"** in the checklist item overflow (CDM-8's menu): opens RSU-3 prefilled with the item's title, assignee and due date as **Starts**; on save the checklist item is removed (with Undo toast). |
| RSU-13 | **Announcements**: create, pause, resume, delete announce via `announce()` (`LiveAnnouncer`), e.g. "Reconcile bank paused". |
| RSU-14 | **Mobile (< md)**: rows wrap to two lines (title + rule / next + avatar + overflow); the pause toggle moves into the overflow; the form stacks fields one per line. |

**Wireframe — section in the card modal (desktop)**

```
┌─ Finance operations ──────────────────────────────────────────────── ✕ ┐
│ ○ Finance operations                                  [ In Progress ⌄ ] │
│ Members ◉◉◉   Labels ▌Finance   Dates —                                 │
│ Description …                                                           │
│                                                                         │
│ ☑ Month-end checklist                                   3/5            │
│   ███████████░░░░░░                                                     │
│   ☐ Close AP ledger …                                                   │
│                                                                         │
│ ↻ Recurring sub-tasks  3                                  [ + Add ]     │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ↻ Reconcile bank     Weekly · Mon         ◉ Abebe  Next: Mon 28 Sep │ │
│ │                      12 made · 1 open ▸                    (●)  ⋯   │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ ↻ Payroll run        Monthly · 25th · 09:00 ◉ Sara Next: Sun 25 Oct │ │
│ │                      8 made · 0 open ▸                     (●)  ⋯   │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ ↻ Petty cash count   Daily                ◉ Dawit  Paused           │ │
│ │                      40 made · 2 open ▸                    ( ○) ⋯   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│   Show stopped (1)                                                      │
└─────────────────────────────────────────────────────────────────────────┘
   (●) = active switch   ( ○) = paused   ⋯ = Edit · Skip next · Pause · Delete
```

**Wireframe — add / edit form**

```
┌─ New recurring sub-task ────────────────────────────────────────────┐
│ Title    [ Reconcile bank                                        ]   │
│ Repeats  [ Weekly               ⌄ ]                                  │
│ On       ( M )( T )( W )( T )( F )( S )( S )     ← .ap-segmented     │
│ Starts   [ Mon 28 Sep 2026  📅 ]   Time [ --:-- ] – [ 10:00 ]        │
│ Assign   [ ◉ Abebe Kebede    ⌄ ]   Reminder [ 1 hour before ⌄ ]      │
│ Ends     [ Never             📅 ]  Priority [ Same as card  ⌄ ]      │
│                                                                      │
│ Creates "Reconcile bank" every Monday for Abebe, due 10:00,          │
│ starting Mon 28 Sep.                                                 │
│                                            [ Cancel ]  [ Save ]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Wireframe — history popover and a generated card**

```
 12 made · 1 open ▸
 ┌─ Reconcile bank ─────────────────────────┐   ┌─ Reconcile bank ───────────────── ✕ ┐
 │ ● Open      Mon 28 Sep   Sprint 14       │   │ ○ Reconcile bank                     │
 │ ● Done      Mon 21 Sep   Sprint 13       │   │ ↻ From Finance operations ·          │
 │ ● Done      Mon 14 Sep   Sprint 13       │   │   Reconcile bank — weekly · Mon      │
 │ ● Cancelled Mon  7 Sep   Sprint 12       │   │ Members ◉  Labels ▌Finance           │
 │            [ Load more ]                 │   │ Dates  Due Mon 28 Sep, 10:00         │
 └──────────────────────────────────────────┘   └──────────────────────────────────────┘

 Board card front:  ┌──────────────────────────┐
                    │ ▌Finance                 │
                    │ Reconcile bank           │
                    │ 📅 Sep 28  ↻             │
                    │                     ◉    │
                    └──────────────────────────┘
```

- **RSU-AC-1** — *Given* the add form with "Weekly" and "Mon" on Thu 24 Sep, *then* Starts defaults
  to Mon 28 Sep and the summary sentence says so; *when* Save is pressed, *then* the row appears
  with "Next: Mon 28 Sep" without a full modal refetch flash.
- **RSU-AC-2** — *Given* a card in a COMPLETED sprint, *then* the section shows rows and history but
  no add, toggle or overflow controls, and a forged PATCH returns 409 `SPRINT_CLOSED`.
- **RSU-AC-3** — *Given* a generated card, *when* "Finance operations" in its banner is clicked,
  *then* the parent card opens.
- **RSU-AC-4** — *Given* keyboard only, *then* a user can add, pause, open history and delete a
  sub-task without a mouse, and focus returns to the row's overflow after each popover closes.
- **RSU-AC-5** — *Given* a board with generated and parent cards, *then* generated cards show a ↻
  badge whose accessible name includes the rule and parent, and parents show "↻ n".

### 4.5 Calendar integration — `RSC`

Cross-references `calendar_view_REQUIREMENTS.md`. That spec should add **CDT-10a** (and extend
CAPI-4 and CUX-15) pointing at RSC-2..5; this document does not edit it.

| ID | Requirement |
|---|---|
| RSC-1 | **Generated tasks are ordinary cards** in every calendar host (CDT-8): draggable, completable; moving one moves only that one and never touches the rule. |
| RSC-2 | **Projected sub-task repeats (CDT-10a).** For every *active* sub-task (not paused, stopped, suspended or ended) whose parent is within the host's rows (or ghost sources, RSC-3), dates from `nextDueDate` to the end of the visible range (and `endsAt`) are computed with the RSG-1 helpers and drawn as **ghost** events titled "↻ Reconcile bank", with the sub-task's time if set. Same cap (62 per sub-task per range), same "Show future repeats" toggle, same exclusion from "N in view" and from the Unscheduled tray (CDT-11). Because ghosts start at the cursor, a date that already has a generated card never also shows a ghost. |
| RSC-3 | **Ghost sources.** A parent card often has no dates (it sits in the Unscheduled tray). So: the sprint board payload (CAPI-1) includes, per card, `recurringSubtasks` = the active ones' `{ id, title, rule, monthDay, anchorDate, nextDueDate, endsAt, startTime, endTime, assignee{id,name,avatar} }`; and `GET /api/todos/calendar` (CAPI-2/4) returns parents with an active sub-task whose `nextDueDate ≤ to` as ghost sources, subject to the same visibility builder (CPM-1/2) — the parent itself is only an *item* if it matches the range on its own dates. |
| RSC-4 | **Ghost interaction.** Read-only; clicking opens the **parent** card scrolled to the Recurring sub-tasks section with that row highlighted. The hover card (CUX-15) shows "Repeats weekly · Mon · from Finance operations · Abebe". |
| RSC-5 | Ghost chips use CUX-13's ghost style (dashed border, no completion circle) and CA11Y-6's accessible name ("Reconcile bank, repeats weekly, projected"). |

- **RSC-AC-1** — *Given* "Reconcile bank · weekly · Mon" with a task generated for 28 Sep, *when* the
  October month view opens, *then* 28 Sep shows the real card and 5, 12, 19, 26 Oct show dashed
  ghosts; 28 Sep shows no ghost.
- **RSC-AC-2** — *Given* the sub-task is paused, *then* no ghosts are drawn.
- **RSC-AC-3** — *Given* a parent with no dates on the sprint calendar, *then* its sub-tasks' ghosts
  still appear on the grid, and the parent chip appears only in the Unscheduled tray.

### 4.6 Permissions, notifications and audit — `RSPM`

| ID | Requirement |
|---|---|
| RSPM-1 | **Write** (create, edit, pause, resume, delete, restore, reorder) = whoever may `PATCH` the parent card: `canWriteTodo(session, parentId)` extracted from `app/api/todos/[id]/route.ts:176-231` into `lib/todos/access.ts` (shared with calendar **CPM-3**). 403 otherwise. The DTO's `canEdit` uses the same function so the UI hides what the server would refuse. |
| RSPM-2 | **Closed sprint.** Every mutation returns 409 `SPRINT_CLOSED` when the parent's sprint is COMPLETED/CANCELLED (`sprintClosedGuard` from `lib/sprints/guards.ts`). |
| RSPM-3 | **Read.** The list and history endpoints are readable by whoever can open the parent card (today: any signed-in user, because `GET /api/todos/[id]` has no view check — flagged, §1.6; they adopt calendar **CPM-2**'s visibility builder once it exists, so they never show more than the card itself). |
| RSPM-4 | **Assignee choice.** Any active user, as for card assignment today (`POST /api/todos` does not restrict `assigneeId`). [A — Q6] |
| RSPM-5 | **Notifications.** (a) On create, or when `assigneeId` changes, to someone other than the actor: `emit('TODO_ASSIGNED', { actorId, entityType: 'TODO', entityId: parentId, entityTitle: '<sub-task title> (repeats weekly · Mon)', explicitRecipients: [assigneeId], data: { actorName, deepLink: '/dashboard/todos?open=<parentId>' } })`. (b) **Per generated card: no `TODO_ASSIGNED`/`SPRINT_TASK_ASSIGNED`** (D6); the card is announced by the existing `TODO_DUE_TOMORROW` sweep (assignee) and, if set, the per-card `dueReminder` (members + watchers + assignee). (c) No new `EventKey`. |
| RSPM-6 | **Audit** via `recordActivity` (new `ActivityAction` members): on the **parent** card — `RECURRING_SUBTASK_CREATED`, `RECURRING_SUBTASK_UPDATED` (with a `changes` map), `RECURRING_SUBTASK_PAUSED`, `RECURRING_SUBTASK_RESUMED`, `RECURRING_SUBTASK_DELETED`, `RECURRING_SUBTASK_RESTORED`; on **each generated card** — `INITIATIVE_CREATED` with `actorId: null` and `metadata: { source: 'RECURRING_SUBTASK', recurringSubtaskId, parentTodoId, parentTitle, occurrenceDate }`, written inside RSG-5's transaction (pass `tx` if `recordActivity` accepts a client; otherwise immediately after commit). Generation is **not** logged on the parent, so a daily sub-task does not flood the parent's activity rail; the history popover is the parent-side view. |
| RSPM-7 | **Visibility of generated cards** follows the existing to-do rules unchanged: assignee, creator (the rule author), members, and KR/objective owners via the inherited link see them; sprint members see them on the board. No new visibility path is added. |
| RSPM-8 | **Card permissions on a generated card** are the ordinary ones (participant / KR manager / role / RBAC). The parent's editors do **not** gain edit rights on generated cards they are not otherwise entitled to. |

- **RSPM-AC-1** — *Given* an EMPLOYEE who is not a participant of the parent and has no role or RBAC
  grant, *then* the section shows no controls, and POST/PATCH/DELETE return 403 with no row changed.
- **RSPM-AC-2** — *Given* a sub-task assigned to B by A, *then* B receives one `TODO_ASSIGNED`; *when*
  the generator later creates 10 daily tasks, *then* B receives no further `TODO_ASSIGNED` and one
  `TODO_DUE_TOMORROW` per task through the normal daily cadence.
- **RSPM-AC-3** — *Given* any sub-task mutation, *then* exactly one `ActivityLog` row is written on the
  parent; *given* a generation run creating 3 tasks, *then* each of the 3 cards has one
  `INITIATIVE_CREATED` row with `source: 'RECURRING_SUBTASK'`.

### 4.7 Cron and ops — `RSO`

| ID | Requirement |
|---|---|
| RSO-1 | `app/api/cron/todo-recurrence/route.ts` runs `runTodoRecurrence()` **then** `runRecurringSubtasks()` and returns `data: { cards: RecurrenceSummary, subtasks: RecurringSubtaskSummary }`. The response shape change is additive for anything reading `data` [A — nothing in the repo reads it besides curl]. Auth unchanged. |
| RSO-2 | **No crontab change.** The existing `0 1 * * *` UTC (04:00 EAT) entry covers both. `scripts/install-crontab.sh`: update the comment on the `add todo-recurrence` line to "…recurring cards (DTE-5) and recurring sub-tasks". Because `add()` skips lines whose match already exists, **no re-run is needed on the VPS**. |
| RSO-3 | `docs/CRON.md` §To-dos: update the `todo-recurrence` row's purpose and add a paragraph on sub-tasks — cursor-in-transaction idempotency, the unique backstop, the 5-per-run cap, the 7-day stale grace, and "suspended parents advance without creating". |
| RSO-4 | **Deploy:** schema is additive → `scripts/preflight.sql` block (idempotent `CREATE TABLE IF NOT EXISTS "todo_recurring_subtasks"`, `ALTER TABLE "initiatives" ADD COLUMN IF NOT EXISTS "recurringSubtaskId" TEXT, ADD COLUMN IF NOT EXISTS "subtaskOccurrenceDate" TIMESTAMP(3)`, the indexes and the unique index) then `prisma db push`, which `scripts/deploy.sh` already orders. |

### 4.8 Fixes to card-level recurrence — `REC-FIX`

| ID | Requirement |
|---|---|
| REC-FIX-1 | **Advance the head's `startDate` with its cursor.** In `lib/todos/recurrence-generator.ts`, compute the head's span **once, before the loop**, as whole calendar days `spanDays = differenceInCalendarDays(head.dueDate, head.startDate)` (null when either is null). Each occurrence gets `startDate = subDays(due, spanDays)` (today it is ms arithmetic re-derived from a head whose due has moved — §1.2). The transaction's head update (`:140-143`) becomes `data: { dueDate: lastDate, ...(spanDays !== null && { startDate: subDays(lastDate, spanDays) }) }`. A head with only a due date is unchanged. `startTime`/`endTime` are untouched. |
| REC-FIX-1r | **One-off repair** `scripts/repair-recurrence-heads.ts` (dry-run by default, `--apply` to write; prints each change): for every head with `startDate` and at least one occurrence, take its **earliest** occurrence (generated in the first run, before any drift) and set `head.startDate = subDays(head.dueDate, differenceInCalendarDays(first.dueDate, first.startDate))`. Occurrences already created with inflated spans are listed but **not** changed (they may have been edited by people) [A — Q9]. |
| REC-FIX-2 | **Shift checklist item dates.** For each occurrence, `offsetDays = differenceInCalendarDays(occurrenceDue, headDueAtRead)`; copied items get `startDate = item.startDate && addDays(item.startDate, offsetDays)` and `dueDate = item.dueDate && addDays(item.dueDate, offsetDays)` ("item date − head due + occurrence due"). **And** the head's own checklist items' dates are shifted by `differenceInCalendarDays(lastDate, headDueAtRead)` in the same transaction (only dated items; ticks untouched). Without the second half the formula is wrong from the second run on, because the head's due moves but its items do not (e.g. item 15 Sep, head 16 → 23 Sep: run 2 would compute 15 − 23 + 30 = 22 Sep instead of 29 Sep). |
| REC-FIX-2r | The REC-FIX-1r script also realigns head checklist item dates: `delta = differenceInCalendarDays(head.dueDate, originalHeadDue)` where `originalHeadDue = previousOccurrence(rule, first.dueDate)` (a small inverse helper; exact for DAILY/WEEKLY/BIWEEKLY, WEEKDAYS steps back over weekends, MONTHLY/YEARLY step back one period with clamp). Dry-run first. |
| REC-FIX-3 | The `DatesPanel` helper text changes to "…carrying the members, labels and checklist (with its dates) across." |

- **REC-FIX-AC-1** — *Given* a weekly head start Mon 14 Sep, due Wed 16 Sep, *when* the generator has
  run three times, *then* occurrences span 21–23, 28–30 Sep and 5–7 Oct, and the head spans 5–7 Oct.
- **REC-FIX-AC-2** — *Given* a head without a start date, *then* nothing about start dates changes.
- **REC-FIX-AC-3** — *Given* a weekly head due 16 Sep with an item due 15 Sep and an item with no date,
  *when* two runs have happened, *then* the occurrences' items are due 22 Sep and 29 Sep, the undated
  item stays undated, and the head's item is due 29 Sep.
- **REC-FIX-AC-4** — *Given* the repair in dry-run, *then* it writes nothing and prints one line per
  head it would change.

---

## 5. Reuse audit **[V]**

| Need | Reused | New (gap it fills) |
|---|---|---|
| Rule set, labels, next date, month clamp | `lib/todos/recurrence.ts` (`RECURRENCE_RULES`, `recurrenceLabel`, `nextOccurrence`, `addMonthsClamped`) | `opts.monthDay`, `normaliseAnchor`, `firstOnOrAfter`, `subtaskOccurrencesUpTo`, `previousOccurrence` — additive, pure |
| Horizon / cap constants, cron auth, schedule | `recurrence-generator.ts` constants (exported), `app/api/cron/todo-recurrence`, `install-crontab.sh` entry | `runRecurringSubtasks()` in `lib/todos/recurring-subtask-generator.ts` |
| Lane placement | `getSprintLanes()` (`lib/sprints/columns.ts`) | — |
| Write access | PATCH's inline rule | `canWriteTodo()` in `lib/todos/access.ts` (shared with calendar CPM-3) |
| Closed sprint | `sprintClosedGuard()` (`lib/sprints/guards.ts`) | — |
| Reminders | `DUE_REMINDERS`, `todo-reminders` cron, `TODO_DUE_TOMORROW` job | — |
| Notifications / audit | `emit('TODO_ASSIGNED')`, `recordActivity()` | 6 `ActivityAction` members |
| API plumbing | `withAuth`, `apiSuccess`/`apiBadRequest`/…, `resolveParams` | 3 route files |
| Forms | `react-hook-form`, Zod | `lib/todos/recurring-subtasks.schema.ts` |
| UI primitives | `Popover`, `ActionsMenu`, `ConfirmDialog`, `EmptyState`, `FilterSelect`, `AppleDatePicker`, `.ap-segmented`, `Skeleton`, `UserAvatar`/`Avatar`, `LiveAnnouncer`, `useUsersForSelection`, `todoStatusMeta` | `components/todos/RecurringSubtasksSection.tsx` (+ row, form, history popover) — kept out of the 3 000-line `TodoCardModal.tsx`; `components/` rather than a feature because the modal is shared by the sprint and to-dos features |
| Date maths | `date-fns@2.30` (`addDays`, `subDays`, `differenceInCalendarDays`) | — |
| Calendar ghosts | calendar spec's ghost event kind and cap | RSC adapter lines in `lib/todos/calendar-events.ts` |

**No new dependency.**

---

## 6. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 — Fix card-level recurrence** (small, independent, ship first) | REC-FIX-1, 1r, 2, 2r, 3 | REC-FIX-AC-1..4; `npm run test:todos` green; repair run in dry-run against prod data and reviewed before `--apply` |
| **P1 — Recurring sub-tasks core** | RST-1..16, RST-18, RSG-1..10, RSA-1..9, RSU-1..6, RSU-8..11, RSU-13..14, RSPM-1..8, RSO-1..4 | RST-AC, RSG-AC, RSA-AC, RSU-AC-1..5, RSPM-AC; verified against the dev DB (as DTE-5 was): create 3 sub-tasks, run the cron twice, check one card per date, cursor advanced, re-run no-op |
| **P2 — Polish and calendar** | RSC-1..5 (after calendar P1), RST-17 duplicate, RSU-7 reorder, RSU-12 "Make recurring…", "Skip next", Q5 "also update open tasks" | RSC-AC-1..3 |

---

## 7. Tests to write when built

**Unit (`lib/todos/*.test.ts`, `npm run test:todos`)**
- `recurrence.test.ts`: R-01..R-12 unchanged; new — `monthDay` 31 across Feb/Apr (no drift), 30 in
  Feb, YEARLY Feb 29 with `monthDay`; `normaliseAnchor` WEEKDAYS on Sat/Sun; `firstOnOrAfter` for
  each rule; BIWEEKLY parity from the anchor; `subtaskOccurrencesUpTo` — horizon, `endsAt`
  inclusive, cap 5, stale grace 7 (skip list), cursor = day after last; `previousOccurrence` inverse
  of `nextOccurrence` for each rule.
- `recurring-subtasks.schema.test.ts`: every RST-6 rule, including `monthDay` rejected for WEEKLY.
- `recurring-subtask-generator.test.ts` (pure parts extracted: inheritance mapper RST-7, target
  sprint resolver RST-10, state derivation RST-9/RSA-1 `state`).
- `recurrence-generator` span/offset maths (REC-FIX-1/2) as pure helpers with table tests
  covering the §1.2 example and REC-FIX-AC-3.

**Integration (dev Postgres, as DTE-5 was verified)**
- RSG-AC-1..5; the unique-index backstop under two concurrent calls.
- RST-AC-4/5/6/7 end to end through the API and the generator.
- RSA-AC-1/2 (ownership check; constant query count).
- RSPM-AC-1..3 (403 for non-editors, 409 on a closed sprint, notification counts, activity rows).
- Regression: `lib/sprints/end-sprint.test.ts`, `lib/todos/due-reminders.test.ts` and every existing
  suite pass unchanged; `tsc --noEmit` and `npm run build` clean.

**Manual**
- The "Finance operations" example: weekly Mon, monthly 25th 09:00, daily; run the cron; open the
  board, the to-dos page as each assignee, and the history popover; complete the parent and confirm
  generation stops and does not back-fill on reopen; close the sprint with the parent carried over
  and confirm the next task lands in the new sprint.
- Keyboard-only and 375 px passes for RSU; dark mode and graphite board background.

**Docs to update after implementation** (CLAUDE.md): `docs/CHANGELOG_AI.md`,
`docs/FEATURE_STATUS.md`, `docs/COMPONENT_CATALOG.md` (new section component), `docs/CRON.md`,
`docs/MASTER_REFERENCE.md`, the DTE-5 line in `trello_parity_sprint_board_REQUIREMENTS.md`'s status
note, and calendar CDT-9/A9/CDT-10a.

---

## 8. Assumptions and open questions

> **Decided 2026-09-25** (the user delegated Q1–Q11: "you decide"). These answers are binding; the table
> below keeps the original questions for the record.
>
> | Q | Decision |
> |---|---|
> | Q1 | **Yes** — a completed, cancelled or archived parent suspends generation; reopening resumes from the next future date, no back-fill. |
> | Q2 | **Yes** — generate into the parent's current sprint; a parent stranded in a closed sprint routes to the recorded successor sprint, else the backlog. |
> | Q3 | **One `TODO_ASSIGNED` when the sub-task is assigned, no per-card assignment notification.** Each card is covered by `TODO_DUE_TOMORROW` and its reminder; a notification per daily card would train people to ignore them. |
> | Q4 | **Yes** as written (labels, KR/objective link, members when unassigned; never `progressValue`, cover, watchers or checklists). |
> | Q5 | **Future only in P1.** "Also update open tasks" is a P2 option. |
> | Q6 | **Anyone can be assigned.** Sprint boards are now invite-only, and assignment auto-invites the assignee to the target sprint (sprint-access decision 2026-09-25), so the assignee can always see the generated card. |
> | Q7 | **Out of scope, as proposed.** Several weekdays = several sub-tasks. |
> | Q8 | **Must be verified on the VPS before P1 ships** (`timedatectl` / `date`); if it is not UTC or Africa/Addis_Ababa, set `TZ=Africa/Addis_Ababa` for the pm2 process and the cron. This is a prod check, done at deploy with the user's approval. |
> | Q9 | **Report only; do not rewrite existing occurrences.** They are history — completed cards with real dates people worked to. Heads are repaired (REC-FIX-1r/2r). |
> | Q10 | **Yes** — 7-day stale grace, 20 recurring sub-tasks per card. |
> | Q11 | **Add "Create next now"** to the row's overflow menu (P1): it generates the next occurrence immediately, through the same idempotent generator path (the unique index prevents doubles), and advances the cursor. Users setting up a rule expect to see its first card, not wait for 01:00. |


| # | Assumption / question |
|---|---|
| Q1 | **Parent done/archived suspends generation, without back-fill on reopen** (D4, RST-9). Alternative: keep generating regardless of the parent's status. |
| Q2 | **Target sprint** = the parent's current sprint; a parent left in a closed sprint (only via manual status changes) routes to that sprint's recorded successor, else the backlog (RST-10). Alternative: stop generating until the parent is moved. |
| Q3 | **Notifications**: one `TODO_ASSIGNED` when a sub-task is assigned; no per-card assignment notification; the daily-cadence `TODO_DUE_TOMORROW` and the optional reminder cover each card (D6). Should each generated card also send `SPRINT_TASK_ASSIGNED` (IMMEDIATE) for sprint cards? |
| Q4 | **Inheritance**: generated cards take the parent's labels, KR/objective link and (when unassigned) members, but not its `progressValue`, cover, watchers or checklists (RST-7). |
| Q5 | Editing a sub-task changes future tasks only. Is an "Also update the n open tasks" checkbox wanted (P2)? |
| Q6 | Anyone may be chosen as assignee (matches card assignment today). Should it be limited to the parent's members or the sprint's people? |
| Q7 | Custom intervals (every N days, "2nd Tuesday", several weekdays in one rule) are out of scope; several weekdays = several sub-tasks. A per-rule lead time ("create 3 days before") is out of scope; the 1-day horizon is shared with DTE-5. |
| Q8 | **Server time zone.** `nextOccurrence` works in the server's local time and the cron fires at 01:00 UTC. The VPS time zone was not verified; if it is not UTC or Africa/Addis_Ababa, day boundaries may shift. Confirm before P1 (the same caveat already applies to DTE-5). |
| Q9 | REC-FIX-1r/2r repair only the **heads**; occurrences already created with inflated spans (§1.2) are reported, not rewritten. Rewrite them too? |
| Q10 | Stale grace of 7 days and 20 sub-tasks per card are reasonable limits. |
| Q11 | A "Create next now" manual trigger is not included; generation is cron-only. |

**Observed, not in scope (flagged for their owners)**

- `runTodoRecurrence` scans `take: 500` with no ordering or paging; beyond 500 heads some series
  silently never generate. RSG-4 avoids this for sub-tasks; the card-level generator should adopt the
  same paging.
- `runTodoRecurrence` copies `progressValue` into every occurrence, so each completed occurrence
  adds the value to its KR again via `recalcKrFromInitiatives`. That may be intended ("sell 10 per
  week") or a double count; confirm with the OKR owners.
- The card-level MONTHLY rule drifts after a short month (31 Jan → 28 Feb → **28 Mar**) because the
  cursor's day is used as the anchor. RSG-1's `monthDay` fixes this for sub-tasks; fixing it for
  heads needs a stored anchor day (one nullable column) — worth a follow-up.
- The card-level generator writes no `ActivityLog` row for an occurrence (RSPM-6 does for sub-tasks).
- Checklist routes lack write-access, closed-sprint and URL-ownership checks, and item routes do not
  accept `startDate` (§1.3).
