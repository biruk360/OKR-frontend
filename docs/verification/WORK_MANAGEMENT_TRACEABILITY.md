# Work Management (Sprints · To-dos · Cards) — Requirements Traceability

**Verified:** 2026-09-27 (agent T5, read-only code review — no code changed)
**Code surface:** `features/sprints/**`, `features/sprints-ai/**`, `features/todos/**`, `components/todos/**`, `components/todos-page/**`, `components/sprints/**`, `app/api/sprints/**`, `app/api/todos/**`, `app/api/todo-labels/**`, `app/api/comment-attachments/**`, `app/api/watchers`, `app/api/link-preview`, `lib/todos/**`, `lib/sprints/**`, `lib/attachments/**`, `lib/link-preview/**`, `lib/notifications/**`, `lib/ai/**`, `lib/permissions.ts`, `components/shared/{UserAvatar,CommentAttachments,AttachmentLightbox,LinkPreview,CopyLinkButton}.tsx`, `prisma/schema.prisma`, `scripts/preflight.sql`
**Test baseline (run 2026-09-27):** `test:sprints` 71/71 · `test:todos` 179/179 · `test:cards` 16/16 · `test:notifications` 34/34 · `test:attachments` 68/68 · `test:link-preview` 95/95 · `test:security` 91/91 · `test:core` 109/109 — all green.

Status lines in the spec headers were not taken on trust. Every status below comes from reading the current code (file:line as of 2026-09-27).

**Status key:** DONE = requirement met in code (small notes may still be listed) · PARTIAL = at least one clause/AC unmet · DEVIATES = built to a different design (says whether documented) · MISSING = not built · OUT OF SCOPE = deferred by the spec itself, blocked on a named open decision, or approved for after this release · N/A = desktop-only (TODO audit).

Sources and scope rules applied:

| # | Spec | Scope rule |
|---|---|---|
| S1 | `docs/trello_parity_sprint_board_REQUIREMENTS.md` | All IDs |
| S2 | `docs/card_comments_links_board_filter_REQUIREMENTS.md` | All IDs |
| S3 | `docs/comment_attachments_REQUIREMENTS.md` | All IDs |
| S4 | `docs/attachment_viewer_REQUIREMENTS.md` | All IDs |
| S5 | `docs/user_name_hover_REQUIREMENTS.md` | All IDs (inventory spot-checked) |
| S6 | `docs/notification_email_batching_REQUIREMENTS.md` | All IDs |
| S7 | `docs/calendar_view_REQUIREMENTS.md` | **P0 only** (§6 phasing row "P0 — Prerequisites"); P1+ = OUT OF SCOPE (approved for after release) |
| S8 | `docs/recurring_subtasks_REQUIREMENTS.md` | REC-FIX (P0) verified; sub-task feature decided in §8 but not built → OUT OF SCOPE |
| S9 | `docs/AI_SPRINT_PLANNING.md` | §0 design change supersedes later sections |
| S10 | `../docs/CLOSED_SPRINT_MANAGEMENT_REQUIREMENTS.md` | All IDs + edge cases + test plan |
| S11 | `../docs/TODO_SPRINT_AUDIT_AND_REQUIREMENTS.md` | Web-applicable parts only (desktop-only = N/A) |
| S12 | `docs/REMEDIATION_PLAN_2026-09-25.md` "Decisions" | Invite-only sprints + EMPLOYEE to-do scope |

---

## 1. Summary

| Spec | DONE | PARTIAL | DEVIATES | MISSING | OUT OF SCOPE | N/A | Total |
|---|---|---|---|---|---|---|---|
| S1 Trello parity board | 88 | 27 | 5 | 4 | 5 | 0 | 129 |
| S2 Comments · link previews · assignee filter | 26 | 0 | 0 | 0 | 0 | 0 | 26 |
| S3 Comment attachments | 26 | 4 | 0 | 0 | 0 | 0 | 30 |
| S4 Attachment viewer | 15 | 0 | 0 | 0 | 1 | 0 | 16 |
| S5 Name on hover | 9 | 0 | 0 | 0 | 0 | 0 | 9 |
| S6 Notification batching | 21 | 3 | 0 | 0 | 0 | 0 | 24 |
| S7 Calendar (P0 in scope) | 4 | 1 | 0 | 2 | 104 | 0 | 111 |
| S8 Recurring sub-tasks + REC-FIX | 5 | 0 | 0 | 0 | 68 | 0 | 73 |
| S9 AI sprint planning | 40 | 29 | 3 | 15 | 0 | 0 | 87 |
| S10 Closed sprint management | 27 | 9 | 1 | 0 | 0 | 0 | 37 |
| S11 TODO/sprint audit (web parts) | 5 | 11 | 0 | 6 | 2 | 10 | 34 |
| S12 Invite-only sprints + EMPLOYEE scope | 11 | 3 | 1 | 0 | 0 | 0 | 15 |
| **Total** | **277** | **87** | **10** | **27** | **180** | **10** | **591** |

In scope (excluding OUT OF SCOPE and N/A): **401 items — 277 DONE (69%), 87 PARTIAL, 10 DEVIATES, 27 MISSING.** Without the feature-flagged AI planner (S9) the in-scope DONE rate is 237 / 314 (75%).

Reading the numbers: the Trello-parity, comments, attachments, viewer, hover and notification specs are substantially delivered. The real risk sits in four places — (1) the AI plan **Discard** route destroys a whole team sprint, (2) card **status changes made by drag / list chip / lane remap skip every side effect** of the normal PATCH path (KR progress, completion, audit, notifications), (3) the **closed-sprint guard on `PATCH /api/todos/[id]` only looks at `status`/`sprintId`/`sprintPosition`**, and (4) **DEPARTMENT_LEAD bypasses invite-only sprints at card level**. Details and fixes are in §2.

---

## 2. Gaps to fix (prioritised)

Severity: Critical = data loss / security breach reachable today · High = wrong data or broken access rule on a primary path · Medium = spec clause unmet with user-visible or audit impact · Low = polish / completeness. Effort: S ≤ ½ day · M ≤ 2 days · L > 2 days.

| # | Sev | Effort | Gap | Evidence | Fix |
|---|---|---|---|---|---|
| G1 | **Critical** | S | **AI plan Discard deletes the whole team sprint.** Under §0 (per-user generation into an existing team sprint) the route still (a) detaches **every** non-AI card on the sprint (`sprintId → null`), (b) deletes **every** subject's AI drafts, and (c) `sprint.delete` — cascading lanes, participants and sibling plans. The plan's subject (an EMPLOYEE) can trigger it from the review page. Flag-gated (`aiSprintPlanningEnabled`, default off). | `app/api/sprints/ai/[planId]/discard/route.ts:36-47`; UI `features/sprints-ai/components/ReviewPlanClient.tsx:119-126,200-205`; contrast the scoped `regenerate/route.ts:54-63` | Scope to this plan: delete only `aiSuggested && assigneeId === plan.subjectUserId` todos, clear this subject's carryover stamps, mark DISCARDED, never delete the sprint or touch other cards. Add ActivityLog. |
| G2 | **High** | M | **Status changes outside `PATCH {status}` skip all side effects.** Drag-and-drop (`board/reorder`), the card's list chip (`PATCH {columnId}`), lane status remap, move-all and archive re-home all write `status` directly: no `recalcKrFromInitiatives`/objective roll-up, no `completedAt`, no `TODO_COMPLETED`, no status ActivityLog, no realtime broadcast. Dragging a KR-linked card to Done — the main way cards get completed — leaves the KR's `currentValue` stale. | `app/api/sprints/[id]/board/reorder/route.ts:90-97`; `app/api/todos/[id]/route.ts:356-364` (recalc keyed on body `status`, not the lane-derived `laneUpdate.status` from :159); `app/api/sprints/[id]/columns/[colId]/route.ts:74-77,204-214`; `columns/[colId]/move-all/route.ts:60-70`; client `features/sprints/components/SprintBoardClient.tsx:292-310`, `components/todos/TodoCardModal.tsx:488-492` | One shared `applyCardStatusChange(tx, todoIds, status, actor)` service (recalc KR + objective ancestors, stamp/clear `completedAt`, activity rows, post-commit `emit` + `broadcastSprintEvent`) called by all five paths. Add a unit test for the lane-derived path. |
| G3 | **High** | S | **Closed-sprint bypass on card PATCH.** The BR-06 check fires only when `status`, `sprintPosition` or `sprintId` is in the body. `PATCH {columnId}` on a COMPLETED/CANCELLED sprint's card moves it and rewrites its status; title/description/dates/labels/members/cover are also writable. Sub-resources (comments, checklists, attachments) correctly 409. | `app/api/todos/[id]/route.ts:241-268` vs `lib/todos/access.ts:536-560` (`todoWriteGuard`) | Treat any mutation other than clearing `sprintId` as locked on a closed sprint (reuse `isClosedSprintState`), and include `laneUpdate` in the check. Extend `lib/security/card-access-invariants.test.ts`. |
| G4 | **High** | S–M | **DEPARTMENT_LEAD bypasses invite-only boards at card level.** `TODO_WRITE_ROLES` includes DEPARTMENT_LEAD, so `canWriteTodo` is true for every card, and `canReadTodo` grants read through `canWrite` (`access.ts:506-507`). A lead can open (`?open=`/`?card=`, `GET /api/todos/[id]`) and edit any card on a sprint they were not invited to — contradicting decision 3. The pure test passes only because it fixes `canWrite: false`. | `lib/todos/access.ts:58,87-99,506-507`; test `lib/todos/access.test.ts:162-165,251-258` | Drop DEPARTMENT_LEAD from the unconditional list (keep lead rights via KR management / own-department non-sprint cards), or AND it with `canViewSprint` for sprint cards. Add a DB-backed `canReadTodo` test for an uninvited lead. |
| G5 | **High** | M | **AI carryover dispositions are never applied.** Candidates are the *prior* sprint's todos, but `/accept` only scans the *target* sprint's todos, so KEEP/DESCOPE/RESCHEDULE/ESCALATE never execute; SPLIT is explicitly deferred; no ESCALATE manager notification exists. | candidates `lib/ai/context-bundler.ts:416-464` (`sprintId: priorSprintId`); accept filter `app/api/sprints/ai/[planId]/accept/route.ts:62-64`; SPLIT stub `:118-124` | Load carryover todos by `carryoverDisposition` + subject from the prior sprint; apply moves into the target sprint's first matching lane; add SPLIT and the manager `emit`. |
| G6 | Medium | S | **AI default provider resolves to a stub → 503.** `OrganizationSettings.aiPreferredProvider` defaults to `"anthropic"` in the schema, `getAiOrgConfig` accepts it (it is a valid id), but only OpenAI is wired — the modal's "default" provider path fails unless an admin saved `openai`. | `prisma/schema.prisma:212`; `lib/ai/config.ts:13,93-96`; `lib/ai/providers/wired.ts:8` | Map unwired providers to `DEFAULT_PROVIDER` in `getAiOrgConfig`; change the schema default to `"openai"` (+ preflight update of existing rows). |
| G7 | Medium | S | **`POST /api/todos/reorder` is unscoped.** Its docstring says rows are scoped to creator/assignee, but it runs `updateMany({ where: { id } })` — any signed-in user can rewrite any card's `sortOrder`; no closed-sprint check, no audit. | `app/api/todos/reorder/route.ts:13-43` | Filter by `readableTodoWhere`/`canWriteTodo`, skip closed-sprint cards, audit. |
| G8 | Medium | S–M | **ActivityLog gaps (SEC-9 / project invariant).** No audit row for: board reorder (incl. status), global to-do reorder, watch/unwatch, comment edit/delete, checklist rename/delete, checklist item create, card-attachment delete, AI discard. `TODO_WATCH_ADDED/REMOVED` actions were never added. | `board/reorder/route.ts`; `todos/reorder/route.ts`; `watchers/route.ts:26-51`; `todos/[id]/comments/[commentId]/route.ts:33-73`; `todos/[id]/checklists/[checklistId]/route.ts:22-50`; `.../items/route.ts:13`; `todos/[id]/attachments/[attachmentId]/route.ts:72`; `lib/activity-log.ts:83-89` | Add `recordActivity` calls (G2's service covers reorder). |
| G9 | Medium | S | **Quick-add in a non-To-Do lane creates a status/lane mismatch.** The composer and the list menu's "Add card" send that lane's `columnId`, but `POST /api/todos` hard-codes `status: 'PENDING'` — a card added to "Done" sits in Done as PENDING (the BR-07 mismatch the End Sprint preflight then reports). | `app/api/todos/route.ts:280-303`; `features/sprints/components/SprintAddTaskInline.tsx:59-72`; `SprintBoardClient.tsx:671-676` | Derive `status` from the chosen lane's `statusKey` (and stamp `completedAt` / recalc when COMPLETED). |
| G10 | Medium | S | **LST-8 hole:** a lane remap can move the sprint's last COMPLETED lane to another status (only archive is guarded). | `app/api/sprints/[id]/columns/[colId]/route.ts:59-64` vs `:169-174`; UI `SprintListManager.tsx:176-213` | Reject a `statusKey` change that leaves no active COMPLETED lane; disable in the remap dialog. |
| G11 | Medium | S | **Invite-only leaks on OKR surfaces.** `GET /api/keyresults/[id]/todos` returns every card on the KR — including cards on sprints the viewer is not invited to — to anyone who can view the KR; `/api/initiative-report` returns all open cards unscoped to leads/executives. | `app/api/keyresults/[id]/todos/route.ts:42-49`; `app/api/initiative-report/route.ts:19-33` | Filter sprint cards through `sprintVisibilityWhere` (or `canReadTodo` facts) on both. |
| G12 | Medium | S+S+M | **Calendar P0 prerequisites incomplete:** CVP-7 `@@index([dueDate])`/`@@index([startDate])` on `Todo` absent; `CalendarGrid` not exported and has no `weekStartsOn`; CPM-11(a) DB-seeded role-matrix test absent (pure matrices only). | `prisma/schema.prisma:599-613`; `components/ui/date-picker.tsx:198`; `lib/todos/access.test.ts`, `lib/sprints/access.test.ts` | Add the two indexes (+ `CREATE INDEX CONCURRENTLY IF NOT EXISTS` in preflight), export `CalendarGrid({ weekStartsOn })`, add a seeded integration matrix before calendar P1 starts. |
| G13 | Medium | S | **Lost-update risk remains** — API-8/9 single add/remove routes exist but the card modal still PATCHes the full `memberIds`/`labelIds` arrays. | `components/todos/TodoCardModal.tsx:641-645,670-674`; routes `app/api/todos/[id]/{members,labels}/route.ts` | Switch the toggles to POST/DELETE on the new routes. |
| G14 | Medium | S | **End Sprint modal (FR-01/UX-02):** the BR-07 `columnMismatch` preflight is returned but never shown; the success toast has no "View report" action and the board ignores the `reportUrl` callback. | `app/api/sprints/[id]/end/route.ts:61,87`; `components/sprints/EndSprintModal.tsx:176-185`; `SprintBoardClient.tsx:737` | Render the mismatch banner with per-row "Mark completed"; add the toast action. |
| G15 | Medium | S | **FR-07 / SEC-2 UI:** Start/Complete/Schedule sprint, background picker, "Add another list" and list menus render for every viewer (e.g. EMPLOYEE participants); the server refuses, but the UI offers actions that always fail. | `features/sprints/components/SprintBoardHeader.tsx:115-173`; `SprintBoardLane.tsx:91-99`; `SprintBoardClient.tsx:684-686` | Return `canEdit` in the board payload and gate those controls. |
| G16 | Low | S | **Email batching polish:** EML-2 groups by category, not entity (5 comments on one card = 5 rows); `NOTIFICATION_BATCH_MINUTES` is documented but never read (window = crontab interval, BAT-AC-5). | `lib/email/templates/digest.ts:119-124`; `env.example:122`; `scripts/install-crontab.sh:130` | Group by `entityType:entityId` inside category; either read the env in the drain window or drop it from docs. |
| G17 | Low | M | **Board/card polish:** LST-4 lane drag-reorder UI; FLB-2 card-context floating bar; RSP-4 mobile bottom-sheet popovers; STA-8 single offline toast; CDM-6 delete confirm; CDM-8 "Convert to card"; DTE-6 server-side due ≥ start; REG-5 clone lane mapping + `coverSize`; SHR-8 five ad-hoc clipboard sites; LST-5 archive dialog uses the *filtered* card count. | see §3 rows | — |
| G18 | Low | L | **AI planning completeness:** OkrPicker + `alignment-search?includeKeyResults`, generation progress modal, allocation chart, carryover-override UI, per-user 30-min cooldown and 3/30-min regenerate budget, admin detail/cost/plan-inspector pages, flag-gated button, MANUAL server-side post-filter. | see §3 S9 | — |
| G19 | Low | M | **Test gaps:** no integration tests for closed-sprint T-10…T-20, SEC-AC-1/2, CDM-AC-3/6, BAT-AC-1…3 (drain grouping, empty window, concurrent claim), AI math/carryover rules; no axe run (A11Y-AC-2). | `lib/sprints/end-sprint.test.ts` covers T-01…T-08 only | Add a seeded Postgres integration suite. |
| G20 | Ops | S | **Pending prod runs** (code done, data not): `scripts/notifications-set-batched-defaults.ts --apply` (BAT-2); `scripts/migrate-todo-comment-attachments.ts --apply` (ATT-4); deploy code **before** `scripts/update-employee-todo-scope.ts --apply`; review `scripts/todo-visibility-diff.ts` output (CPM-11c); `scripts/repair-recurrence-heads.ts` dry-run → apply (REC-FIX-1r/2r); `scripts/backfill-recurrence-anchor.ts`; `scripts/backfill-sprint-participants.ts` / `verify-sprint-access.ts`; `prisma/backfill-sprint-summaries.ts`. | `docs/REMEDIATION_PLAN_2026-09-25.md` "Blocked" | Run in the documented order with user approval. |

---

## 3. Per-spec traceability

### S1 — Trello-parity sprint board (`docs/trello_parity_sprint_board_REQUIREMENTS.md`)

Paths below are relative to repo root; `todos/[id]/route.ts` = `app/api/todos/[id]/route.ts`, `columns/[colId]` = `app/api/sprints/[id]/columns/[colId]/route.ts`.

#### Data model and API (§5–§6)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| DM-1 | `Todo.columnId` + index + backfill | DONE | `prisma/schema.prisma:557,591,605`; `scripts/preflight.sql:643-677` | `lib/sprints/columns.test.ts` T-05…T-08 | CANCELLED cards deliberately left null (documented `preflight.sql:660-663`), so DM-AC-1's `count(*)=0` is not literally true. |
| DM-2 | Drop `@@unique([sprintId,statusKey])` | DONE | `preflight.sql:611-620`; `schema.prisma:1226-1235` | `columns.test.ts` T-09 | `statusKey` stays nullable (documented implementation note; API requires it). |
| DM-3 | `SprintColumn.archivedAt`; delete = archive | DONE | `schema.prisma:1240`; `columns/[colId]:144-227` | none | — |
| DM-4 | `TodoLabelDef.pattern` with derived default | DONE | `schema.prisma:660`; `lib/card-visuals.ts:39-82` | `lib/card-visuals.test.ts` T-03, T-04 | — |
| DM-5 | `Todo.coverSize` | DONE | `schema.prisma:505`; `preflight.sql:691` | none | — |
| DM-6 | New ActivityAction members | PARTIAL | `lib/activity-log.ts:83-89` | none | `TODO_WATCH_ADDED/REMOVED` absent; watchers route writes no audit (G8). |
| API-1 | Board lanes from `SprintColumn`, bucket by `columnId` | DONE | `app/api/sprints/[id]/board/route.ts:63,104-136`; AI filter `:71` | `columns.test.ts` T-05…T-09 | — |
| API-2 | `GET /columns` + `canViewSprint` | DONE | `app/api/sprints/[id]/columns/route.ts:23-41` | `card-access-invariants.test.ts` CPM-9 | — |
| API-3 | `POST /columns` requires statusKey + `canEditSprint` | DONE | `columns/route.ts:54-67`; `lib/sprints/guards.ts:37-60` | `api-invariants.test.ts` SEC-1 | No behavioural 403 test (API-AC-3). |
| API-4 | `PATCH /columns/[colId]` + transactional renumber | DONE | `columns/[colId]:33-38,68-101` | none | Archive is via DELETE, not `archivedAt` on PATCH (fine). |
| API-5 | `DELETE` soft-archive + re-home + ≥1 lane | DONE | `columns/[colId]:161-219` | none | — |
| API-6 | Reorder keyed by `columnId`, status in same tx | PARTIAL | `board/reorder/route.ts:66-97` | `sprint-access-invariants.test.ts` "board reorder…" | Status written without KR recalc/`completedAt`/audit/notify/broadcast (G2). |
| API-7 | `PATCH /todos/[id]` accepts `columnId`/`coverSize`, derives status | PARTIAL | `todos/[id]/route.ts:139-176,323-327` | `card-access-invariants.test.ts` CPM-3 | Lane-derived status skips side effects; `TODO_MOVED_COLUMN` never written by PATCH; closed-sprint bypass (G2, G3). |
| API-8 | Single member add/remove | PARTIAL | `app/api/todos/[id]/members/route.ts:24-73` | `sprint-access-invariants.test.ts` "being put on a sprint card invites" | Shape is `/members` + `DELETE ?userId=`; UI still uses full-array PATCH (G13). |
| API-9 | Single label add/remove | PARTIAL | `app/api/todos/[id]/labels/route.ts:18-60` | none | UI still uses full-array PATCH (G13). |
| API-10 | Watchers wired, `watchers[]` in board payload | DONE | `board/route.ts:89-134`; `app/api/watchers/route.ts` | none | — |
| API-11 | Loosen label PATCH to sprint editors | OUT OF SCOPE | `app/api/todo-labels/[id]/route.ts:8-14` | — | Blocked on assumption A3 (decision pending). |
| API-12 | Backlog tab calls `?noSprint=1` | DONE | `features/sprints/components/SprintsListClient.tsx:220-223` | none | — |

#### Board shell, lists, card front (§7.1–§7.3)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| BRD-1 | Header gains Share + overflow menu | DONE | `features/sprints/components/SprintBoardHeader.tsx:196-227` | none | — |
| BRD-2 | One Filter popover: assignee, label, due, OKR, watching + badge | DEVIATES | `SprintBoardHeader.tsx:293-420`; `lib/sprints/board-filters.ts:173-250` | `lib/sprints/board-filters.test.ts` (labels, due, watching, linked, AND) | Inline facet row + count badge instead of one popover (documented in spec header + component header). |
| BRD-3 | Filters persist per sprint; Clear all | DONE | `SprintBoardClient.tsx:105-126`; `board-filters.ts:278-300` | `board-filters.test.ts` "persistence" ×4 | localStorage only, no URL. |
| BRD-4 | Background picker, floating bar unchanged | DONE | `SprintBoardHeader.tsx:166-173`; `SprintFloatingBar.tsx` | none | — |
| BRD-5 | Star/lock/power-ups/automations not rendered | OUT OF SCOPE | not rendered | — | Permanently out per A8. |
| LST-1 | Lanes from `SprintColumn`, name + count + menu | DONE | `SprintBoardLane.tsx:72-99` | `columns.test.ts` | — |
| LST-2 | "+ Add another list" with required status | DONE | `SprintListManager.tsx:318-345` | none | 409 shown as a toast, not inline (LST-AC-2). |
| LST-3 | List menu: rename, remap, add card, move all, sort, archive | DONE | `SprintListManager.tsx:112-138`; `columns/[colId]/move-all/route.ts` | none | "Add card" in non-PENDING lanes creates PENDING cards (G9). |
| LST-4 | Reorder lists by dragging headers | MISSING | API supports `position` (`columns/[colId]:81-94`); no UI sends it | none | G17. |
| LST-5 | Lane count = filtered count | DONE | `SprintBoardClient.tsx:320-326` | none | The archive/remap dialogs reuse the filtered count (`SprintBoardLane.tsx:93`) — can misjudge a lane as empty (G17). |
| LST-6 | Remap status bulk-updates cards with confirm | PARTIAL | `columns/[colId]:72-79`; `SprintListManager.tsx:176-213` | none | One lane-level audit row, not per-card (LST-AC-3); side effects skipped (G2). |
| LST-7 | Archive with destination list | DONE | `columns/[colId]:176-219`; `SprintListManager.tsx:262-300` | none | — |
| LST-8 | ≥1 list and ≥1 COMPLETED list | PARTIAL | `columns/[colId]:166-174`; `SprintListManager.tsx:88-91` | none | Remap can remove the last COMPLETED lane (G10). |
| LST-9 | Backlog tab fixed; in-sprint "Backlog" list allowed | DONE | `SprintsListClient.tsx:220-223` | none | Assumption A1 unconfirmed. |
| LST-10 | Closed sprints: lists read-only | DONE | `SprintBoardClient.tsx:684-686`; `SprintBoardLane.tsx:95`; `guards.ts:48-50` | `card-access-invariants.test.ts` STA-7 | — |
| CRD-1 | Label strip, pattern, click to expand names | DONE | `features/sprints/components/TaskCardTrello.tsx:210-240` | `card-visuals.test.ts` T-01…T-05 | — |
| CRD-2 | Cover band / full-bleed | DONE | `TaskCardTrello.tsx:130-170` | `card-visuals.test.ts` T-08, T-09 | — |
| CRD-3 | Attachment count + description glyph | DONE | `TaskCardTrello.tsx:327-360` | none | — |
| CRD-4 | Watcher eye from real data | DONE | `board/route.ts:89-134`; `TaskCardTrello.tsx:114,362-370` | none | — |
| CRD-5 | Checklist badge green only at 100% | DONE | `TaskCardTrello.tsx:136,301-312` | none | — |
| CRD-6 | Date-chip tone logic preserved | DONE | `lib/todos/due-tone.ts`; `TaskCardTrello.tsx:271-296` | `lib/todos/due-tone.test.ts` | — |
| CRD-7 | Priority, urgent stripe, OKR pill, carryover, members kept | DONE | `TaskCardTrello.tsx:172-266,315-325,375` | none | — |
| CRD-8 | ≤ +24px height with no labels | PARTIAL | `TaskCardTrello.tsx` | none | Not measured; no visual test. |

#### Card modal, cover, dates, add-to-card (§7.4–§7.7)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| CDM-1 | Modal on `components/ui/Modal` (focus trap) | DONE | `components/todos/TodoCardModal.tsx:1117-1140` | none | `size="940"` not `2xl`; drawer mode removed (documented `:90-97`). |
| CDM-2 | List-selector chip moves the card | PARTIAL | `components/todos/CardHeader.tsx:123-140`; `TodoCardModal.tsx:488-492` | none | Sends `columnId` only → G2 side-effect gap. |
| CDM-3 | Cover · Watch · overflow · Close | DONE | `components/todos/CardRail.tsx:37-95,233-320` | none | Overflow = Copy link/Duplicate/Delete; Move is the chip. |
| CDM-4 | Circular mark-complete toggle | DONE | `CardHeader.tsx:66-75` | none | Reopen goes to PENDING, not "previous status". |
| CDM-5 | Comments/activity rail + persisted Hide details | DONE | `TodoCardModal.tsx:279-293`; `components/todos/CardComments.tsx:82-85,372` | none | — |
| CDM-6 | Comment Edit / Delete / Reply | PARTIAL | `CardComments.tsx:203-224`; `TodoCardModal.tsx:373-413` | `card-access-invariants.test.ts` "comment POST gates…" | Delete has no `ConfirmDialog`; edit/delete not audited (G8). |
| CDM-7 | Only author/ADMIN/EXECUTIVE edit/delete (server) | DONE | `app/api/todos/[id]/comments/[commentId]/route.ts:19-20,43,63` | none (CDM-AC-3 untested) | — |
| CDM-8 | Wire checklist item due/assign/overflow | PARTIAL | `components/todos/CardChecklists.tsx:143-222` | none | "Convert to card" missing. |
| CDM-9 | Label rename/recolour | OUT OF SCOPE | `app/api/todo-labels/[id]/route.ts:8-14` | — | Blocked on A3. |
| CDM-10 | Description Save/Cancel + Formatting help | DONE | `components/todos/CardDescription.tsx:50-60` | none | — |
| CDM-11 | Closed sprint: modal read-only | PARTIAL | `CardRail.tsx:129`; `CardHeader.tsx:72,123`; `lib/todos/access.ts:536-560` | `card-access-invariants.test.ts` STA-7 | Direct `PATCH /todos/[id]` still edits non-status fields (CDM-AC-6 fails) — G3. |
| CDM-12 | OKR card, attachments grid, pills, members kept | DONE | `components/todos/CardLinkedOkr.tsx`; `CardAttachments.tsx` | `lib/attachments/viewer-invariants.test.ts` | — |
| CVR-1 | Cover popover: size, 10 colours, colour-blind, remove | DONE | `CardRail.tsx:233-320` | none | — |
| CVR-2 | Swatches on named tokens | DONE | `lib/card-visuals.ts:44-53` (`--ap-card-*`) | `test:cards` (design-tokens) | Hex persisted as the `coverColor` value (data, not style). |
| CVR-3 | Colour-blind mode per user, board-wide | DONE | `lib/stores/user-prefs-store.ts:7,41,52`; `app/api/user-preferences/route.ts`; `preflight.sql:697` | `lib/stores/stores.test.ts` | — |
| CVR-4 | FULL cover ink ≥4.5:1 | DONE | `card-visuals.ts:159-190`; `TaskCardTrello.tsx:133-134` | `card-visuals.test.ts` T-08 | — |
| CVR-5 | No image upload / Unsplash | OUT OF SCOPE | — | — | D2. |
| DTE-1 | Dates popover on `AppleDateRangePicker` | DEVIATES | `components/todos/CardDatesPanel.tsx:131` | none | Extended the hand-rolled calendar (documented, CHANGELOG 2026-09-16). |
| DTE-2 | Independent start/due checkboxes | DONE | `CardDatesPanel.tsx:56-95,271-296` | none | — |
| DTE-3 | Times → `startTime`/`endTime` | DONE | `CardDatesPanel.tsx:144-145,211-212` | none | — |
| DTE-4 | Due reminder via `emit`, cron, idempotent | DONE | `CardDatesPanel.tsx:12,146,214`; `app/api/cron/todo-reminders/route.ts:14-67`; `lib/notifications/events.ts:199`; `scripts/install-crontab.sh:94` | `lib/todos/due-reminders.test.ts` | — |
| DTE-5 | Recurring (spec: deferred) | DONE | `lib/todos/recurrence.ts`, `recurrence-generator.ts`; `CardDatesPanel.tsx:298-330`; `install-crontab.sh:102` | `recurrence.test.ts`, `recurrence-dst.test.ts` | Shipped 2026-09-18. |
| DTE-6 | Due ≥ start blocks Save | PARTIAL | `CardDatesPanel.tsx:191-194,207,361` | none | UI-only; API accepts due < start. |
| DTE-7 | Outside-sprint-window warning | DONE | `CardDatesPanel.tsx:196-204,366` | none | — |
| DTE-8 | Remove clears dates, times, reminder | DONE | `TodoCardModal.tsx:832-839` | none | Also clears recurrence (sensible). |
| ATC-1 | "+ Add" menu with icon/title/subtitle, arrow keys | DEVIATES | `CardRail.tsx:135-230` | none | Persistent "Add to card" rail list, no subtitles, no roving focus (design refresh; not documented against ATC-1). |
| ATC-2 | One popover at a time (`activePanel`) | DONE | `CardRail.tsx:143-230` | none | — |
| ATC-3 | Custom Fields hidden | DONE | not rendered | — | — |
| ATC-4 | Checklist + Attachment as separate top-level buttons | DEVIATES | `CardRail.tsx:171-229` | none | Both live in the rail list. |

#### Share, floating bar, states, responsive, a11y, security, performance, regression (§7.8–§7.15)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| SHR-1 | Share copies `/dashboard/sprints/{id}?card={todoId}` | DONE | `TodoCardModal.tsx:425-440`; `CardRail.tsx:62-68,331-335`; `SprintBoardHeader.tsx:196-205` | none | — |
| SHR-2 | Only for authenticated sessions | DONE | `app/dashboard/layout.tsx:22`; `app/api/todos/[id]/share/route.ts:19` | none | — |
| SHR-3 | No token / public route | DONE | `share/route.ts:8-17` | `lib/security/api-invariants.test.ts` SHR-AC-5 ×2 | — |
| SHR-4 | `?card=` opens then strips | DONE | `SprintBoardClient.tsx:255-262` | none | — |
| SHR-5 | Neutral "That card isn't available." | DONE | `SprintBoardClient.tsx:258-259`; `share/route.ts:36-50` | none | — |
| SHR-6 | Sign-in returns to deep link | DONE | `app/dashboard/layout.tsx:22`; `middleware.ts:57` | none | — |
| SHR-7 | `TODO_SHARED` audit | DONE | `share/route.ts:52-58` | none | — |
| SHR-8 | `CopyLinkButton` + refactor ad-hoc sites | PARTIAL | `components/shared/CopyLinkButton.tsx` | none | 5 sites remain: `components/reports/ReportDashboardClient.tsx:286`, `features/filters/components/FiltersWorkspace.tsx:140`, `features/scrum/components/ScrumCalendarViews.tsx:348`, `features/projects/components/ai/AiAssistantPanel.tsx:33`, `features/key-results/components/KeyResultDetailClient.tsx:187` (A7 unconfirmed). |
| FLB-1 | Board tabs unchanged | DONE | `SprintFloatingBar.tsx` | none | — |
| FLB-2 | Card-context bar (Comments) while modal open | MISSING | `SprintFloatingBar.tsx` has no card mode | none | G17. |
| FLB-3 | Power-ups/Automations not rendered | DONE | not rendered | — | — |
| FLB-4 | Hidden below `md` | DONE | `SprintFloatingBar.tsx:49-52` | none | — |
| STA-1 | Skeleton lanes + modal skeleton | DONE | `SprintBoardClient.tsx:461-483`; `TodoCardModal.tsx:857-864` | none | — |
| STA-2 | Empty board EmptyState with working "Add a card" | DONE | `SprintBoardClient.tsx:596-612` | none | — |
| STA-3 | Empty lane with dashed drop target | DONE | `SprintBoardLane.tsx:128-139,190-205` | none | — |
| STA-4 | Distinct empty-filter state | DONE | `SprintBoardLane.tsx:113-127` | none | — |
| STA-5 | Success toast per mutation | PARTIAL | e.g. `SprintAddTaskInline.tsx:76`, `SprintListManager.tsx:95-101` | none | Drag, label and member toggles are silent. |
| STA-6 | Rollback + server message on failure | PARTIAL | `SprintBoardClient.tsx:301-309`; `TodoCardModal.tsx:646-652` | none | Drag "rollback" is a refetch, not a 180 ms return animation. |
| STA-7 | 409 → "This sprint is closed" + refetch | PARTIAL | `SprintBoardClient.tsx:301-309` | `card-access-invariants.test.ts` STA-7 (server) | Generic server message; no SPRINT_CLOSED-specific handling in modal. |
| STA-8 | Single persistent offline toast | MISSING | no `navigator.onLine`/offline handling | none | G17. |
| RSP-1 | ≥1024 px horizontal lanes | DONE | `SprintBoardClient.tsx:643-681` | none | Lanes 286 px (design refresh) vs 272 px. |
| RSP-2 | Mobile tab strip of all lanes | DONE | `SprintBoardClient.tsx:615-640` | none | — |
| RSP-3 | Mobile full-screen modal, rail below | PARTIAL | `TodoCardModal.tsx:1137`; `CardRail.tsx:128` | none | Rail stacks below; shell is not a full-screen sheet. |
| RSP-4 | Popovers as bottom sheets on mobile | MISSING | `components/ui/popover.tsx` has no sheet mode | none | G17. |
| RSP-5 | No horizontal page scroll at 375 px | PARTIAL | lane scroller `SprintBoardClient.tsx:643-645` | none | Not verified at 375 px. |
| RSP-6 | Touch uses the list chip | DONE | `CardHeader.tsx:123` (rendered at all widths) | none | A4 unconfirmed. |
| A11Y-1 | Modal focus trap, labelled by title | DONE | `TodoCardModal.tsx:1117-1127` | none | — |
| A11Y-2 | Keyboard card movement | DEVIATES | `features/sprints/components/useBoardKeyboardMove.ts:39-82`; `SprintBoardLane.tsx:141-150` | none | Parallel keyboard path, not dnd-kit (documented, CHANGELOG 2026-09-16). |
| A11Y-3 | `aria-live` announcer | DONE | `components/shared/LiveAnnouncer.tsx:4-68`; `SprintBoardClient.tsx:562` | none | — |
| A11Y-4 | Colour never the only signal | DONE | `TaskCardTrello.tsx:217,309,331` | `card-visuals.test.ts` | — |
| A11Y-5 | aria-labels on icon-only controls | DONE | `CardRail.tsx:44,89`; `SprintBoardHeader.tsx:324,341,358` | none | — |
| A11Y-6 | `prefers-reduced-motion` | DONE | `app/globals.css:971,1048` | none | — |
| A11Y-7 | Visible, consistent focus rings | DONE | `app/globals.css:127-131,815-821` | none | — |
| A11Y-8 | `list`/`listitem` roles with names | DONE | `SprintBoardLane.tsx:104-107,144` | none | — |
| A11Y-9 | ≥4.5:1 on every preset/cover, both themes | PARTIAL | `card-visuals.ts:159-190` | `card-visuals.test.ts` T-08 (covers only) | Board presets/graphite unmeasured; no axe run (G19). |
| SEC-1 | `withAuth` everywhere; column routes `canEditSprint` | DONE | `guards.ts:37-60` | `api-invariants.test.ts` SEC-1 ×4 | — |
| SEC-2 | Server-side permission on every mutation | PARTIAL | — | `card-access-invariants.test.ts` | `POST /api/todos/reorder` unscoped (G7). |
| SEC-3 | Comment moderation server-side | DONE | as CDM-7 | none | — |
| SEC-4 | Share creates no access path | DONE | as SHR-3 | `api-invariants.test.ts` | — |
| SEC-5 | Not-found ≡ forbidden for cards | DONE | `share/route.ts:36-50`; `access.ts:518-534` | `card-access-invariants.test.ts` "decision 3" | — |
| SEC-6 | DOMPurify before HTML render | DONE | `components/shared/RichTextContent.tsx:4-32`; `TodoCardModal.tsx:61-80` | none (SEC-AC-3) | — |
| SEC-7 | `columnId` must belong to the card's sprint | DONE | `todos/[id]/route.ts:151-158`; `app/api/todos/route.ts:283-287`; `board/reorder/route.ts:93` | none (SEC-AC-2) | — |
| SEC-8 | Closed-sprint guard on all list/card mutations | PARTIAL | `guards.ts:14-23`; `board/reorder/route.ts:46-48` | `card-access-invariants.test.ts` STA-7 | PATCH `columnId`/field bypass (G3). |
| SEC-9 | Every mutation audited | PARTIAL | — | none | See G8 list. |
| PRF-1 | Bounded queries on `GET /board` | DONE | `board/route.ts:43,63,65,92` (4 queries) | none | — |
| PRF-2 | <1.5 s p95 with 200 cards | PARTIAL | — | none | Not measured. |
| PRF-3 | Drag ≥50 fps | PARTIAL | rAF indicator kept in `SprintBoardClient.tsx` | none | Not measured. |
| PRF-4 | Virtualise lanes >50 cards | OUT OF SCOPE | — | — | Deferred with dnd-kit migration (spec header). |
| PRF-5 | One request per drop | DONE | `SprintBoardClient.tsx:548-561` | none | — |
| PRF-6 | Labels/members/watchers in payload | DONE | `board/route.ts:17-36,89-134` | none | — |
| REG-1 | `taskPercent` counts `status=COMPLETED` | DONE | `board/route.ts:139-141` | `columns.test.ts` T-09 (lanes only) | No aggregate test. |
| REG-2 | AI drafts hidden; accepted land in first PENDING lane | DONE | `board/route.ts:71`; `lib/ai/pipeline.ts:113,202` | none | — |
| REG-3 | Carryover gets a lane in the target sprint | DONE | `lib/sprints/close-sprint.ts:194-251` | `end-sprint.test.ts` T-02, T-04 | — |
| REG-4 | Backlog moves null `columnId` | PARTIAL | `todos/[id]/route.ts:148-150`; `close-sprint.ts:262,272` | none | AI accept RESCHEDULE/DESCOPE and AI discard null `sprintId` but keep `columnId` (`sprints/ai/[planId]/accept/route.ts:97-107`; `discard/route.ts:38-41`). |
| REG-5 | Clone maps `columnId`, copies cover | PARTIAL | `app/api/sprints/[id]/clone/route.ts:100-128` | none | All clones → first PENDING lane as PENDING; `coverSize` dropped. |
| REG-6 | Carryover badges, report, outcome chips unchanged | DONE | `TaskCardTrello.tsx:253-266`; `SprintsListClient.tsx:97-109` | none | — |
| REG-7 | Desktop `?updatedSince=` still works | DONE | `app/api/sprints/route.ts:29-30` | none | A6 unconfirmed. |
| REG-8 | Other modal consumers; no chip/share without sprint | DONE | `CardRail.tsx:62-68,331`; `CardHeader.tsx:123,150` | none | — |
| REG-9 | State machine, `USE_END_ENDPOINT`, read-only boards | DONE | `app/api/sprints/[id]/route.ts:49-53,100-126` | `end-sprint.test.ts` | — |

### S2 — Card comments, link previews, board assignee filter

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| CPF-1 | Optimistic insert, "Sending…" | DONE | `TodoCardModal.tsx:212-232`; `CardComments.tsx:195-201` | none | — |
| CPF-2 | Replace temp row with saved row | DONE | `TodoCardModal.tsx:250` | none | — |
| CPF-3 | Failure restores draft + files | DONE | `TodoCardModal.tsx:251-259` | none | — |
| CPF-4 | No actions on pending rows | DONE | `CardComments.tsx:203` | none | — |
| CPF-5 | Parallel uploads | DONE | `components/todos/CardCommentUploads.ts:46` | none | — |
| CPF-6 | Replies and edits optimistic | DONE | `TodoCardModal.tsx:305-311,373-395` | none | — |
| CPF-7 | Notifications after response (`runAfterResponse`) | DONE | `app/api/todos/[id]/comments/route.ts:136-151`; `lib/background.ts` | `lib/notifications/fanout.test.ts` "runAfterResponse defers work" | — |
| CPF-8 | Same events/recipients/payloads | DONE | `comments/route.ts:156-190` | none | Double mention email removed (`:183`). |
| LPV-1 | ≤3 URLs from comments, replies, description | DONE | `lib/link-preview/extract.ts:9`; `TodoCardModal.tsx:37`; `CardDescription.tsx`; `components/shared/OkrComments.tsx` (A3 done) | `extract.test.ts` | — |
| LPV-2 | Card: favicon, site, title, description, image, domain | DONE | `components/shared/LinkPreview.tsx:80-150` | none | — |
| LPV-3 | Skeleton + fallback row | DONE | `LinkPreview.tsx:56-100`; `app/api/link-preview/route.ts:38-49` | none | — |
| LPV-4 | `GET /api/link-preview` envelope | DONE | `app/api/link-preview/route.ts:19-36` | none | — |
| LPV-5 | SSRF-safe fetch at connect time | DONE | `lib/link-preview/fetch.ts:1-35`; `ip.ts` | `ip.test.ts`, `fetch.test.ts` | — |
| LPV-6 | OG/Twitter/title parsing rules | DONE | `lib/link-preview/parse.ts:27-134` | `parse.test.ts` | — |
| LPV-7 | https-only images, no-referrer, lazy, hide broken | DONE | `parse.ts:34`; `LinkPreview.tsx:47-50,143-146` | `parse.test.ts` | — |
| LPV-8 | LRU 500 / 24 h / 10 min; client 24 h | DONE | `lib/link-preview/cache.ts:8-10`; `hooks/useLinkPreview.ts:33-36` | `cache.test.ts` | — |
| LPV-9 | Text-only rendering | DONE | `LinkPreview.tsx` (no raw HTML) | none | — |
| AFL-1 | Options = board people with counts, Me first | DONE | `lib/sprints/board-people.ts:62-96`; `SprintBoardClient.tsx:330-392` | `board-people.test.ts` AFL-AC-1 | — |
| AFL-2 | Unassigned option | DONE | `board-people.ts:53,97-108` | `board-filters.test.ts` "unassigned sentinel" | — |
| AFL-3 | Checkbox dropdown, search >6, Clear | DONE | `components/ui/FilterMultiSelect.tsx:64-100` | none | — |
| AFL-4 | Assignee OR any member; AND with linked | DONE | `board-people.ts:110-120`; `board-filters.ts:250-276` | `board-filters.test.ts` "AND across facets" | — |
| AFL-5 | Trigger text + badge + Clear | DONE | `SprintBoardHeader.tsx:293-330` | `board-filters.test.ts` "active filter count" | — |
| AFL-6 | Persist `assignees[]`, read legacy `assignee` | DONE | `board-filters.ts:278-290` | `board-filters.test.ts` "legacy single-assignee" | — |
| AFL-7 | Drop stale ids after load | DONE | `SprintBoardClient.tsx:354-362`; `board-people.ts:122-134` | `board-people.test.ts` | — |
| AFL-8 | Header avatars show board people | DONE | `SprintBoardHeader.tsx:426-470` | none | — |
| AFL-9 | Reusable Radix `FilterMultiSelect` | DONE | `FilterMultiSelect.tsx:6-25` | none | — |

### S3 — Comment attachments

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| ATT-1 | Polymorphic `CommentAttachment` | DONE | `schema.prisma:924-947` | `lib/attachments/todo-comments.test.ts` | — |
| ATT-2 | Index `(commentType, commentId)` | DONE | `schema.prisma:946` | none | — |
| ATT-3 | Comment delete removes rows + files | DONE | `comments/[commentId]/route.ts:68-72`; `lib/attachments/todo-delete.ts`, `parent-delete.ts` | `todo-comments.test.ts` ATT-3; `parent-delete.test.ts` | — |
| ATT-4 | Migrate `TodoComment.commentAttachments` | PARTIAL | `scripts/migrate-todo-comment-attachments.ts`; legacy read `lib/attachments/todo-comments.ts` | `todo-comments.test.ts` NRG-3 | Prod `--apply` pending (G20). |
| ATT-5 | Image dimensions captured | DONE | `lib/attachments/file-types.ts` (header reader) | `file-types.test.ts` "dimensions" | — |
| UPL-1 | `POST /api/comment-attachments` | DONE | `app/api/comment-attachments/route.ts` | `staging-cleanup.test.ts` | — |
| UPL-2 | MIME + ext allowlist + magic bytes | DONE | `file-types.ts:25-82` | `file-types.test.ts` UPL-AC-2 | — |
| UPL-3 | Reject html/htm/svg/script types | DONE | `file-types.ts:43-61` | `file-types.test.ts` UPL-AC-1 | — |
| UPL-4 | Server-generated stored names | DONE | `schema.prisma:937`; `lib/attachments/storage.ts` | `project-upload.test.ts` "persistProjectFile…" | — |
| UPL-5 | 20 MB + per-comment cap | DONE | `file-types.ts:81-82` | `file-types.test.ts` "size limits" | — |
| UPL-6 | Same permission as commenting | DONE | `lib/attachments/access.ts:23-120` | `card-access-invariants.test.ts` "decision 4"; `staging-cleanup.test.ts` ACTIVITY/SCRUM | — |
| UPL-7 | Authenticated serve, safe headers, not `public/` | DONE | `lib/attachments/serve.ts:8-81`; `app/api/comment-attachments/[id]/route.ts`; `middleware.ts:18-73` | `project-upload.test.ts` NRG-1 ×3 | — |
| UPL-8 | Upload failure never loses the draft | DONE | `TodoCardModal.tsx:251-259` | none | — |
| CMP-1 | Click, drag-drop, paste | DONE | `components/shared/CommentAttachments.tsx:141-230`; `CardComments.tsx:95-115` | none | — |
| CMP-2 | Upload immediately, staged chips with progress | PARTIAL | `CommentAttachments.tsx:141-200` | none | Card composer stages on Save, not on pick. |
| CMP-3 | Removing a staged chip deletes the file | DONE | `CommentAttachments.tsx:193`; `TodoCardModal.tsx:255`; cron `app/api/cron/attachment-staging-cleanup` | `staging-cleanup.test.ts` | — |
| CMP-4 | Named rejection reason | DONE | `file-types.ts:125-129` | `file-types.test.ts` | — |
| CMP-5 | One composer component on all four surfaces | PARTIAL | `AttachmentPicker` used by OKR, activity, scrum | none | Card uses its own composer (`CardComments.tsx` + `CardCommentUploads.ts`). |
| PRV-1 | Inline image thumbnails | DONE | `CommentAttachments.tsx:81-110` | none | — |
| PRV-2 | Non-image chip: icon, name, size | DONE | `CommentAttachments.tsx:81-140` | none | — |
| PRV-3 | Image lightbox with next/prev, download | DONE | `components/shared/AttachmentLightbox.tsx:65-110` | none | — |
| PRV-4 | PDF in the same modal | DONE | `AttachmentLightbox.tsx:37-42` | `file-types.test.ts` "only images and PDFs render inline" | — |
| PRV-5 | Others open in a new tab | DONE | `serve.ts` (disposition attachment) | same | — |
| PRV-6 | Esc, backdrop, focus trap/restore, ←/→ | DONE | `AttachmentLightbox.tsx:16,65-79` (on `Modal`) | none | — |
| PRV-7 | Placeholder for broken files | DONE | `AttachmentLightbox.tsx:59,110` | none | — |
| XCT-1 | Tokens; lightbox on `Modal` | DONE | `AttachmentLightbox.tsx:16,79` | none | — |
| XCT-2 | Attaching writes ActivityLog | DONE | `comment-attachments/route.ts:123` | none | — |
| XCT-3 | Mobile reflow, full-screen lightbox | PARTIAL | — | none | Not verified on mobile. |
| XCT-4 | Portal never exposes internal attachments | DONE | portal code reads none | `staging-cleanup.test.ts` "invariant 5" | — |
| XCT-5 | Existing to-do comment attachments keep rendering | DONE | `lib/attachments/todo-comments.ts` | `todo-comments.test.ts` NRG-3 | — |

### S4 — Attachment viewer

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| AVW-1 | One component/contract everywhere | DONE | `CommentAttachments.tsx:52` (`useAttachmentViewer`); `components/todos/CardAttachments.tsx:42-69` | `viewer-invariants.test.ts` AVW-1 | — |
| AVW-2 | Images/PDFs in lightbox, others download | DONE | `AttachmentLightbox.tsx:33-42`; `serve.ts` | `file-types.test.ts` | — |
| AVW-3 | Real buttons, accessible names | DONE | `CardAttachments.tsx:42-69` | `viewer-invariants.test.ts` AVW-3 | — |
| AVW-4 | Arrow keys across the group | DONE | `AttachmentLightbox.tsx:65-70` | none | — |
| AVW-5 | Download, name, size, "2 of 4" | DONE | `AttachmentLightbox.tsx:95-101` | none | — |
| AVW-6 | Placeholder on load failure | DONE | `AttachmentLightbox.tsx:59,110` | none | — |
| AVW-7 | Reserve box from stored dimensions | DONE | `CommentAttachments.tsx:106-107` | none | Card grid uses fixed tiles (no dims needed). |
| AVW-8 | Esc closes, focus returns | DONE | `AttachmentLightbox.tsx:79` (`Modal`) | none | — |
| APL-1 | Card grid adopts viewer | DONE | `CardAttachments.tsx:42-69` | `viewer-invariants.test.ts` | — |
| APL-2 | To-do comment attachments adopt viewer | DONE | `TodoCardModal.tsx:38,1110-1112` | `viewer-invariants.test.ts` | — |
| APL-3 | OKR surface unchanged | DONE | `components/shared/OkrComments.tsx` | none | — |
| APL-4 | Project activity files | OUT OF SCOPE | `features/projects/components/activity/ActivityDetailPanel.tsx:571` | `project-upload.test.ts` NRG-1 | Per A1; files now served via the authenticated route (S5 remediation) but open in a new tab, not the lightbox. |
| APL-5 | Delete controls stay put | DONE | `CardAttachments.tsx:70-77` | none | — |
| NRG-1 | No raw `/uploads/` reads | DONE | `middleware.ts:18-73` | `viewer-invariants.test.ts` NRG-AC-1; `project-upload.test.ts` | — |
| NRG-2 | Card grid keeps delete + density | DONE | `CardAttachments.tsx` | none | — |
| NRG-3 | Both storage shapes render | DONE | `lib/attachments/todo-comments.ts` | `todo-comments.test.ts` NRG-3 | — |

### S5 — Full name on hover

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| UNH-1 | `PersonTooltip`/`PeopleTooltip`; one provider | DONE | `components/shared/UserAvatar.tsx:117,183`; `app/providers.tsx:13,101-106` | `lib/sprints/person-tooltip.test.ts` | — |
| UNH-2 | `UserAvatar` tooltip by default | DONE | `UserAvatar.tsx:233` (`tooltip = true`) | none | — |
| UNH-3 | Card styling, z-210, fade | DONE | `UserAvatar.tsx:49`; `app/globals.css:843-851` | none | — |
| UNH-4 | Clipped-only for truncated names | DONE | `UserAvatar.tsx:133` | none | — |
| UNH-5 | Stacks + "+N" list (8, "and N more") | DONE | `UserAvatar.tsx:183-210,262-276` | `person-tooltip.test.ts` | — |
| UNH-6 | No tooltip where name is visible | DONE | e.g. `SprintBoardClient.tsx:371` (`tooltip={false}`) | none | — |
| UNH-7 | alt/aria-label, initials hidden, no new tab stops | DONE | `UserAvatar.tsx:83-95,154` | none | — |
| UNH-8 | Content mounts only when open | DONE | `UserAvatar.tsx:10-20` (Radix) | none | — |
| UNH-9 | Local helpers wrapped, not swapped | DONE | `components/todos/TodoCard.tsx:51-65`; `components/todos-page/TodosPageClient.tsx:567` | none | Spot-checked 8 inventory sites. |

### S6 — Notification emails, mentions, 10-minute batching

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| BAT-1 | `BATCHED` cadence; window from `NOTIFICATION_BATCH_MINUTES` | PARTIAL | `lib/notifications/cadence.ts:21-37`; `events.ts:151-152` | `preferences.test.ts` "cadence vocabulary" | Env var never read; window = crontab (`install-crontab.sh:130`) — BAT-AC-5 needs a crontab edit (G16). |
| BAT-2 | BATCHED default for non-mandatory | DONE | `cadence.ts:35,52-55` | `preferences.test.ts` "hard-coded default is BATCHED", "org seeding" | Prod org rows: `notifications-set-batched-defaults.ts --apply` pending (G20). |
| BAT-3 | Drain accepts BATCHED | DONE | `lib/notifications/jobs.ts:19-23` | none | — |
| BAT-4 | Cron + CRON.md | DONE | `install-crontab.sh:130`; `docs/CRON.md:77`; `app/api/cron/notifications/route.ts:18` | none | — |
| BAT-5 | One email per user per drain, count subject | DONE | `jobs.ts:23-93`; `lib/email/templates/digest.ts:108-114` | none (BAT-AC-1) | — |
| BAT-6 | Claim before send | DONE | `jobs.ts:75-99` | none (BAT-AC-3) | — |
| BAT-7 | IMMEDIATE selectable; forced for ACCOUNT + force list | DONE | `cadence.ts:26`; `lib/notifications/dispatcher.ts:53,467` | `preferences.test.ts` "mandatory category…" | — |
| BAT-8 | Empty window sends nothing | DONE | `jobs.ts:23` | none (BAT-AC-2) | — |
| MEN-1 | One extractor for every surface | DONE | `lib/comments.ts:20-82` | `lib/comments.test.ts` ×8 | — |
| MEN-2 | Editor emits the user id | DONE | `components/todos/MentionEditor.tsx:137-151` | `comments.test.ts` "exact shape of the live bug" | — |
| MEN-3 | Never notify the author | DONE | `comments/route.ts:164`; `lib/comments.ts:99` | none (MEN-AC-2) | — |
| MEN-4 | Active users only, capped | DONE | `lib/comments.ts:7,60,82` | `comments.test.ts` MEN-4 | — |
| MEN-5 | `USER_MENTIONED` with entity | DONE | `comments/route.ts:170-180` | none | Mentioned user need not be able to read the card (snippet goes out regardless) — note only. |
| MEN-6 | To-do, objective, KR (+ activity/scrum if confirmed) | PARTIAL | `app/api/{objectives,keyresults}/[id]/comments/route.ts`; `app/api/projects/[id]/activities/[activityId]/comments/route.ts` | none | Scrum comments not wired (A3 scope). |
| EML-1 | Absolute link per item | DONE | `digest.ts:13,135` | `lib/email/templates/template-routes.test.ts` | — |
| EML-2 | Group by entity | PARTIAL | `digest.ts:119-124` | none | Groups by category (G16). |
| EML-3 | Subject names volume + context | DONE | `digest.ts:52-60,108-114` | none | — |
| EML-4 | Redaction unchanged | DONE | `dispatcher.ts:7,22` | none | — |
| EML-5 | Plain-text alternative | DONE | `digest.ts:126-141`; `jobs.ts:93` | none | — |
| NRG-1 | In-app still immediate | DONE | `dispatcher.ts:632-635` | `fanout.test.ts` "emit resolves after planning…" | Runs right after the response. |
| NRG-2 | Force-immediate + reminder coalescing unchanged | DONE | `dispatcher.ts:53` | none | — |
| NRG-3 | Daily/weekly/monthly drains unchanged | DONE | `install-crontab.sh:132-137` | none | — |
| NRG-4 | `emit()` never throws | DONE | `dispatcher.ts:632` | `fanout.test.ts` "delivery error is logged, never thrown" | — |
| NRG-5 | `sendMail` block-list applies | DONE | `lib/email.ts:15-20` | none | — |

### S7 — Calendar view (P0 prerequisites only)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| CPM-2 | One visibility builder per surface + record scope | DONE | `lib/todos/visibility.ts:84-126,201-212`; `features/todos/services/todo-pages.server.ts:13-81`; `lib/stores/todo-store.ts:59-63`; `components/work/WorkBoardClient.tsx:118-123`; `app/api/todos/route.ts:52-61` | `lib/todos/visibility.test.ts` (15 tests) | — |
| CPM-3 | `canWriteTodo()` extracted and used by PATCH | DONE | `lib/todos/access.ts:215-279`; `todos/[id]/route.ts:182` | `access.test.ts` CPM-3; `card-access-invariants.test.ts` "PATCH uses the extracted rule" | Lead over-grant (G4). |
| CPM-9 | `canViewSprint` on board route + page | DONE | `board/route.ts:55-61`; `features/sprints/services/sprint-pages.server.ts:35,64`; `app/dashboard/sprints/[id]/page.tsx:18` | `card-access-invariants.test.ts` CPM-9 ×2 | — |
| CPM-10 | Record-scope rules keep their effect | DONE | `visibility.ts:201-212`; `lib/apply-scope.ts:153` | `record-scope-engine.test.ts` | — |
| CPM-11 | (a) role-matrix test (b) feature gates (c) pre-deploy diff | PARTIAL | `scripts/todo-visibility-diff.ts`, `scripts/verify-todo-visibility.ts` | pure matrices: `access.test.ts` "read matrix", `sprints/access.test.ts` "view matrix" | No DB-seeded matrix; (b) moot until the calendar endpoint exists; diff not yet run on prod (G12, G20). |
| CVP-7 | `@@index([dueDate])`, `@@index([startDate])` on Todo | MISSING | `schema.prisma:599-613` | — | G12. |
| P0-CG | Export `CalendarGrid` with Monday `weekStartsOn` | MISSING | `components/ui/date-picker.tsx:198` (private, no prop) | — | G12. |
| (AC) CPM-AC-1 | KR-owner EMPLOYEE sees the card | — | `visibility.ts:23-29` | `visibility.test.ts` "never includes KR / objective ownership" | Superseded by the 2026-09-25 EMPLOYEE-scope decision (see S12 SCOPE-5). Not counted separately. |
| VSW-1…11, CAL-1…9, CUX-1…30 + CUX-1a, CDT-1…16 + CDT-10a, CAPI-1…7, CPM-1/4/5/6/7/8, CVP-1…6/8, CA11Y-1…9, CRG-1…7 | P1–P3 calendar + switcher | OUT OF SCOPE | none built (`lib/calendar/`, `app/api/todos/calendar` absent) | — | 104 IDs, approved for after release. REC-FIX-1/2 (listed in P0) are traced under S8. |

### S8 — Recurring sub-tasks and card-recurrence fixes

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| REC-FIX-1 | Head `startDate` advances with cursor, span kept | DONE | `lib/todos/recurrence-generator.ts:194-221` (`planSeriesAdvance`) | `recurrence.test.ts` REC-FIX-AC-1, -1b, -2 | — |
| REC-FIX-1r | One-off head repair (dry-run default) | DONE | `scripts/repair-recurrence-heads.ts:16,48,86` | none (script) | Prod run pending (G20). |
| REC-FIX-2 | Checklist item dates shift; head items follow | DONE | `recurrence-generator.ts:194-195,269` | `recurrence.test.ts` REC-FIX-AC-3, REC-FIX-2 | — |
| REC-FIX-2r | Repair realigns head item dates | DONE | `repair-recurrence-heads.ts:16` (`previousOccurrence`) | `recurrence.test.ts` (imports `previousOccurrence`) | — |
| REC-FIX-3 | DatesPanel helper text | DONE | `components/todos/CardDatesPanel.tsx:334` | none | — |
| RST-1…18, RSG-1…10, RSA-1…9, RSU-1…14, RSC-1…5, RSPM-1…8, RSO-1…4 | Recurring sub-tasks (model, generator, API, UI, calendar, permissions, cron) | OUT OF SCOPE | no `TodoRecurringSubtask`, `recurringSubtaskId`, route or component anywhere | — | 68 IDs. Q1–Q11 decided (§8) but P1/P2 not started; planned post-release. Prerequisite `canWriteTodo` (RSPM-1) exists. |

§8 "observed" follow-ups, for the record: MONTHLY drift fixed by `Todo.recurrenceAnchorDay` (`schema.prisma:535`, `scripts/backfill-recurrence-anchor.ts`, tests `recurrence.test.ts` R-13); the `take: 500` scan is paged (`recurrence-generator.ts:48,67-79`); generated occurrences are now audited (`:317-330`). The `progressValue` double-count question is still open.

### S9 — AI sprint planning (`docs/AI_SPRINT_PLANNING.md`, §0 applied)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| D0-1 | Team sprint first; PLANNING with dates | DONE | `app/api/sprints/ai/generate/route.ts:82-99` | none | — |
| D0-2 | Per-user in-place generation | DONE | `lib/ai/pipeline.ts:113,202` | none | — |
| D0-3 | Many plans per sprint; idempotency (sprint, subject, DRAFT) | DONE | `schema.prisma:1320-1323`; `generate/route.ts:104-110` | none | — |
| D0-4 | Per-user review page | DONE | `app/dashboard/sprints/ai/[planId]`; `features/sprints-ai/components/ReviewPlanClient.tsx` | none | — |
| D0-5 | Accept keeps sprint PLANNING; drops unkept | DONE | `sprints/ai/[planId]/accept/route.ts:66-80,127` | none | — |
| D0-6 | Board hides `aiSuggested` | DONE | `board/route.ts:71` | none | — |
| INIT-1 | Button visible only when flag on + permitted | PARTIAL | `features/sprints-ai/components/GenerateSprintButton.tsx:22-50`; `SprintBoardHeader.tsx:129-131` | none | Rendered regardless of flag; 404 only on click (G18). |
| INIT-2 | Modal: window, provider, AUTO/MANUAL cards | PARTIAL | `GenerateSprintModal.tsx:55-99,174-181` | none | Window comes from the sprint (§0); MANUAL uses a flat KR list, not the picker. |
| INIT-3 | Cancel / Back / Generate | DONE | `GenerateSprintModal.tsx:128-131` | none | No separate Back step (inline scope). |
| INIT-4 | Failure/empty cases in-modal | PARTIAL | `GenerateSprintModal.tsx:83` | none | Toasts instead of a red banner; no "Create an objective first" state. |
| PICK | Shared `OkrPicker` + `alignment-search?includeKeyResults&multi` + "Mine only" (incl. AC-34g/h/i) | MISSING | no `components/shared/OkrPicker/`; alignment-search unchanged | none | G18. |
| R1 | KR inactive → DESCOPE | DONE | `lib/ai/carryover.ts:77-79` | none | Never applied (G5). |
| R2 | KR target met → DESCOPE | DONE | `carryover.ts:80-82` | none | Never applied (G5). |
| R3 | Inactive assignee → ESCALATE | DONE | `carryover.ts:83-85` | none | Never applied (G5). |
| R4 | `carryoverCount ≥ 2` disallows KEEP | DONE | `carryover.ts:88-96` | none | — |
| R5 | Stale due date recomputed + annotated | PARTIAL | `carryover.ts:45-49` | none | Flag only; no new `dueDate`/description note. |
| R6 | Privacy of carryover context | DONE | `lib/ai/context-bundler.ts:484-512` | none | — |
| R7 | Cancelled-sprint carryover rule | PARTIAL | `context-bundler.ts:368` | none | "scope removed" exception absent. |
| R8 | No double-count of `progressValue` | DONE | accept never writes KR values | none | — |
| OBS-1 | Admin AI-logs list + role gate | DONE | `app/dashboard/admin/ai-logs/page.tsx:12`; `app/api/admin/ai-logs/route.ts:13-70`; `features/admin-ai-logs` | none | — |
| OBS-2 | Log detail page + API | MISSING | — | — | G18. |
| OBS-3 | Cost page + `/cost` API | MISSING | — | — | G18. |
| OBS-4 | Plan inspector + `/quality` API | MISSING | — | — | G18. |
| PRV-1 | Multi-provider behind one interface | DEVIATES | `lib/ai/providers/wired.ts:8`; `lib/ai/config.ts:13` | `lib/ai/providers/providers.test.ts` "only OpenAI is wired" | OpenAI only (documented; F6 "hide unwired providers" done). Schema default still `anthropic` (G6). |
| SET-1 | Daily cap (429) | DONE | `lib/ai/generation-log.ts:59`; `generate/route.ts:67-75` | none | — |
| SET-2 | Per-user 30-min cooldown | MISSING | — | — | G18. |
| SET-3 | Regenerate budget 3 / 30 min | MISSING | `regenerate/route.ts` | — | G18. |
| SET-4 | Failure isolation (502, ERROR log, no writes) | DONE | `pipeline.ts:90`; `generate/route.ts:139-150` | none | — |
| DM | `AiSprintPlan`, `AiGenerationLog`, Todo carryover fields, org flags | DONE | `schema.prisma:206-212,556-580,1318-1380` | none | — |
| API-a | `GET carryover-candidates` | MISSING | — | — | — |
| API-b | `POST generate` | DONE | `generate/route.ts` | none | — |
| API-c | `GET /:planId` | DONE | `app/api/sprints/ai/[planId]/route.ts` | none | — |
| API-d | `POST carryover/override` | PARTIAL | `[planId]/carryover/override/route.ts` | none | No UI; accept cannot apply it (G5). |
| API-e | `POST accept` | PARTIAL | `accept/route.ts:26-147` | none | Carryover branch unreachable; SPLIT deferred (G5). |
| API-f | `POST regenerate` | DONE | `regenerate/route.ts:54-63` | none | — |
| API-g | `POST discard` | DEVIATES | `discard/route.ts:36-47` | none | Still pre-§0: deletes the team sprint (G1). |
| API-h | `preview-context` (admin debug) | DONE | `[planId]/debug/route.ts:12-13` | none | Renamed to per-plan debug. |
| PERM | Role × subject scope | DONE | `generate/route.ts:54-64`; plan routes owner/subject/ADMIN/EXEC | none | — |
| UI-1 | Review screen: rationale, carryover above tasks, STRETCH | PARTIAL | `ReviewPlanClient.tsx:196-205,262-299,351` | none | No allocation chart, no override controls, STRETCH shown but not toggleable. |
| UI-2 | Generation progress modal | MISSING | — | — | G18. |
| NFR-flag | Feature behind org flag | PARTIAL | `generate/route.ts:44`; accept/discard `:27-28` | none | API gated; button not (INIT-1). |
| AC-1 | Happy path (3–15 todos, ≥3 KRs, PLANNING) | PARTIAL | `pipeline.ts` | none | Untested end-to-end. |
| AC-2 | Allocation maths band | PARTIAL | `lib/ai/sprint-math.ts` | none | No unit tests (spec §12 asked for them). |
| AC-3 | Weight balancing | PARTIAL | `sprint-math.ts` | none | Untested. |
| AC-4 | Previous-sprint review | PARTIAL | `context-bundler.ts:169-194` | none | Untested. |
| AC-5 | Privacy filter in bundle | DONE | `context-bundler.ts:484-512` | none | — |
| AC-6 | Sparse-data resilience | PARTIAL | `sprint-math.ts` | none | Untested. |
| AC-7 | RBAC 403s | DONE | `generate/route.ts:54-64` | none | — |
| AC-8 | Idempotency | DONE | `generate/route.ts:104-110` | none | Key is (sprint, subject) per §0. |
| AC-9 | Regenerate supersedes, no dup | DONE | `regenerate/route.ts:54-63` | none | — |
| AC-10 | Selective accept + `SPRINT_AI_ACCEPTED` | DONE | `accept/route.ts:66-80,131-145` | none | No ACTIVE flip (per §0). |
| AC-11 | Failure isolation | DONE | as SET-4 | none | — |
| AC-12 | Cost cap 429 | DONE | as SET-1 | none | — |
| AC-13 | Flag off → 404 + button hidden | PARTIAL | `generate/route.ts:44` | none | Button not hidden. |
| AC-14 | Cache observability | DONE | `pipeline.ts` (cachedTokens → log) | none | — |
| AC-15 | Basic carryover (KEEP moves, count+1) | MISSING | `accept/route.ts:62-64` vs `context-bundler.ts:425` | none | Unreachable (G5). |
| AC-16 | Carryover subtracts from target | PARTIAL | `pipeline.ts` (`carryoverDeltaByKr`) | none | Computed; untested. |
| AC-17 | Saturated KR → 0 new tasks | PARTIAL | prompt/maths | none | Untested. |
| AC-18 | Auto-descope archived KR | PARTIAL | `carryover.ts:77-79`; `accept/route.ts:103-113` | none | Computed, never applied. |
| AC-19 | Auto-descope target met | PARTIAL | `carryover.ts:80-82` | none | Never applied. |
| AC-20 | Repeat escalation + manager notification | PARTIAL | `carryover.ts:88-96` | none | No manager notification anywhere. |
| AC-21 | SPLIT into 2–4 todos | MISSING | `accept/route.ts:118-124` ("deferred") | none | G5. |
| AC-22 | Override disposition | PARTIAL | override route exists | none | No UI; not applied. |
| AC-23 | No double-count on carry | DONE | accept never touches KR | none | — |
| AC-24 | Stale due annotation | MISSING | `carryover.ts:45` (flag only) | none | — |
| AC-25 | Sprint-debt warning | PARTIAL | prompt-dependent | none | Untested. |
| AC-26 | Cancelled prior sprint | PARTIAL | `context-bundler.ts:368` | none | See R7. |
| AC-27 | Inactive assignee → ESCALATE + suggested assignee | PARTIAL | `carryover.ts:83-85` | none | `suggestedAssigneeId` not verified; never applied. |
| AC-28 | First sprint → empty carryover | DONE | `context-bundler.ts:173-179` | none | — |
| AC-29 | Admin list; EMPLOYEE 403 | DONE | as OBS-1 | none | — |
| AC-30 | Cost rollup | MISSING | — | — | — |
| AC-31 | Cache-hit % in list | DONE | `admin/ai-logs/route.ts:67-68`; `features/admin-ai-logs/components/AiLogsClient.tsx:80-108` | none | — |
| AC-32 | Plan quality telemetry | MISSING | — | — | — |
| AC-33 | Cap warning banner | MISSING | — | — | — |
| AC-34a | Button hidden when flag off | PARTIAL | as INIT-1 | none | — |
| AC-34b | AUTO path body | DONE | `GenerateSprintModal.tsx:90-99` | none | — |
| AC-34c | MANUAL requires ≥1 KR + inline hint | PARTIAL | `GenerateSprintModal.tsx:75,83,131` | none | Hint is a toast. |
| AC-34d | MANUAL output stays in scope | PARTIAL | `context-bundler.ts:6,292-300` | none | Prompt-only; no server post-filter of proposals. |
| AC-34e | 403 with `details.invalidIds` | PARTIAL | `context-bundler.ts:130-135`; `generate/route.ts:153` | none | Ids in message, not `details`. |
| AC-34f | Out-of-scope carryover warning in review | PARTIAL | `generate/route.ts:132` | none | Returned by API; no review banner. |
| AC-34 | Provider override per call | DONE | `generate/route.ts:23,52` | `providers.test.ts` | Only `openai` resolvable. |
| AC-35 | Default provider fallback | DEVIATES | `config.ts:13,93-96`; `schema.prisma:212` | `providers.test.ts` "getAiOrgConfig…" | Schema default `anthropic` → 503 (G6). |
| AC-36 | Missing key → 503 | DONE | `generate/route.ts:139-143` | `providers.test.ts` "getProvider…" | — |
| AC-37 | No cross-provider failover | DONE | `generate/route.ts:145-150` | `providers.test.ts` "ProviderCallError…" | — |
| AC-38 | Cost by provider | MISSING | — | — | — |
| AC-39 | Admin provider filter + badge | DONE | `admin/ai-logs/route.ts:21,30,63` | none | — |
| AC-40 | Idempotency provider-agnostic | DONE | `generate/route.ts:104-110` | none | — |

### S10 — Closed sprint management (`../docs/CLOSED_SPRINT_MANAGEMENT_REQUIREMENTS.md`)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| UX-01 | `AppleDatePicker` + `AppleDateRangePicker`; no native date input in sprint paths | DONE | `components/ui/date-picker.tsx:333,409`; `components/sprints/ScheduleSprintModal.tsx:14,107`; `EndSprintModal.tsx:22,401` | grep: no `type="date"` under `components/sprints`/`features/sprints` (AC-UX01-1) | Single file, not `date-range-picker.tsx`; one native date input remains in `components/todos/CardDatesPanel.tsx:322` (recurrence end — outside the AC's paths). |
| UX-02 | End Sprint modal v2 | PARTIAL | `EndSprintModal.tsx:129-135,151,311-317,343,425` | none | Mismatch banner + "View report" toast action missing (G14). |
| UX-03 | Report page | DONE | `app/dashboard/sprints/[id]/report/page.tsx`; `SprintReportClient.tsx:417-441` | none | — |
| UX-04 | Completed-tab card with real % | DONE | `SprintsListClient.tsx:97-109` | none | — |
| UX-05 | Read-only banner (+ View report, Reopen), 60% saturation | PARTIAL | `SprintBoardHeader.tsx:229-247`; `SprintBoardClient.tsx:645` | none | Report link sits in the header row; no Reopen on the banner. |
| UX-06 | Carryover badge with lineage tooltip | PARTIAL | `TaskCardTrello.tsx:253-266` | none | Tooltip generic ("Carried N times"), no sprint names. |
| UX-07 | Motion & a11y rules | DONE | `app/globals.css:971,1048`; `date-picker.tsx:104` | none | — |
| BR-01 | Single completion path (`USE_END_ENDPOINT`; cancel uses engine) | DONE | `app/api/sprints/[id]/route.ts:49-53,100-126` | none (T-10) | — |
| BR-02 | Transactional disposition engine | DONE | `lib/sprints/end-sprint.ts`; `close-sprint.ts:155-360` | `end-sprint.test.ts` T-01 | T-11…T-13 absent; `recordActivity` inside the tx uses the global client, so audit rows survive a rollback. |
| BR-03 | Carryover lineage | DONE | `close-sprint.ts:251` (`buildCarryoverPatch`) | T-02, T-03 | — |
| BR-04 | Position normalisation; cancel clears sprint | DONE | `close-sprint.ts:209-273` | T-04 | — |
| BR-05 | Persisted `SprintCompletionSummary` | DONE | `schema.prisma:1176-1201`; `close-sprint.ts:298-331` | none (T-14) | — |
| BR-06 | Read-only enforcement (409) | PARTIAL | `board/reorder/route.ts:46-48`; `app/api/todos/route.ts:271`; `guards.ts`; `todos/[id]/route.ts:241-268` | `card-access-invariants.test.ts` STA-7 | `columnId`-only PATCH bypass (G3). |
| BR-07 | "Complete" = status; preflight mismatch list | DONE | `app/api/sprints/[id]/end/route.ts:23,61,87` | T-05 | UI does not show it (UX-02). |
| BR-08 | Reopen within 7 days | DONE | `app/api/sprints/[id]/reopen/route.ts:16,59-61,116-124` | T-07, T-08 | — |
| BR-09 | Report endpoint | DONE | `app/api/sprints/[id]/report/route.ts:45,53,146-148` | T-06 | Readership = `canViewSprint` (invite-only supersedes "department lead"). |
| BR-10 | `SPRINT_REOPENED`, `INITIATIVE_CANCELLED_AT_CLOSE` | DONE | `end/route.ts:141-174`; `reopen/route.ts:124` | none (T-18) | — |
| BR-11 | Delete keeps summary; clone copies no tasks | DONE | `schema.prisma:1197`; `clone/route.ts:19,56` | none (T-19) | — |
| FR-01 | End modal: preflight, per-row, destination, new sprint | PARTIAL | `EndSprintModal.tsx:129-162,311-317,401` | none | AC-FR01-3/4 partly: no report link in toast; mismatch not shown (G14). |
| FR-02 | Report page with gated actions | DONE | `SprintReportClient.tsx:195-262,417-441` | none | — |
| FR-03 | Completed-tab cards from summary | DONE | `SprintsListClient.tsx:97-109`; `app/api/sprints/route.ts:51` | none | — |
| FR-04 | Read-only completed board | DONE | `SprintBoardHeader.tsx:229-247`; `TaskCardTrello.tsx:142`; `SprintBoardClient.tsx:645,684` | none | — |
| FR-05 | Carryover badges with lineage | PARTIAL | `TaskCardTrello.tsx:253-266` | none | No lineage in tooltip. |
| FR-06 | Cancelled tasks findable (report + "Show cancelled" toggle) | DEVIATES | `components/todos-page/TodoKanbanView.tsx:15`; report groups | none | Always-on Cancelled column instead of a toggle (undocumented). |
| FR-07 | Permission-driven UI | PARTIAL | `SprintReportClient.tsx:417-441` | none | Board header/list controls not gated (G15). |
| FR-08 | Date-picker migration + presets | DONE | `ScheduleSprintModal.tsx:107-114`; `date-picker.tsx:149-155` | none | — |
| DM-S | Summary model + legacy backfill | DONE | `schema.prisma:1176-1201`; `prisma/backfill-sprint-summaries.ts`; `report/route.ts:27-28,69` | none | Backfill prod run: see G20. |
| E1 | Zero incomplete → one-click complete | DONE | `EndSprintModal.tsx:151` | none | — |
| E2 | Zero completed allowed | DONE | `end-sprint.ts` (`completionRate`) | T-06 | — |
| E3 | Unknown `todoId` → 400 | DONE | `close-sprint.ts:149` | none | — |
| E4 | `nextSprintId` = self → 400 | DONE | `close-sprint.ts:107` | none | — |
| E5 | Target closes mid-flow → 409 + refetch | PARTIAL | `close-sprint.ts:134` | none | Returns 400, not 409. |
| E6 | Reopen after window → 409 | DONE | `reopen/route.ts:59-61` | T-08 | — |
| E7 | Re-close overwrites summary | DONE | `close-sprint.ts:314-330` | none | — |
| E8 | Carried-into sprint deleted → lineage survives | DONE | `schema.prisma` (`originalSprintId` plain string) | none | — |
| E9 | Concurrent close → one 409 | DONE | `close-sprint.ts:157-160` | none (T-20) | — |
| E10 | Edit after close blocked except clearing `sprintId` | PARTIAL | `todos/[id]/route.ts:241-268` | none | Non-status fields still editable (G3). |

Test plan coverage: T-01…T-08 exist (`lib/sprints/end-sprint.test.ts:32-139`); T-10…T-20 (API integration) absent — no test DB harness.

### S11 — Tasks & Sprints audit (`../docs/TODO_SPRINT_AUDIT_AND_REQUIREMENTS.md`, web-applicable parts)

The audit was written for the desktop (Tauri) app. Rows marked N/A concern SQLite, the outbox, OS notifications or tabs.

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| B-01 | Tree view OKR labels (desktop cache) | N/A | web tree uses server titles `components/todos-page/TodoTreeView.tsx` | — | — |
| B-02 | Desktop OKR fields write-only | N/A | web: `components/sprints/LinkToOkrPopover.tsx`, `components/todos/CardLinkedOkr.tsx` | — | — |
| B-03 | Quick-add moves wrong card on duplicate titles | N/A | web composer creates directly in the lane (`SprintAddTaskInline.tsx:59-72`) | — | Web analogue bug is status, see R-07.2. |
| B-04 | Comments/checklists never sync | N/A | server-side on web | — | — |
| B-05 | Cancelled tasks vanish from boards | PARTIAL | `TodoKanbanView.tsx:15`; sprint board excludes by design `board/route.ts:109-110` | none | Visible in global kanban and sprint report only. |
| B-06 | Assignee filter has no picker | PARTIAL | `TodosPageClient.tsx:104-156` (scope me/created/all) | none | No pick-a-person filter on `/dashboard/todos`; sprint board has one (AFL). |
| A-01 | Desktop OKR data plane | N/A | — | — | — |
| A-02 | Sub-task schema + sync contract | MISSING | no `Todo.parentId` (`schema.prisma:491-613`) | — | See R-01. |
| A-03 | Tab/navigation layer | N/A | — | — | — |
| A-04 | Collaboration data one-way | N/A | — | — | — |
| R-01 | Sub-tasks (parent/child todos, roll-up) | MISSING | no `parentId`; checklists are the only analogue | — | Desktop-targeted P0; no web commitment. |
| R-02a | Desktop OKR cache tables/adapter | N/A | — | — | — |
| R-02b.1 | OKR picker (browse + search objectives and KRs) | DONE | `LinkToOkrPopover.tsx:6-59` (search both, recents) | none | — |
| R-02b.2 | KR link derives objective | DONE | `todos/[id]/route.ts:223-235` | none | — |
| R-02b.3 | OKR filter on lists; sprint "linked" chip | PARTIAL | sprint board linked facet `SprintBoardHeader.tsx:389-410`; to-dos page linked/standalone only `TodosPageClient.tsx:172-177` | `board-filters.test.ts` "linked facet" | No per-objective/KR filter. |
| R-02b.4 | Archived-KR warning chip + "Remove link" | MISSING | none found in `CardLinkedOkr.tsx` / `LinkToOkrPopover.tsx` | — | — |
| R-03 | Smart lists, flag, inline quick-add, NL dates | MISSING | no `isFlagged`; `/dashboard/todos` creates via modal | — | Desktop-targeted; counts only (`TodosPageClient.tsx:196-207`). |
| R-04 | Per-task reminders & recurrence | PARTIAL | `dueReminder` (DTE-4), recurrence (DTE-5) | `due-reminders.test.ts`, `recurrence.test.ts` | No snooze, custom RRULE or repeat-from-completion. |
| R-05 | Task detail as page / deep link / duplicate / undo | PARTIAL | `?open=` `TodosPageClient.tsx:131-136`; `?card=` `SprintBoardClient.tsx:255-262`; `app/api/todos/[id]/duplicate/route.ts` | none | Modal, not a route; delete has no undo. |
| R-06.1 | View/filter persistence | MISSING | `TodosPageClient.tsx:104-110` (plain `useState`) | — | Only sprint-board filters persist. |
| R-06.2 | Filter bar (assignee, priority, due, chips, Clear all) | PARTIAL | `TodosPageClient.tsx:148-191` | none | Search/status/scope/link only. |
| R-06.3 | List sort, group-by, hide completed, inline edit, bulk | PARTIAL | inline assignee/due `TodosPageClient.tsx:220-223`; status "open" hides completed | none | No sort, group-by or multi-select. |
| R-06.4 | Board parity (drop lines, reorder, cancelled toggle) | PARTIAL | `TodoKanbanView.tsx:86,144-167`; `app/api/todos/reorder/route.ts` | none | Cancelled column always on; no inline add; reorder route unscoped (G7). |
| R-07.1 | Id-based quick-add (B-03 fix) | DONE | `SprintAddTaskInline.tsx:59-72` | none | — |
| R-07.2 | Create directly with the lane's status | PARTIAL | `app/api/todos/route.ts:280-303` | none | Lane honoured, status forced PENDING (G9). |
| R-07.3 | Quick-add details (priority, due, OKR) | DONE | `SprintAddTaskInline.tsx:60-72` | none | — |
| R-07.4 | Planner drag / week rows | OUT OF SCOPE | `features/sprints/components/SprintPlannerView.tsx:47` (read-only) | — | Replaced by calendar P1 (post-release). |
| R-07.5 | Sprint delete confirm with keep/detach | PARTIAL | `SprintReportClient.tsx:202,262`; FK SetNull detaches cards | none | Only from the report of a closed sprint; no "delete tasks too"; no list-level delete. |
| R-07.6 | Optimistic board moves with rollback | DONE | `SprintBoardClient.tsx:540-561,301-309` | none | Rollback via refetch. |
| R-07.7 | Board text search + priority filter | MISSING | `lib/sprints/board-filters.ts` (assignee/label/due/watching/linked only) | — | — |
| R-07.8 | Sprint → KR goal link | OUT OF SCOPE | — | — | Spec: "not in scope for P1". |
| R-08 | Multi-tab pages | N/A | — | — | Desktop shell. |
| R-09 | Comments/checklists sync decision | N/A | server-side on web | — | — |
| NFR | Web-applicable NFRs (virtualise >200 rows, delete undo) | PARTIAL | `lib/todos/visibility.ts:244` (500 cap) | none | No virtualisation; no undo. |

### S12 — Invite-only sprints and EMPLOYEE to-do scope (`docs/REMEDIATION_PLAN_2026-09-25.md`)

| ID | Requirement | Status | Evidence | Tests | Gap |
|---|---|---|---|---|---|
| INV-1 | ADMIN/EXECUTIVE see all; others only owner/participant; department grants nothing; portal never | DONE | `lib/permissions.ts:348-408,469-476` | `lib/sprints/access.test.ts` "view matrix", "DEPARTMENT_LEAD … NOT invited"; `sprint-access-invariants.test.ts` "no department-membership branch" | — |
| INV-2 | Every sprint list uses `sprintVisibilityWhere` | DONE | `app/api/sprints/route.ts`, `active/route.ts`, `[id]/end/route.ts`, `[id]/report/route.ts`; `lib/dashboards/home.server.ts`; `app/api/okr-hierarchy/_shared.ts`; `lib/automations/tools/okr-query.ts` | `sprint-access-invariants.test.ts` "every sprint list applies…"; `access.test.ts` "sprintVisibilityWhere lists exactly…" | — |
| INV-3 | Board, page, columns, report, clone, share gated | DONE | `board/route.ts:55-61`; `sprint-pages.server.ts:35,64`; `clone/route.ts:49`; `share/route.ts:42-50` | `card-access-invariants.test.ts` CPM-9 ×2 | — |
| INV-4 | Being put on a card invites to its sprint | DONE | `lib/sprints/participants.ts:32`; callers `app/api/todos/route.ts:326`, `todos/[id]/route.ts:381-385`, `members/route.ts:39-47`, `close-sprint.ts:186,256`, `clone/route.ts:130`, `recurrence-generator.ts:305`, `accept/route.ts:77-80` | `sprint-access-invariants.test.ts` "every such write path calls inviteToSprint"; `sprints/access.test.ts` "inviteToSprint…" | — |
| INV-5 | Moving/creating a card on a board requires viewing it | DONE | `todos/[id]/route.ts:190-201`; `app/api/todos/route.ts:266-271` | `sprint-access-invariants.test.ts` "a card can only be put on a board…" | — |
| INV-6 | Opening a card by link only for sprint (or, off-sprint, OKR) viewers | PARTIAL | `lib/todos/access.ts:335-350,459-516` | `access.test.ts` "decision 3" ×3 | DEPARTMENT_LEAD reads/writes every card via `TODO_WRITE_ROLES` (G4). |
| INV-7 | Participants edit every card in their sprint; may reorder | DONE | `access.ts:86-95,241-243`; `permissions.ts:483-490` | `sprints/access.test.ts` "board reorder…" | — |
| INV-8 | Members API/dialog gated by `canEditSprint` | DONE | `app/api/sprints/[id]/participants/route.ts:53-110`; `SprintMembersDialog.tsx` | `sprint-access-invariants.test.ts` "the members endpoint…" | — |
| INV-9 | Nothing removes a participant automatically | DONE | `members/route.ts:65`; `participants/route.ts:15` | `sprint-access-invariants.test.ts` "nothing removes a sprint participant" | — |
| INV-10 | Other surfaces consistent with invite-only | PARTIAL | `app/api/keyresults/[id]/todos/route.ts:42-49`; `app/api/initiative-report/route.ts:19-33`; `app/api/search/route.ts:64-72` | none | KR initiative list and initiative report leak uninvited sprint cards (G11). |
| SCOPE-1 | EMPLOYEE scope = assignee · creator · member · watcher(read) · owner/participant of the card's sprint | DONE | `lib/todos/visibility.ts:137-177`; `lib/apply-scope.ts:153` | `visibility.test.ts` "participant scope (read)…"; `record-scope-engine.test.ts` "is_participant on todo (list read)" | — |
| SCOPE-2 | Watching never widens write scope | DONE | `visibility.ts:150-152,172-175` | `record-scope-engine.test.ts` "is_participant on todo (write)…" | — |
| SCOPE-3 | Seeded rule + one-off migration | DONE | `scripts/seed-permissions.ts:1142`; `scripts/update-employee-todo-scope.ts` | `record-scope-engine.test.ts` "seed-permissions seeds the participant rule…" | Deploy code **before** `--apply` (old code ignores `is_participant`) — G20. |
| SCOPE-4 | To-dos list shows the whole scope | PARTIAL | `visibility.ts:94-116` | `visibility.test.ts` "the to-dos surface rule covers every non-watch relationship…" | Watched cards open but are not listed (documented in code comment `:111-113`). |
| SCOPE-5 | KR/objective ownership no longer lists cards for EMPLOYEE | DEVIATES | `visibility.ts:23-29` | `visibility.test.ts` "participant scope never includes KR / objective ownership" | Documented user decision; conflicts with calendar CPM-AC-1 (spec should be amended). |

---

## 4. Notes on method

- Line numbers were read with `grep -n`/`sed -n` on 2026-09-27 against the uncommitted working tree described in `docs/REMEDIATION_PLAN_2026-09-25.md`.
- "Tests" names the suite and test title where one exists. "none" means no automated test touches the behaviour; most UI requirements have no component-test runner in this repo.
- Counting: grouped OUT OF SCOPE rows count each listed ID (S7: 104, S8: 68). S7's CPM-AC-1 row is informational and not counted. S9 IDs D0/INIT/PICK/R/OBS/SET/API/UI are labels given to un-numbered spec clauses so every clause is traceable.
- Nothing in this review was changed in code; the only file written is this document.
