# Project Management & Delivery Intelligence — Feature Tracker

**Source of truth for build status.** Derived from `docs/project_management_module_BUILD_SPEC.md`.
Update the **Status** and **Files** columns as each feature ships. Status values:
`⬜ Not Started` · `🟨 In Progress` · `🟩 Done` · `✅ Verified`.

> Build order is phase-gated per spec §6.1. **P2 (Delay Ledger core) must ship before P3 (Gantt).**
> Every feature must also satisfy the **Global DoD** (§6.2) and the **10 Critical Invariants** (§6.3),
> reproduced at the bottom of this file. When a feature is completed, update this tracker plus
> `CHANGELOG_AI.md`, `FEATURE_STATUS.md`, `MASTER_REFERENCE.md`, `SITEMAP.md`, `COMPONENT_CATALOG.md`.

---

## Status summary

| Phase | Epic | Features | Status |
|-------|------|----------|--------|
| **0** | Groundwork | Tracker · CLAUDE.md guardrails · Prisma schema (30 models, pushed) · types/barrel · core algorithms (business-days/rollup/confidence/evm + 34 tests) · permissions (15 DocTypes, 60 rows) · notifications (PROJECT + 22 events) | ✅ Verified |
| **P1** | A, B | A1, A2, B1, B2 | ✅ Verified |
| **P2** ⭐ | C | C1, C2, C3, C4, C5 | ✅ Verified |
| **P3** | D, E, F | D1–D4, E1, F1, F2 | ✅ Verified |
| **P4** | H | H1–H6 | 🟩 Done |
| **P5** | I | I1, I2, I3 | 🟩 Done |
| **P6** | G | G1–G6 | 🟩 Done |
| **P7** | J | J1–J6 | ✅ Verified |
| **P8** | K | K1, K2, K3 | ✅ Verified |
| — | Cross-cutting | Permissions (§5.1) · Notifications (§5.2) · Cron (§5.3) | ✅ Verified |

**Legend for DoD checkboxes below:** each feature carries the spec's DoD list. Global DoD (API envelope,
permissions, audit, shared types, react-hook-form, Modal/ConfirmDialog/EmptyState, `cn()` tokens,
barrel export, unit tests, docs) applies to **all** and is not repeated per row.

---

# EPIC A — Project Setup & Templates  *(P1 · resolves #4, #14)*

## A1 — Create Project — ✅ Verified
- **User story:** As a PM, create a project (client, dates, PM, budget) as the single source-of-truth container.
- **Requirements:** 3-step wizard (Basics/Schedule/Template) at `/dashboard/projects` → full-page (not modal). Auto `PRJ-{YYYY}-{NNN}` code (unique, editable, transaction-safe sequence). PM picker defaults to current user (`useUsersForSelection`). Dept via `useDepartments`. Contract value + currency (ETB default). Draft persisted per step in Zustand until final submit. Created in `PLANNING`, `baselineCommittedAt=null`, `percentComplete=0`. Template selection instantiates full tree (A2). PM auto-added as `ProjectMember(role=PM)`.
- **Acceptance criteria:** wizard opens with PM pre-filled; duplicate code → inline error, cannot advance; `plannedEnd ≤ plannedStart` → blocked; complete w/ template → full phase/milestone/activity tree, status `PLANNING`, land on Gantt; "Start blank" → zero phases, empty state + "Add Phase" CTA; `ActivityLog` `created` entry exists.
- **UI/UX:** stepper (● ━ ○ ━ ○); primary "New Project" top-right; fields per spec table; inline validation.
- **DoD:** `POST /api/projects` (withAuth, Zod, envelope) · react-hook-form · txn-safe code · transactional template instantiation · ActivityLog · unit tests (code-gen, date validation, template instantiation) · empty state.
- **Files:** `app/api/projects/route.ts`, `lib/projects/service.ts`, `features/projects/components/CreateProjectWizard.tsx`, `features/projects/components/ProjectsListClient.tsx`, `features/projects/hooks/useProjects.ts`, `app/dashboard/projects/page.tsx`
- **Notes:** Project Creation v1.1 P1 is complete through Story 1.10. P2 Stories 2.1–2.4 add secure retained uploads, optional OpenAI column mapping, explicit cleanup decisions, and ordered DOCX source extraction. The Manual modal now uses compact responsive progress/substep cards and a required Website/Web Portal/Data Platform/Mobile App/Banking App/ICT Equipment Supply/Import type before type-linked schedule selection. Projects remain `PLANNING` and unbaselined with no notification, portal, Jira, assignment, client invitation, or external send.

## A2 — Project Templates (Seeded Lifecycle) — ✅ Verified
- **User story:** Start from a predefined delivery lifecycle so methodology is a reusable asset.
- **Requirements:** Seed the original 3 general system templates plus 7 type-linked schedules for Website, Web Portal, Data Platform, Mobile App, Banking App, ICT Equipment Supply, and Import (`isSystem=true`, non-deletable). Template directory/builder manage explicit type links for custom templates. **Copy-on-instantiate** remains unchanged; clone system → editable copy preserving the type link.
- **Acceptance criteria:** fresh install/deploy → 10 system templates with at least one exact match per approved project type; creation filters exact/general schedules and keeps Start blank; clone preserves type link; editing a template leaves existing projects unaffected.
- **UI/UX:** template list at `/dashboard/projects/templates`; builder at `/dashboard/projects/templates/new` and `/dashboard/projects/templates/[id]`; left tree + right properties; native HTML5 drag-and-drop reorders phases, milestones, and activities.
- **DoD:** seed script (3 templates) · copy-not-reference instantiation · `ownerParty=CLIENT` verified on every approval · drag-drop persists order · cloning works · builder UI + create/clone/delete flows · ActivityLog entries.
- **Files:** `lib/projects/templates.ts` (3 structures + `instantiateTemplateStructure` + builder helpers), `prisma/seed-project-templates.ts`, `scripts/seed-project-permissions.ts`, `app/api/projects/templates/route.ts`, `app/api/projects/templates/[id]/route.ts`, `app/api/projects/templates/[id]/clone/route.ts`, `features/projects/hooks/useProjects.ts`, `features/projects/components/TemplateListClient.tsx`, `features/projects/components/TemplateBuilderClient.tsx`, `app/dashboard/projects/templates/page.tsx`, `app/dashboard/projects/templates/new/page.tsx`, `app/dashboard/projects/templates/[id]/page.tsx`
- **Status note:** original general schedules plus seven linked schedules, deploy-time idempotent seed, type-first picker, directory filtering/badges, builder association, copy-on-create, and type-preserving clone are implemented. System templates remain read-only; custom templates remain editable/deletable.

---

# EPIC B — Schedule of Record  *(P1 · resolves #4, #13)*

## B1 — Manage Phases, Milestones, Activities — ✅ Verified
- **User story:** Organize schedule as Phase→Milestone→Activity→Sub-activity w/ weights so progress rolls up automatically.
- **Requirements:** Exactly ONE nesting level (Instagantt parity). Weights within a parent should sum to 100 (warn, don't block). Rollup `Activity%→Milestone%→Phase%→Project%` weighted average, **same DB transaction as mutation** (`lib/projects/rollup.ts::recalcActivityAndAncestors()`). Activity fields per spec table. 6-value status enum w/ exact colors. Planned% from baseline dates. Sub-activities → parent `percentComplete` read-only/derived.
- **Acceptance criteria:** weights 2/1 with 100%/0% → milestone 66.7%; update % → milestone/phase/project recompute in same txn; non-100 weights → non-blocking warning badge; activity w/ subtasks → % read-only; `currentEnd<currentStart` → blocked.
- **UI/UX:** 6 statuses render exact colors (NOT_STARTED grey `#E5E5EA` · STARTED `#A8D0F0` · FINISHED `#4A90D9` · APPROVAL_REQUESTED `#F5D547` · APPROVED `#5CB85C` · REJECTED `#F0932B`) via named `project-status-*` tokens.
- **DoD:** full CRUD (withAuth) · rollup in same txn · 6 colors exact · weight-mismatch warning · ActivityLog on every status change.
- **Files:** `app/api/projects/[id]/{route,phases,phases/[phaseId],milestones,milestones/[milestoneId],activities,activities/[activityId]}/route.ts`, `lib/projects/rollup.ts`, `lib/projects/access.ts`, `features/projects/components/ScheduleTree.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`
- **Status note:** CRUD + same-txn rollup + weight warning + status colors + audit all shipped & verified. Baseline-date immutability + slip-reason gate on activity PATCH are wired (Invariants #1/#2); the DelayEvent side-effect lands in C4.

## B2 — Project Confidence Score — 🟩 Done
- **User story:** 0–100 confidence so "80% done but 40 days late w/ 6 risks" isn't shown healthy.
- **Requirements:** `confidence = 100 - penalties` clamped 0..100 (schedule variance ×1.5, slip min(30,×0.5), risk ×5, blocked ×3, approval min(20,×0.4), staleness 10 if >7d). RAG derivation (GREEN ≥75 & spi≥0.95; AMBER 50–74 or spi 0.85–0.94; RED <50 or spi<0.85). Mirrors `lib/confidence-calc.ts`.
- **Acceptance criteria:** worked example ≈57.5 → AMBER; confidence<50 → RAG RED + `PROJECT_WENT_RED` notification (PM+CEO); nightly cron recomputes all active projects.
- **UI/UX:** shown on C24 ring + portfolio cards.
- **DoD:** `lib/projects/confidence.ts` + unit tests per penalty · cron `/api/cron/project-health` · RAG change → notification · displayed on C24 + portfolio.
- **Files:** `lib/projects/confidence.ts` (+ `confidence.test.ts`), `lib/projects/health.ts`, `lib/projects/evm.ts`, `app/api/cron/project-health/route.ts`
- **Status note:** compute + RAG + EVM + nightly cron + RAG-change/went-RED notifications shipped; confidence/SPI surfaced on the project detail StatCards. C24 ring is the P7 charts phase.

---

# EPIC C — Baselines & The Delay Ledger ⭐ CORE  *(P2 · resolves #1, #2, #5, #7, #25)*

## C1 — Commit Baseline — ✅ Verified
- **User story:** Freeze agreed schedule at kickoff so every later change is measurable variance, not a silent edit.
- **Requirements:** While `baselineCommittedAt=null` show warning banner; delay tracking inactive (`slipDays=0`). On commit: copy `current*→baseline*` for every Activity/Milestone/Phase; set `baselineCommittedAt=now`, `baselineVersion=1`; write `BaselineSnapshot` (full JSON). **Baseline fields immutable after commit** — server-side guard, no API path edits them except C2.
- **Acceptance criteria:** uncommitted → banner + slipDays always 0; commit → all `baseline*`=`current*` + snapshot v1; any API write to `baselineStart` → **403**; `ActivityLog` `baseline_committed` with actor.
- **UI/UX:** amber banner + confirm modal ("N activities will be baselined", optional notes).
- **DoD:** `POST /api/projects/[id]/baseline` · server-side write guard on baseline fields · snapshot full JSON · banner show/hide · transaction-safe across all activities.
- **Done (2026-07-13, Task 2.1):** `lib/projects/baseline.ts` (`commitBaseline` in-txn + pure `hasBaselineFieldWrite` guard); `POST /api/projects/[id]/baseline` (409 if already committed; audit `BASELINE_COMMITTED` + `PROJECT_BASELINE_COMMITTED` emit **post-commit**); 403 guard wired into all four schedule PATCH routes (project/phase/milestone/activity); amber banner now has a "Commit Baseline →" `ConfirmDialog` (activity count, bullets, optional notes textarea) gated on `canEdit`; 5 unit tests; E2E `scripts/verify-c1.ts` (7 phases/9 milestones/24 activities baselined, snapshot v1, slipDays 0→10 after date move) passes; tsc clean; HTTP smoke (route compiles, 401 unauth).
- **Files:** `lib/projects/baseline.ts`, `lib/projects/baseline.test.ts`, `app/api/projects/[id]/baseline/route.ts`, `app/api/projects/[id]/{route,phases/[phaseId]/route,milestones/[milestoneId]/route,activities/[activityId]/route}.ts` (guard), `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts` (`useCommitBaseline`), `scripts/verify-c1.ts`

## C2 — Re-Baseline (Formal Revision) — ✅ Verified
- **User story:** Re-baselining is formal, logged, reason-required so schedules can't be quietly rewritten.
- **Requirements:** Modal requires reason (≥20 chars), approver (default CEO/Exec), diff preview (old→new per activity). `baselineVersion` increments; new snapshot; **previous baseline preserved** (never overwritten). Reports can still show variance vs **v1**.
- **Acceptance criteria:** re-baseline → version++ + new snapshot + prior retained; reason <20 chars → blocked; reports show variance vs v1.
- **UI/UX:** diff table; approver picker.
- **DoD:** multiple versions retained · reports select version (default v1 for client) · accurate diff · ActivityLog + CEO notification.
- **Done (2026-07-13, Task 2.2):** `lib/projects/baseline.ts` gained `rebaseline()` (in-txn: version++, current→baseline copy, NEW snapshot — prior untouched), pure `computeRebaselineDiff()` + `datesEqual()`; `app/api/projects/[id]/baseline/rebaseline/route.ts` — GET diff preview (readable) + POST (writable, Zod reason ≥20, approver defaults to first EXECUTIVE else actor; audit `REBASELINED` + `PROJECT_REBASELINED` emit **post-commit**); UI: "Baseline vN" pill + "Re-Baseline" button on the detail page opening a `ConfirmDialog` with diff preview list, reason textarea (live n/20 counter, confirm disabled <20), approver select (`useUsersForSelection` EXECUTIVE/ADMIN); hooks `useRebaselineDiff`/`useRebaseline`; 4 new unit tests; E2E `scripts/verify-c2.ts` (v1+v2 retained, v1 original dates intact, guard throws when uncommitted) passes. Report-version *selector* UI is a P7 concern (snapshots are queryable per version; v1 is the honest default).
- **Files:** `lib/projects/baseline.ts`, `lib/projects/baseline.test.ts`, `app/api/projects/[id]/baseline/rebaseline/route.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `scripts/verify-c2.ts`

## C3 — The Approval Clock ⭐ — ✅ Verified
- **User story:** Auto-start a clock when a deliverable is sent for client approval, stop on response, so client delay accrues as timestamped fact.
- **Requirements:** On `→APPROVAL_REQUESTED`: `waitingSince=now`, force `ownerParty=CLIENT`, notify client+PM. On `→APPROVED|REJECTED`: `daysWaited=businessDaysBetween(...)`, create `DelayEvent(APPROVAL_WAIT, owner=CLIENT, reason=CLIENT_APPROVAL_DELAY, isAutoDetected=true, phaseAtTime)`; if over SLA → `ApprovalSlaBreach` + `obligation.breachCount++`; clear `waitingSince`. **Business days** (configurable holidays). Clock automatic. Escalations at SLA/+3/+7.
- **Acceptance criteria:** set REQUESTED Mon → waitingSince=Mon, owner=CLIENT; approve +5 business days → DelayEvent daysLost=5; SLA 3, took 5 → breach daysOverSla=2 + breachCount++; +3 past SLA → escalation; REJECTED still records; weekend not counted.
- **UI/UX:** live "days waiting" counter in T3 + on Gantt yellow bar.
- **DoD:** `lib/projects/delay-ledger.ts::onStatusChange()` all transitions · business-day calc w/ holidays · auto DelayEvent · ApprovalSlaBreach · escalations SLA/+3/+7 · unit tests (weekend, breach, rejection) · live counter.
- **Progress (2026-07-13, core slice + review fix):** core state machine DONE — `lib/projects/delay-ledger.ts` (`decideApprovalClockTransition` pure + `applyApprovalClock` in-txn persistence) wired into the activity PATCH route (audit actions `APPROVAL_REQUESTED`/`APPROVAL_RESOLVED`); 8 unit tests (weekend-spanning, SLA breach daysOverSla=2, REJECTED path, no-op transitions) green via `npm run test:projects` (42 total); `tsc --noEmit` clean. **Review fix (Task 2.0):** `applyApprovalClock` no longer calls `emit()` inside the transaction — it returns notification intents (`ApprovalClockResult.notifications`) and the route fires them post-commit (Standing Rule #1). **Remaining DoD items ship in later tasks:** SLA/+3/+7 escalation cron ✅ (Task 2.5, `app/api/cron/approval-clock` + `lib/projects/approval-escalations.ts`, deduped via `Activity.approvalEscalationLevel`) and the live T3 "days waiting" counter (P3 UI).
- **Files:** `lib/projects/delay-ledger.ts`, `lib/projects/delay-ledger.test.ts`, `lib/projects/business-days.ts` (reused), `app/api/projects/[id]/activities/[activityId]/route.ts`

## C4 — Slip Reason & Owner Attribution — ✅ Verified
- **User story:** Be forced to record why + whose fault whenever a baselined date moves, to prove statistically where delays come from.
- **Requirements:** On any date change on a **baselined** project (drag or edit), modal fires; **change not saved until reason+owner provided**. Reason taxonomy (9) auto-suggests owner (overridable). No modal pre-baseline. Creates `DelayEvent` w/ `phaseAtTime`. Cancel → Gantt bar snaps back. Recompute `slipDays` + roll to project.
- **Acceptance criteria:** baselined + move date → modal gates save; non-baselined → free edit; SCOPE_ADDITION → owner CLIENT (override to SHARED allowed); record → DelayEvent w/ phase; cancel → revert.
- **UI/UX:** modal shows activity, baseline end, new end (+N days), owner radio, reason select, detail.
- **DoD:** hard gate (no write w/o reason) · bar reverts on cancel · DelayEvent w/ phase context · reason→owner suggestion + override · slipDays recomputed + rolled up.
- **Done (2026-07-13, Task 2.3):** `lib/projects/delay-ledger.ts` gained `recordSlipDelayEvent()` (in-txn `DelayEvent{BASELINE_SLIP, owner, reason, reasonDetail, phaseAtTime, daysLost=slip increase ≥0, isAutoDetected:false, startedAt=baselineEnd, endedAt=newEnd}`) + pure `computeSlipDaysLost()`; activity PATCH creates the event inside the existing txn when the C4 gate passes (new optional `slipDetail` field); `recalcProjectRollup` recomputes `slipDays` in the same txn. UI: `ScheduleTree` activity rows gained start/end date inputs (read-only date text for viewers); on a **baselined** project any date move opens `SlipReasonDialog` (baseline end vs new end with ±Nd delta, owner radio, 9-reason select with `SLIP_REASON_OWNER` auto-suggest — overridable, optional detail; Cancel = no write, input reverts since it's data-bound); non-baselined projects edit freely with no modal and no event. 2 new unit tests; E2E `scripts/verify-c4.ts` (free edit pre-baseline, gated +10d move → event with phase, incremental daysLost, earlier move → 0, 3 events) passes. Gantt bar snap-back remains a P3 concern (tree input reverts via data binding).
- **Files:** `lib/projects/delay-ledger.ts`, `lib/projects/delay-ledger.test.ts`, `app/api/projects/[id]/activities/[activityId]/route.ts`, `features/projects/components/ScheduleTree.tsx`, `scripts/verify-c4.ts`

## C5 — Delay Ledger Table (T1) — ✅ Verified
- **User story:** One table of every delay w/ owner/reason/days to answer "why are we late?" in one screen (also shown to client).
- **Requirements:** Columns: Activity · Phase · Baseline date · Current date · Slip days · Reason · Owner · SLA breach flag · Recovery plan/owner/date. Header totals split by owner (server-computed). Filters (owner/reason/phase). CSV+PDF export (visible/filtered rows). Recovery plan inline editable. >7d w/o recovery plan → warning icon.
- **Acceptance criteria:** header totals split by owner arithmetically correct; filter owner=CLIENT → only client rows + totals update; SLA breach → red badge days-over; export contains filtered rows; >7d no-recovery → warning.
- **UI/UX:** table w/ owner-colored totals (🔴 client / 🔵 360G).
- **DoD:** sort/filter/export · totals server-side · SLA badges · inline recovery · rendered PM view AND portal.
- **Done (2026-07-13, Task 2.4 + PDF closeout):** `listDelayLedger()` + pure `computeDelayOwnerTotals()`/`delaysToCsv()` in `lib/projects/delay-ledger.ts` (totals computed server-side over the FILTERED set; facets unfiltered so dropdowns stay stable; SLA breach days mapped per activity from `ApprovalSlaBreach`); `GET+PATCH /api/projects/[id]/delays` (GET: readable scope, owner/reason/phase filters; PATCH: recovery plan/owner/date with inline change-map audit `PROJECT_DELAY_EVENT`); `DelayLedgerTable.tsx` (`@tanstack/react-table` — columns Activity(auto badge + >7d-no-recovery warning)/Phase/Baseline/Current/Slip/Reason(label)/Owner(tone-colored)/SLA(red +Nd-over badge)/Recovery(inline plan+owner+date editor); owner-colored header totals; 3 filter selects; CSV export of the visible rows; **PDF export** of the same filtered rows via the shared Puppeteer browser pool); section added to the project detail page; hooks `useDelayLedger`/`useUpdateDelayRecovery`; 5 new unit tests (totals arithmetic, empty/unknown owner, CSV rows/escaping/nulls); E2E `scripts/verify-c5.ts` (real APPROVAL_WAIT+SLA-breach and BASELINE_SLIP events → totals 10/10, filters, facets, CSV) passes. Deferred: portal rendering (P5).
- **Files:** `lib/projects/delay-ledger.ts`, `lib/projects/delay-ledger.test.ts`, `lib/projects/delay-ledger-pdf.ts`, `lib/letter-pdf-puppeteer.ts`, `app/api/projects/[id]/delays/route.ts`, `app/api/projects/[id]/delays/pdf/route.ts`, `features/projects/components/DelayLedgerTable.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/index.ts`, `scripts/verify-c5.ts`

---

# EPIC D — Gantt Chart (Instagantt Parity)  *(P3 · resolves #4, #19)*
> Custom React component. **Do NOT use `dhtmlx-gantt`.** New dep: `@tanstack/react-virtual`.

## D1 — Gantt Layout & Structure — 🟩 Done
- **Requirements:** Split pane (resizable divider, persisted per user; synced vertical scroll). Configurable left columns (Assignee/EH/Start/Due/Status/Priority/Risk/%/Owner). Row types Phase(summary)/Milestone/Activity/Sub-activity. Collapse/expand per-row + global. Live search filter. Today marker (red line + red header day). Two-row timeline header (month/year + day, week numbers). Scales Days/Weeks/Months/Quarters/Years. Zoom ±%. Minimap. Sort by Date/Name/Status/Priority. **Row virtualization** (500 activities @ 60fps).
- **Acceptance criteria:** panes scroll in sync; divider resizes + persists; collapse hides children keep summary; today red line correct x; scale change re-renders proportional; 200+ activities virtualize @ 60fps.
- **DoD:** custom Gantt (no dhtmlx) · virtualized rows · synced scroll + resizable divider (persisted) · all 5 scales · minimap · 500 activities @ 60fps.
- **Done (2026-07-13, Task 3.1):** Installed the approved `@tanstack/react-virtual` dependency after confirming the only existing Gantt is the older `/dashboard/plans` `dhtmlx-gantt` view. Added a custom PM-module Gantt above the schedule tree: virtualized rows using one scroll surface for left/right vertical sync; resizable left pane persisted to `localStorage`; configurable persisted columns; phase/milestone/activity/sub-activity rows; per-row and global expand/collapse; search with ancestor retention; sort by schedule/date/name/status/priority; two-row timeline header; all 5 scales (Days/Weeks/Months/Quarters/Years); zoom; today marker; minimap viewport indicator. D2 bars/baseline overlays, D3 drag/dependencies, D4 export toolbar, and F1 detail-panel interactions are intentionally deferred.
- **Files:** `features/projects/components/gantt/GanttChart.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/index.ts`, `package.json`, `package-lock.json`

## D2 — Bars, Baseline Overlay & Colors — 🟩 Done
- **Requirements:** Actual bar = status color; baseline ghost `#D1D1D6@40%` 4px below when baselined; progress fill (darker) to `percentComplete`%; milestone diamond ◆ at `currentEnd` when `isMilestone`; phase summary bar auto-spans children (not draggable); RAG red tint on RED activities; ⏱ badge + days-waiting on yellow (APPROVAL_REQUESTED) bars.
- **Acceptance criteria:** slipped 14d → ghost ends 14d before actual; 60% → 60% fill; milestone → diamond; phase → auto-span, not draggable; APPROVAL_REQUESTED → yellow + ⏱ badge.
- **DoD:** ghost bar · 6 colors exact · progress fill · diamonds · phase auto-span · approval badge.
- **Done (2026-07-13, Task 3.2):** Gantt timeline rows now render actual schedule bars and baseline ghost bars from separate current/baseline spans. Activity/status bars use the existing exact `project-status-*` Tailwind tokens; baseline ghosts use `project-baseline` with 40% opacity and sit below actual bars; progress fill overlays `percentComplete`; milestone rows and `Activity.isMilestone` render as diamonds; phase rows auto-span min child start → max child end with bracket ends and are visually non-draggable; `APPROVAL_REQUESTED` bars show a clock badge with live business-days-waiting via `businessDaysBetween()`. High-risk rows get a subtle danger ring as the D2 red-tint signal. D3 drag/resize/dependencies remain intentionally unstarted.
- **Files:** `features/projects/components/gantt/GanttChart.tsx`

## D3 — Drag, Resize & Dependency Auto-Shift — 🟩 Done
- **Requirements:** Drag bar (move both), drag edges (resize start/end). Drop on baselined → C4 modal; cancel → snap back (incl cascaded). FS successors shift by delta, transitively. Draw dependency via hover handles; delete via click+confirm. Cycle detection blocks. Live tooltip w/ new dates. All 4 dep types (FS default).
- **Acceptance criteria:** drag A → FS successor B shifts same; chain A→B→C transitive; baselined drop → C4 before persist; cancel → all reverts; cycle → blocked w/ message; live tooltip.
- **DoD:** `lib/projects/scheduling.ts::shiftSuccessors()` + cycle detection · drag/resize + tooltip · reason gate · full revert · dep draw/delete · 4 types.
- **Done (2026-07-13, Task 3.3):** Added pure scheduling helpers in `lib/projects/scheduling.ts`: `shiftSuccessors()` cascades transitive successor shifts, `wouldCreateDependencyCycle()`/`assertNoDependencyCycle()` block circular dependencies, and `criticalPath()` computes a CPM-style longest dependency path. Added 6 node:test cases for date shifting, inclusive duration, direct/transitive shifts, cycle blocking, and critical path. Backend: project detail now serializes `ActivityDependency[]`; `POST/GET /api/projects/[id]/dependencies` creates/reads dependencies with Zod + cycle check; `DELETE /api/projects/[id]/dependencies/[dependencyId]` removes links; `PATCH /api/projects/[id]/activities/schedule` applies drag/resize updates and cascaded successor shifts in one transaction, runs C4 slip attribution for baselined projects, and runs `recalcProjectRollup()` in that transaction. UI: Gantt bars drag horizontally, resize from left/right edges, show a live date tooltip, gate baselined drops behind the C4 reason/owner modal, clear preview on cancel, render dependency arrows, create links via connector handles with FS/SS/FF/SF type selector, and delete arrows through a confirm dialog.
- **Files:** `lib/projects/scheduling.ts`, `lib/projects/scheduling.test.ts`, `app/api/projects/[id]/route.ts`, `app/api/projects/[id]/activities/schedule/route.ts`, `app/api/projects/[id]/dependencies/route.ts`, `app/api/projects/[id]/dependencies/[dependencyId]/route.ts`, `features/projects/components/gantt/GanttChart.tsx`, `features/projects/hooks/useProject.ts`

## D4 — Gantt Toolbar — 🟩 Done
- **Requirements:** Export&Share (PDF/PNG/CSV/MSProject XML/Share to portal); Baselines (show/hide, version select, commit, re-baseline); Options (deps/progress/critical path/weekends/today); Columns (toggle, persisted per user); Segments (group by Phase/Assignee/Status/Owner); Undo; Critical Path (CPM); Duplicate; Legend; Comments toggle; Minimap toggle; AI Assistant (J6); Sort; Scale.
- **Acceptance criteria:** hide baselines → ghosts gone; critical path → red zero-float path; toggle column persists; export PDF → print-ready w/ header; scale panel matches Image 5.
- **DoD:** all dropdowns functional · CPM forward/backward pass · PDF/PNG/CSV/MSProject export · column prefs persisted · scale panel parity.
- **Done (2026-07-14, Task 3.4):** Reworked the custom Gantt toolbar into grouped controls without replacing D1–D3 scheduling. Export dropdown downloads auth-scoped PDF/PNG/CSV/MS Project XML from `GET /api/projects/[id]/gantt/export`; PDF/PNG reuse the shared Puppeteer browser pool (`renderHtmlToPdf` + new `renderHtmlToPng`) and include a project header. Baseline dropdown toggles ghost bars, selects baseline version for exports, and exposes commit/re-baseline actions. Options toggle dependencies, progress fill, critical path, weekend shading, and today marker. Columns now include Assignee, EH, Start, Due, Status, Priority, Risk, %, Owner Party, Slip Days and persist in `localStorage`; Segments order activities by Phase/Assignee/Status/Owner within the existing hierarchy. Toolbar also adds undo-last-schedule-change, duplicate selected activity, legend, comments badges, minimap toggle, sort/scale/zoom controls, and the J6 AI Assistant placeholder. Critical path uses `criticalPath()` from `lib/projects/scheduling.ts` and highlights dated activities in red.
- **Files:** `features/projects/components/gantt/GanttChart.tsx`, `app/api/projects/[id]/gantt/export/route.ts`, `lib/letter-pdf-puppeteer.ts`

---

# EPIC E — View Toggles  *(P3 · resolves #16, #4)*

## E1 — View Switcher — 🟩 Done
- **Requirements:** 6 views (Gantt default · Table inline-edit/bulk · Board kanban 6 status cols, drag=status change fires C3 · Workload people×weeks heatmap across ALL projects · Mindmap radial `reactflow` · Overview C24 ring + KPIs + charts + registers). Active filter/search persists across views (Zustand).
- **Acceptance criteria:** filter persists across switch; board drag Finished→ApprovalRequested → clock starts + client notified; workload >100% → red; overview → C24 Expected vs Actual.
- **DoD:** 6 views · filters persist · board drag = real transition w/ side effects · workload across all projects · overview parity (Images 3+9).
- **Done (2026-07-14, Task 3.5):** Added a persisted E1 view layer around the custom Gantt. `ProjectViewSwitcher` provides the six required tabs: Gantt (D1–D4 surface), Table (`@tanstack/react-table` with sort, inline status/% edits, bulk status), Board (six status columns; drag/drop calls the existing activity PATCH so C3 approval-clock notifications still fire post-commit), Workload (people×weeks heatmap from all readable active projects via `GET /api/projects/workload`, >100% red), Mindmap (`reactflow` radial Project→Phase→Milestone→Activity), and Overview (C24-style actual completion ring with Expected vs Actual, KPI cards, risk/approval/slip registers). Shared search/status filters and active view persist through Zustand and apply across views.
- **Files:** `features/projects/components/views/ProjectViewSwitcher.tsx`, `lib/stores/project-view-store.ts`, `app/api/projects/workload/route.ts`, `features/projects/hooks/useProject.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/index.ts`

---

# EPIC F — Activity Detail Panel & Comments  *(P3 · resolves #3, #19)*

## F1 — Activity Detail Panel — 🟩 Done
- **Requirements:** Right side panel (reuse `SideDrawer`) w/ all fields, subtasks, comment thread (Image 2 parity) + 3 additions: Owner Party radio, approval-clock banner (live business-days + SLA breach), visibility toggles. 7 header actions: Mark done (→FINISHED,100%), Outdent, Indent, Convert to Milestone, Color, Delete, Close. Optimistic save + undo toast.
- **Acceptance criteria:** click bar → panel w/ fields; APPROVAL_REQUESTED → live clock banner + SLA breach red; Indent → becomes sub-activity, Gantt re-renders; ◇ → diamond; status→APPROVAL_REQUESTED → clock + client notified; edit → optimistic save + undo.
- **DoD:** panel layout + 3 additions · 7 actions · indent/outdent restructures · live clock banner · optimistic save + undo.
- **Done (2026-07-14, Task 3.6):** Added `ActivityDetailPanel` as a `SideDrawer` launched from Gantt bars plus E1 Table rows and Board cards. Panel includes the 7 header actions (mark done, outdent, indent, milestone toggle, color, delete, close), editable title/description/assignee/dates/status/%/owner party/effort/cost/priority/risk, subtasks with add-subtask, comment-thread shell with INTERNAL/CLIENT_VISIBLE visibility choice, undo toast on saves, and live approval-clock banner with SLA breach styling. Baselined date edits reuse the C4 slip reason/owner modal before calling the existing activity PATCH route. Backend PATCH now accepts validated `parentActivityId` changes for one-level indent/outdent and still runs rollup in the mutation transaction.
- **Files:** `features/projects/components/activity/ActivityDetailPanel.tsx`, `features/projects/components/views/ProjectViewSwitcher.tsx`, `features/projects/components/gantt/GanttChart.tsx`, `app/api/projects/[id]/activities/[activityId]/route.ts`, `features/projects/hooks/useProject.ts`, `features/projects/index.ts`

## F2 — Comments w/ Internal/Client Visibility ⭐ — 🟩 Done
- **Requirements:** Each comment INTERNAL|CLIENT_VISIBLE (**default INTERNAL**). INTERNAL physically absent from portal API (SQL `WHERE visibility='CLIENT_VISIBLE'`, not CSS). Client comments → `isClientAuthor=true` + distinct badge. @mention → notification. Same rule for attachments.
- **Acceptance criteria:** INTERNAL never in portal raw JSON; CLIENT_VISIBLE shows; client comment → isClientAuthor + badge; @mention → notification; default INTERNAL.
- **DoD:** visibility field default INTERNAL · portal serializer filters at query level · same for attachments · @mention notifications · client-authored distinct.
- **Done (2026-07-14, Task 3.7):** Added `ActivityComment` list/create/update/delete APIs under the activity route. Comment creation defaults to `INTERNAL`, stores mention ids, records project activity, and emits `USER_MENTIONED` after the DB write. `ActivityDetailPanel` now loads the real threaded comment stream, uses the existing TipTap mention editor, supports replies, visibility toggles, client-author badges, and default-internal posting. Shared `lib/projects/activity-comments.ts` owns the SQL-level `visibility='CLIENT_VISIBLE'` Prisma filters for portal comment and attachment reads and anonymizes authors for future portal serializers.
- **Files:** `features/projects/components/activity/ActivityDetailPanel.tsx`, `features/projects/hooks/useProject.ts`, `lib/projects/activity-comments.ts`, `lib/projects/activity-comments.test.ts`, `app/api/projects/[id]/activities/[activityId]/comments/route.ts`, `app/api/projects/[id]/activities/[activityId]/comments/[commentId]/route.ts`, `lib/notifications/deep-link.ts`

---

# EPIC G — Jira Integration (Optional)  *(P6 · resolves #8–#12)*

## 6.1 — Jira Token Crypto Utility — 🟩 Done
- **Requirements:** `lib/projects/jira-crypto.ts` using Node built-in `crypto` only; AES-256-GCM; key from env; token is write-only and never returned by future APIs.
- **Done (2026-07-14, Task 6.1):** Added a strict AES-256-GCM helper with versioned ciphertext (`v1:iv:authTag:ciphertext`), 12-byte random IVs, authenticated data, and `JIRA_TOKEN_ENCRYPTION_KEY` parsing for 32-byte base64/base64-prefixed/hex keys. Added node:test coverage for round-trip encryption, plaintext absence, randomized ciphertext, tamper/wrong-key rejection, env key parsing, and bad-key rejection.
- **Files:** `lib/projects/jira-crypto.ts`, `lib/projects/jira-crypto.test.ts`

## G1 — Connect Jira — 🟩 Done
- **Requirements:** Project Settings→Integrations. Fields: site URL, email, API token (write-only), project key. Token **AES-256 at rest**, never returned. Test Connection calls `GET /rest/api/3/myself`. Error mapping 401/403/404/429.
- **Acceptance criteria:** valid → confirm + counts; invalid → clear error; save → encrypted + `jiraLinked=true`; view later → `••••`, never sent to client.
- **DoD:** AES-256 at rest · token never in response · test endpoint · error mapping.
- **Done (2026-07-14, Task 6.2):** Added Project Settings → Integrations Jira panel with Site URL, email, write-only API token, project key, Test Connection, Save, and masked saved-token state. Added scoped Jira APIs: `GET/POST /api/projects/[id]/jira` returns only safe metadata and saves encrypted tokens; `POST /api/projects/[id]/jira/test` validates credentials against Jira. Save tests credentials first, encrypts the token with 6.1 AES-256-GCM, links `Project.jiraConnectionId`, and sets `project.jiraLinked=true` in one transaction; audit logs after commit. Jira status mapping covers 401/403/404/429.
- **Files:** `features/projects/services/jira/connection.ts`, `lib/projects/jira-connection.test.ts`, `app/api/projects/[id]/jira/route.ts`, `app/api/projects/[id]/jira/test/route.ts`, `features/projects/components/integrations/JiraIntegrationPanel.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/index.ts`

## G2 — Sync Engine — 🟩 Done
- **Requirements:** Pull issues (JQL search), sprints, worklogs, changelogs. Cron 30min + manual "Sync Now". Incremental (`updated >= -35m`). Rate-limit aware (10 req/s) + exponential backoff. `JiraSyncLog` per run. Email→User resolution. Graceful degradation (project works w/o Jira).
- **Acceptance criteria:** cron → all connections sync + log each; 429 → backoff + PARTIAL; email matches User → assigneeUserId resolves; failure → PM banner; unreachable → project fully functional on Layer 1.
- **DoD:** 4 endpoints · incremental · rate-limit/backoff · email→User · JiraSyncLog every run · failure never breaks page.
- **Done (2026-07-14, Task 6.3):** Added Jira sync service consuming the four required Jira endpoints: search issues, board/sprints, issue worklogs, and issue changelog. Sync uses incremental JQL (`updated >= -35m`), serialized 10 req/sec throttling, exponential 429 backoff, email→User assignee resolution, issue/sprint upserts, and fetched issue worklog/transition replacement to avoid duplicates. Added cron route `app/api/cron/jira-sync` and manual project route `POST /api/projects/[id]/jira/sync`; every connection run writes `JiraSyncLog` and updates `lastSyncStatus`. The Jira panel now shows failed/partial sync banners without breaking the project page.
- **Files:** `features/projects/services/jira/sync.ts`, `lib/projects/jira-sync.test.ts`, `app/api/cron/jira-sync/route.ts`, `app/api/projects/[id]/jira/sync/route.ts`, `features/projects/components/integrations/JiraIntegrationPanel.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/services/jira/connection.ts`, `app/api/projects/[id]/jira/route.ts`

## G3 — Map Jira Issues to Activities — 🟩 Done
- **Requirements:** Map by Epic/Label/Component/Sprint/Manual. Auto-rollup `% = doneIssues/totalIssues×100` (or story-point weighted) when `jiraAutoRollup`. Manual override wins (turns auto off).
- **Acceptance criteria:** map Epic + auto → 6/10 done → 60%; manual set → auto off, manual persists; no mapping → 100% manual.
- **DoD:** 5 mapping types · auto-rollup on sync · manual wins · mapping UI w/ live preview.
- **Done (2026-07-14, Task 6.4):** Added typed Jira mappings using the existing `Activity.jiraIssueKeys` storage (`MANUAL`, `EPIC`, `LABEL`, `COMPONENT`, `SPRINT`) plus `jiraAutoRollup`. Jira sync now applies auto-rollups after issue ingestion in a Prisma transaction, using story-point weighting when present and issue-count percentage otherwise, then recalculates project rollup in that same transaction. Manual `percentComplete` edits turn auto-rollup off so manual wins. The activity detail panel now exposes Jira mapping controls with live preview from a scoped project API.
- **Files:** `features/projects/services/jira/rollup.ts`, `lib/projects/jira-rollup.test.ts`, `features/projects/services/jira/sync.ts`, `app/api/projects/[id]/jira/mapping-preview/route.ts`, `app/api/projects/[id]/activities/[activityId]/route.ts`, `features/projects/components/activity/ActivityDetailPanel.tsx`, `features/projects/hooks/useProject.ts`

## G4 — Idle Days & Estimate Accuracy ⭐ — 🟩 Done
- **Requirements:** Idle day = working day w/ no transition AND no worklog AND no comment. Estimate accuracy `actual/estimated`; bias = median across issues. Exclude weekends/holidays.
- **Acceptance criteria:** no activity Mon–Wed → 3 idle; 8h→12h → accuracy 1.5; median 1.4/20 → "systematically underestimates"; weekends excluded.
- **DoD:** idle via transitions+worklogs+comments · working-day calendar · accuracy per issue + median per person · feeds R3 + Performance module.
- **Done (2026-07-14, Task 6.5):** Added `features/projects/services/jira/metrics.ts` for G4 developer evidence: working-day idle detection, estimate accuracy per issue, median estimate bias per developer, and systematic under/over-estimation flags. The pure metrics layer accepts transition/worklog/comment events and is tested against the exact spec examples; the DB-backed report uses synced transitions, worklogs, and Jira issue `lastActivityAt`/`jiraUpdatedAt` as the current comment/update signal because G2 did not persist separate Jira comment rows. Added scoped `GET /api/projects/[id]/jira/metrics`, surfaced metrics in the Jira integration panel, and exposed the same service through `lib/performance/project-jira-metrics.ts` for Performance/R3 reuse. Non-Jira projects return `jiraLinked=false` and no rows.
- **Files:** `features/projects/services/jira/metrics.ts`, `lib/projects/jira-metrics.test.ts`, `app/api/projects/[id]/jira/metrics/route.ts`, `lib/performance/project-jira-metrics.ts`, `features/projects/components/integrations/JiraIntegrationPanel.tsx`, `features/projects/hooks/useProject.ts`

## G5 — Jira Adoption Score — 🟩 Done
- **Requirements:** Weighted avg (assignee 25% / estimate 25% / updated<3d 25% / story points 25%). <60% → warning banner on reports.
- **Acceptance criteria:** worked example → 67.5%; <60% → warning banner.
- **DoD:** per project + team · warning banner <60% · shown in R4.
- **Done (2026-07-14, Task 6.6):** Added `features/projects/services/jira/adoption.ts` for project and team Jira data-quality scoring. It computes assignee coverage, original-estimate coverage, updated-within-3-days coverage, and story-point coverage when story points are in use; the build-spec worked example returns 67.5%. Scores below 60 raise the required warning, now surfaced in the Jira integration panel. Added scoped `GET /api/projects/[id]/jira/adoption` and `lib/performance/project-jira-adoption.ts` for R4/Performance reuse.
- **Files:** `features/projects/services/jira/adoption.ts`, `lib/projects/jira-adoption.test.ts`, `app/api/projects/[id]/jira/adoption/route.ts`, `lib/performance/project-jira-adoption.ts`, `features/projects/components/integrations/JiraIntegrationPanel.tsx`, `features/projects/hooks/useProject.ts`

## G6 — Scrum Attendance Log ⭐ — 🟩 Done
- **Requirements:** Quick-log widget (date, time held, duration, facilitator, attendees/absentees/late, blockers). Unique on `projectId+scrumDate` (re-log edits). R5 report + C16 heatmap. Attendance % per person; <70% flagged.
- **Acceptance criteria:** log → stored w/ date/time; report → totals + per-person rate + team rate; <70% flagged in R5; re-log edits existing.
- **DoD:** widget · R5 + C16 · attendance % per person · feeds Performance module.
- **Done (2026-07-14, Task 6.6):** Added `features/projects/services/scrum-attendance.ts` for attendance-rate computation, per-person <70% flags, and team attendance rate. Added scoped `GET/POST /api/projects/[id]/scrum-log`; POST upserts by the existing unique `projectId+scrumDate` key so re-logging edits the record, then audits after persistence. Added `ScrumLogWidget` to the project page with date/time/duration/facilitator, In/Late/Out controls for project people, blockers/notes, an R5-style attendance report table, and a compact C16 people-by-date heatmap. Added `lib/performance/project-scrum-attendance.ts` for Performance accountability reuse.
- **Files:** `features/projects/services/scrum-attendance.ts`, `lib/projects/scrum-attendance.test.ts`, `app/api/projects/[id]/scrum-log/route.ts`, `features/projects/components/ScrumLogWidget.tsx`, `lib/performance/project-scrum-attendance.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`

---

# EPIC H — Governance Registers  *(P4 · resolves #6, #17, #18, #21, #22, #23)*

## H1 — RAID Log — 🟩 Done
- **Requirements:** 4 tabs (Risks/Assumptions/Issues/Dependencies), type-specific fields (§3.3). 5×5 risk matrix (P×I, dots colored by score: 1–6 green/8–12 amber/15–25 red). `daysOpen` auto-computed. `clientVisible` controls portal. High risks feed B2 confidence penalty. Dependency past `neededByDate` → red + can generate DelayEvent.
- **Acceptance criteria:** P4×I5 → score 20, red zone; issue open 15d → daysOpen shows; overdue client dependency → red + DelayEvent; clientVisible → portal; high risks penalize confidence.
- **DoD:** 4 types w/ fields · 5×5 matrix · daysOpen auto · client visibility respected · high risks → confidence penalty.
- **Done (2026-07-14, Task 4.1):** Added RAID CRUD APIs with score/days-open serialization, query-level `clientVisible` portal filter helper, high-risk notification, and health recompute so open red risks immediately penalize confidence. Added explicit overdue-client-dependency delay action that creates a `BLOCKED` `DelayEvent` with reason `CLIENT_DEPENDENCY_NOT_PROVIDED`. Added `RaidRegister` on project detail with four tabs, type-specific create fields, 5×5 risk matrix, status/client-visible controls, red overdue dependency flag, and delay-generation action.
- **Files:** `lib/projects/raid.ts`, `lib/projects/raid.test.ts`, `app/api/projects/[id]/raid/route.ts`, `app/api/projects/[id]/raid/[raidId]/route.ts`, `app/api/projects/[id]/raid/[raidId]/delay/route.ts`, `features/projects/components/registers/RaidRegister.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

## H2 — Change Control Board — 🟩 Done
- **Requirements:** Workflow SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED→IMPLEMENTED. Approved w/ scheduleImpactDays → auto `DelayEvent(SCOPE_ADDITION, CLIENT)` + shift affected activities' `currentEnd`. Client sign-off capture. Feeds C22 scope volatility.
- **Acceptance criteria:** approve w/ impact 14 → DelayEvent daysLost=14; approve → affected currentEnd shift; pending → client report CR section; cumulative → C22 running total.
- **DoD:** full workflow · approved CR auto DelayEvent + shift · client sign-off · appears R2+R6.
- **Done (2026-07-14, Task 4.2):** Added Change Control Board APIs and `ChangeControlBoard` project-detail panel. Workflow is guarded (`SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED→IMPLEMENTED`); rejection requires a reason; sign-off captures timestamp. Approval runs inside a single transaction: updates CR decision fields, creates one `DelayEvent(eventType=BASELINE_SLIP, reason=SCOPE_ADDITION, owner=CLIENT, daysLost=scheduleImpactDays)`, shifts affected activities' `currentEnd` by the approved impact, and recalculates project rollup. Pending report query (`reportPending=true`) returns only `SUBMITTED/UNDER_REVIEW`; approved/implemented CRs feed scope-volatility total.
- **Files:** `lib/projects/change-requests.ts`, `lib/projects/change-requests.test.ts`, `app/api/projects/[id]/change-requests/route.ts`, `app/api/projects/[id]/change-requests/[crId]/route.ts`, `features/projects/components/registers/ChangeControlBoard.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

## H3 — Stage-Gates — 🟩 Done
- **Requirements:** Per-phase gate w/ entry/exit criteria, required deliverables/approvals. Soft-block next-phase `STARTED` if gate unpassed (override w/ logged reason). WAIVED requires `waiverReason`. Status in R6.
- **Acceptance criteria:** unpassed gate + next-phase STARTED → warning + override w/ reason; all exit criteria + approvals → PASSED; WAIVED → mandatory reason logged; steering pack shows gate status per phase.
- **DoD:** criteria checklists · soft block + override + reason · waiver reason · gate status in reports.
- **Done (2026-07-14, Task 4.3):** Added Stage Gate APIs and `StageGateRegister` project-detail panel. Gates are per-phase with entry/exit criteria, deliverables, approvals, and reportable statuses. `PASSED` requires at least one exit criterion; `WAIVED` requires `waiverReason` and logs `GATE_WAIVED`. Activity status updates to `STARTED` now check the previous phase's gate and return a conflict when it is unpassed; the view switcher and activity drawer prompt for an override reason and retry with `gateOverrideReason`, which is stored in the activity audit metadata.
- **Files:** `lib/projects/stage-gates.ts`, `lib/projects/stage-gates.test.ts`, `app/api/projects/[id]/stage-gates/route.ts`, `app/api/projects/[id]/stage-gates/[gateId]/route.ts`, `app/api/projects/[id]/activities/[activityId]/route.ts`, `features/projects/components/registers/StageGateRegister.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/components/views/ProjectViewSwitcher.tsx`, `features/projects/components/activity/ActivityDetailPanel.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

## H4 — Client Obligations & SLA Tracking — 🟩 Done
- **Requirements:** Register w/ named person + SLA business days. Auto breach detection tied to C3. `complianceRate = withinSLA/total×100`. <60% → Client Health drop + CEO warning. In R6.
- **Acceptance criteria:** 5-day SLA, took 9 → breach daysOverSla=4 + breachCount++; breaches → complianceRate; <60% → C9 drop + CEO warning; R6 scorecard shows rate + count.
- **DoD:** register w/ people+SLA · auto breach via C3 · compliance rate · feeds Client Health · appears R6.
- **Done (2026-07-14, Task 4.4):** Added Client Obligations APIs and `ClientObligationsRegister` project-detail panel. Obligations capture named client responsible person/email, SLA business days, contractual/R6 flag, notes, breach count, and compliance. The C3 approval clock now recomputes obligation compliance in the same transaction as approval-wait resolution and `ApprovalSlaBreach` creation. API returns computed Client Health score/tone and CEO warning when score drops below 60. Report mode (`report=true`) filters contractual obligations for R6.
- **Files:** `lib/projects/client-obligations.ts`, `lib/projects/client-obligations.test.ts`, `lib/projects/delay-ledger.ts`, `app/api/projects/[id]/client-obligations/route.ts`, `app/api/projects/[id]/client-obligations/[obligationId]/route.ts`, `features/projects/components/registers/ClientObligationsRegister.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

## H5 — Correction of Errors (COE) — 🟩 Done
- **Requirements:** Auto-prompt when milestone slips >10d OR project RED. 5-Whys (5 entries required to close). Root cause class feeds C18 Pareto. `systemicFix` + `fedIntoTemplate` → Lessons Learned. CEO sees overdue fixes.
- **Acceptance criteria:** milestone 15d → prompt; 5-Whys requires 5 before close; systemicFix + fedIntoTemplate → Lessons Learned; CEO dashboard shows overdue fixes.
- **DoD:** auto-trigger · 5-Whys structured · root cause class (C18) · template feedback loop.
- **Done (2026-07-14, Task 4.5):** Added COE APIs and `CorrectionOfErrorsRegister` project-detail panel. The API computes non-mutating prompts for milestone slips over 10 days and RED projects, suppresses prompts once a matching COE exists, blocks `DONE` closure until five complete Why/Answer entries and a systemic fix exist, returns root-cause Pareto data, surfaces overdue open fixes for the CEO dashboard, and exposes Lessons Learned rows when `systemicFix` + `fedIntoTemplate` are set.
- **Files:** `lib/projects/coe.ts`, `lib/projects/coe.test.ts`, `app/api/projects/[id]/coes/route.ts`, `app/api/projects/[id]/coes/[coeId]/route.ts`, `features/projects/components/registers/CorrectionOfErrorsRegister.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

## H6 — Payment Milestones — 🟩 Done
- **Requirements:** Trigger on linked activity →APPROVED → flag "Ready to Invoice" + notify finance. >30d outstanding → overdue on CEO dashboard.
- **Acceptance criteria:** trigger activity APPROVED → Ready to Invoice + finance notified; >30d → overdue flag.
- **DoD:** trigger on approval · finance notification · overdue tracking.
- **Done (2026-07-14, Task 4.6):** Added Payment Milestone APIs and `PaymentMilestonesRegister` project-detail panel. PMs can link a payment milestone to an activity; when that activity transitions to `APPROVED`, linked pending milestones are set to `READY_TO_INVOICE` in the same activity mutation transaction and finance/PM recipients receive `PAYMENT_MILESTONE_READY` after commit. API serialization and report/overdue filters compute >30-day outstanding invoice flags for CEO dashboard use.
- **Files:** `lib/projects/payment-milestones.ts`, `lib/projects/payment-milestones.test.ts`, `app/api/projects/[id]/payment-milestones/route.ts`, `app/api/projects/[id]/payment-milestones/[paymentMilestoneId]/route.ts`, `app/api/projects/[id]/activities/[activityId]/route.ts`, `features/projects/components/registers/PaymentMilestonesRegister.tsx`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/types.ts`, `features/projects/index.ts`

---

# EPIC I — Client Portal  *(P5 · resolves #19, #2)*
> **Anonymization is a data-layer rule, not a UI toggle.** Separate routes + separate serializer.

## I1 — Client Portal Authentication — 🟩 Done
- **Requirements:** `/portal` separate from `/dashboard`. Separate `ClientPortalUser` model + distinct NextAuth provider/callback, never mixed w/ internal sessions. Hard project scoping (`projectIds`). Internal user → "Preview as client".
- **Acceptance criteria:** client sees only their projectIds; client → `/dashboard/*` → 403; internal → `/portal` preview w/ banner.
- **DoD:** separate auth · hard scoping · `/dashboard` blocked for client · preview-as-client.
- **Done (2026-07-14, Task 5.2):** Added a dedicated portal NextAuth config and `/api/portal/auth/[...nextauth]` route using `ClientPortalUser`, password hashes, portal-only session fields, and distinct portal cookie names so client sessions never mix with internal sessions. Added portal auth guards and scoped `/api/portal/projects` routes that enforce `projectIds + portalEnabled` and serialize exclusively through I2. Middleware returns 403 for portal-only sessions accessing `/dashboard/*`. Added `/portal` and `/portal/projects/[id]` shells with internal-user preview banner.
- **Files:** `lib/portal-auth.ts`, `lib/api/withPortalAuth.ts`, `lib/projects/portal-auth.test.ts`, `app/api/portal/auth/[...nextauth]/route.ts`, `app/api/portal/projects/route.ts`, `app/api/portal/projects/[id]/route.ts`, `app/portal/page.tsx`, `app/portal/projects/[id]/page.tsx`, `app/portal/signin/page.tsx`, `middleware.ts`, `types/next-auth.d.ts`

## I2 — Anonymized Serializer ⭐ — 🟩 Done
- **Requirements:** `features/projects/services/portal-serializer.ts` is the ONLY client data path. Owner = "Your Team"/"360Ground Team" (never a person). Forbidden in ALL client responses: assigneeId/name/avatar, individual perf, INTERNAL comments/attachments, cost/margin, Jira keys, other clients' projects, `clientVisible=false` RAID. All `/api/portal/*` use it exclusively.
- **Acceptance criteria:** raw portal JSON contains no employee name/userId/avatar anywhere; internal comments excluded at SQL level; assigned activity → owner "360Ground Team"; **automated test asserts zero DB `User.name` in any portal response**.
- **DoD:** dedicated serializer (only path) · all `/api/portal/*` use it · **automated no-name test** · SQL-level filtering · code-review checklist item.
- **Done (2026-07-14, Task 5.1):** Added the dedicated portal serializer as the required data path for future `/api/portal/*` responses. It emits narrow client DTOs for project/phase/milestone/activity/delay/RAID/comment/attachment data, maps owners to `Your Team` or `360Ground Team`, strips forbidden user/cost/Jira keys recursively, redacts configured employee names from free-text strings, and throws if non-client-visible RAID/comments/attachments are passed. SQL helper filters enforce `projectIds + portalEnabled`, `CLIENT_VISIBLE` comments/attachments, and `clientVisible=true` RAID at query level.
- **Code review checklist:** any `/api/portal/*` route must import this serializer and must not return Prisma rows or internal project serializers directly.
- **Files:** `features/projects/services/portal-serializer.ts`, `lib/projects/portal-serializer.test.ts`

## I3 — Client Portal Dashboard — 🟩 Done
- **Requirements:** "Awaiting Your Action" first w/ live days-waiting + SLA. Anonymized Gantt. Schedule-changes table (incl client-owned delays honestly). Comment read+write (isClientAuthor). Report view/download.
- **Acceptance criteria:** Awaiting Your Action first + live counters; Gantt owners anonymized; delay table shows client-owned delays; client comment → isClientAuthor + PM notified; published report viewable.
- **DoD:** Awaiting Your Action prominent · anonymized Gantt · honest delay table · comment read+write · report viewing.
- **Done (2026-07-14, Task 5.3):** Expanded the client portal project detail into the I3 dashboard. The page renders "Awaiting Your Action" first with live business-day counters, anonymized Gantt rows using only `Your Team` / `360Ground Team`, honest schedule-change rows from DelayEvents, published reports, and client-visible RAID. Added portal-only comment read/write API that SQL-filters `CLIENT_VISIBLE` comments, writes `isClientAuthor=true`, and emits `CLIENT_COMMENT_POSTED` to the PM after persistence. Added report view/download route for published client report types. The portal project API now returns the same serializer-backed dashboard bundle.
- **Files:** `features/projects/services/portal-dashboard.ts`, `lib/projects/portal-dashboard.test.ts`, `app/portal/projects/[id]/page.tsx`, `app/portal/projects/[id]/PortalCommentBox.tsx`, `app/api/portal/projects/[id]/route.ts`, `app/api/portal/projects/[id]/activities/[activityId]/comments/route.ts`, `app/api/portal/projects/[id]/reports/[reportId]/route.ts`, `features/projects/services/portal-serializer.ts`

---

# EPIC J — Reports & Charts Engine  *(P7 · resolves #3, #5, #15)*

## J1 — Chart Library (C1–C24) — 🟩 Done
- **Requirements:** All via `recharts` + `<ChartWrapper>` (design tokens). C1–C24 per spec table; C24 Image-9 parity (completion ring + 6 KPI tiles); C18 Root-Cause Pareto (ranked + cumulative %). PNG export. Responsive + dark mode.
- **Acceptance criteria:** all 24 render; C24 matches Image 9; C18 Pareto w/ cumulative line; PNG export; responsive + dark.
- **DoD:** 24 charts · C24 parity · C18 Pareto · PNG export · responsive + dark.
- **Done (2026-07-15, Task 7.1):** Added the shared chart shell with AP tokens, responsive/dark styling, and PNG export; added the C1-C24 project charts catalog in the Overview tab. Recharts powers the supported chart forms, while C1/C2/C11/C13/C16/C24 use custom wall/grid/timeline/ring surfaces inside the same wrapper. C24 includes the completion ring plus six KPI tiles; C18 is ranked with a cumulative-percentage line. Current data derives from the live project where available and uses stable report-source sample series for J2-J5 metrics that are not generated yet.
- **Files:** `features/projects/components/charts/ChartWrapper.tsx`, `features/projects/components/charts/ProjectChartsLibrary.tsx`, `features/projects/components/views/ProjectViewSwitcher.tsx`, `features/projects/index.ts`

## J2 — Bi-Monthly Client Report (R2) — 🟩 Done
- **Requirements:** Workflow AI DRAFT→PM_REVIEW→APPROVED→SENT (Letters pattern). Sections per spec. AI summary **≤5 bullets/≤800 chars**, from structured facts only, post-validated, PM must approve. Anonymized. Bi-weekly cron. PDF + email + portal.
- **Acceptance criteria:** cron → DRAFT per active project + PM notified; summary ≤5 bullets/≤800 chars; not approved → cannot send; edit → aiSummaryEdited; sent → clientEmails + portal; no employee name.
- **DoD:** bi-weekly cron · capped AI + post-validation · PM approval hard gate · anonymization · PDF + email · portal.
- **Done (2026-07-15, Task 7.2):** Added `ProjectReport`-backed R2 generation with deterministic structured-facts summary output, hard post-validation (≤5 bullets/≤800 chars), `AiGenerationLog(feature=PROJECT_CLIENT_REPORT)`, DRAFT→PM_REVIEW→APPROVED→SENT transitions, summary edit tracking, hard send gate on APPROVED, PDF export through the Puppeteer renderer, client-email dispatch after persistence, and portal visibility through the existing portal report serializer. Added bi-monthly cron route that creates drafts for ACTIVE projects and notifies PMs after draft creation. Added PM-facing `ClientReportsPanel` on project detail for generate/edit/review/approve/send/PDF.
- **Files:** `lib/projects/client-report.ts`, `lib/projects/client-report.test.ts`, `app/api/cron/client-report/route.ts`, `app/api/projects/[id]/reports/route.ts`, `app/api/projects/[id]/reports/[reportId]/route.ts`, `app/api/projects/[id]/reports/[reportId]/pdf/route.ts`, `features/projects/components/reports/ClientReportsPanel.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/index.ts`

## J3 — Weekly Business Review Pack (R1) — 🟩 Done
- **Requirements:** Monday 6am cron. Portfolio SPI headline. Red items w/ owner + committed recovery date, carry-forward until green. No-recovery-date → "NO RECOVERY PLAN" red. PDF.
- **Acceptance criteria:** Monday → generate + notify CEO+PMs; red item → owner+date, carries forward; no date → flagged.
- **DoD:** Monday cron · every red item owner+date or flagged · carry-forward · PDF.
- **Done (2026-07-15, Task 7.3):** Added portfolio-level `ProjectReport(type=WBR, projectId=null)` generation with weekly Monday-Sunday period idempotency, portfolio SPI headline, week-over-week deltas from the previous WBR, red-item owner/recovery-date rows, explicit `NO RECOVERY PLAN` flags, previous red-item carry-forward until the project turns GREEN/completes/cancels, delay-ledger owner totals, pending client action counts, resource heat, escalation list, and PDF export. Added `app/api/cron/wbr-pack` protected by `CRON_SECRET`; it emits `WBR_PACK_READY` to CEO/Admin/Executive + active project PM recipients after the report row exists. Added portfolio WBR API/PDF routes and a `PortfolioWbrPanel` on `/dashboard/projects/portfolio`.
- **Files:** `lib/projects/wbr-report.ts`, `lib/projects/wbr-report.test.ts`, `app/api/cron/wbr-pack/route.ts`, `app/api/projects/portfolio/wbr/route.ts`, `app/api/projects/portfolio/wbr/[reportId]/pdf/route.ts`, `features/projects/components/reports/PortfolioWbrPanel.tsx`, `app/dashboard/projects/portfolio/page.tsx`, `features/projects/index.ts`

## J4 — Individual & Team Performance Reports (R3, R4) — 🟩 Done
- **Requirements:** R3 fields (dev, PM, sprint, assigned, estimate, buffer, completed, blocked, perf%, idle days, estimate accuracy, cycle time, blocked duration, scrum %, AI insight PM-editable). R4 team fields incl velocity, adoption score. 4 cadences (Daily/Weekly/Sprint/Monthly). Hidden entirely if no Jira. Expose metrics to Performance module.
- **Acceptance criteria:** Jira project → R3/R4 per cadence; non-Jira → hidden; AI insight PM-editable; metrics exposed to Performance module.
- **DoD:** all fields · 4 cadences · hidden w/o Jira · AI insight editable · API exposes metrics to Performance.
- **Done (2026-07-15, Task 7.4):** Added Jira-gated R3/R4 generation with `ProjectReport(type=INDIVIDUAL|TEAM)`, four cadences (`DAILY`, `WEEKLY`, `SPRINT`, `MONTHLY`), exact individual/team fields from the spec, deterministic PM-editable AI insights, PDF export, and a project-detail `PerformanceReportsPanel` that is hidden entirely for non-Jira projects. R3 composes assigned/completed/blocked Jira issue counts, estimates/buffer, completion %, idle days, estimate accuracy, cycle time, blocked duration, and scrum attendance. R4 composes team assigned/completed/blocked, performance %, velocity/trend, individual completion breakdown, and Jira adoption score. Added `lib/performance/project-performance-reports.ts` as the Performance-module auto-pull surface.
- **Files:** `lib/projects/performance-reports.ts`, `lib/projects/performance-reports.test.ts`, `lib/performance/project-performance-reports.ts`, `app/api/projects/[id]/performance-reports/route.ts`, `app/api/projects/[id]/performance-reports/[reportId]/route.ts`, `app/api/projects/[id]/performance-reports/[reportId]/pdf/route.ts`, `features/projects/components/reports/PerformanceReportsPanel.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/index.ts`

## J5 — Steering / COE / Estimation / Capacity (R6, R7, R9, R10) — 🟩 Done
- **Requirements:** Each a `ProjectReport` w/ its template. PDF export.
- **DoD:** R6 steering (monthly/quarterly) · R7 COE · R9 estimation learning · R10 capacity/bench · all PDF.
- **Done (2026-07-15, Task 7.5):** Added monthly/quarterly J5 generation with four `ProjectReport` templates: R6 Steering Pack, R7 COE Report, R9 Estimation Learning, and R10 Capacity/Bench. R6 composes health, stage gates, contractual client obligations, change requests, risks, delay-owner totals, and payment status. R7 composes COE counts, overdue fixes, root-cause Pareto, lessons learned, days lost, and cost impact. R9 compares project/Jira estimates to actuals and classifies under/over/balanced estimate bias. R10 summarizes project-member capacity across the forward workload window, over-allocation, idle people, hours, and bench candidates. Added API list/generate/detail/update/PDF routes plus a project-detail `ManagementReportsPanel` with summary edit and DRAFT→PM_REVIEW→APPROVED→SENT controls.
- **Files:** `lib/projects/management-reports.ts`, `lib/projects/management-reports.test.ts`, `app/api/projects/[id]/management-reports/route.ts`, `app/api/projects/[id]/management-reports/[reportId]/route.ts`, `app/api/projects/[id]/management-reports/[reportId]/pdf/route.ts`, `features/projects/components/reports/ManagementReportsPanel.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/components/ProjectDetailClient.tsx`, `features/projects/index.ts`

## J6 — AI Assistant (Constrained) — ✅ Verified
- **Requirements:** Allowed: capped exec summaries, risk detection, delay-pattern insights, estimate suggestions. Forbidden: generating requirements/specs, client prose w/o PM review, output > cap, auto-send. Reuse `AiGenerationLog`.
- **DoD:** all outputs capped + post-validated · PM approval before external use · reuse AiGenerationLog.
- **Done (2026-07-15, Task 7.6):** Added `lib/projects/ai-assistant.ts` with pure helpers for intent classification, cap/validation, forbidden-context rejection, and deterministic data-grounded response construction for the four allowed intents. Added `POST /api/projects/[id]/ai-assistant` (writable-project scoped, Zod-validated) and `AiAssistantPanel` launched from the Gantt toolbar. Every generation is logged via `AiGenerationLog(feature=PROJECT_AI_ASSISTANT)`. Responses are hard-capped to ≤5 bullets/≤800 chars, post-validated, marked `approved:false`/`requiresPmApproval:true`, and carry grounded-in metadata; the UI warns that PM approval is required and provides only a copy action (no send/client/auto-send path). Added node:test coverage for allowed/forbidden intent classification, cap enforcement, grounded response behavior, and forbidden-context detection. J6 tracker row moved to ✅ Verified.
- **Files:** `lib/projects/ai-assistant.ts`, `lib/projects/ai-assistant.test.ts`, `app/api/projects/[id]/ai-assistant/route.ts`, `features/projects/components/ai/AiAssistantPanel.tsx`, `features/projects/components/gantt/GanttChart.tsx`, `features/projects/hooks/useProject.ts`, `features/projects/index.ts`, `lib/ai/config.ts`

---

# EPIC K — OKR Integration & Portfolio Intelligence  *(P8 · resolves #9, #20, #24)*

## K1 — Link Milestones to Key Results — ✅ Verified
- **Requirements:** `Milestone.keyResultId` + `Project.objectiveId`. Milestone % change contributes to KR progress; recompute KR `currentValue` (weighted) + `recalcNodeAndAncestors()` (**existing** OKR fn, no duplication — reuse `lib/objectiveProgress.ts`). Delivery panel on objective detail (RAG/SPI/slip).
- **Acceptance criteria:** milestone 100% → KR currentValue updates + parent Objective recalcs via existing fn; objective→project → Delivery panel.
- **DoD:** milestone→KR link · project→objective link · milestone drives KR via existing OKR fns · delivery panel · **no duplication** of OKR progress logic.
- **Done (2026-07-15):** Added `lib/projects/okr-bridge.ts` with `recalcKrFromMilestones` and `recalcKrsAndAncestors`, wired into `recalcProjectRollup` so every activity/milestone/schedule mutation propagates to linked KRs and ancestor objectives in the same transaction. Updated milestone PATCH to recompute the old KR on unlink/move. Added `objectiveId` to `PATCH /api/projects/[id]`. Built `ProjectObjectiveLinker`, `MilestoneKeyResultLinker`, and `ObjectiveDeliveryPanel` (plus `GET /api/objectives/[id]/delivery`). Added node:test coverage for weighted KR recomputation and unit mapping.
- **Files:** `lib/projects/okr-bridge.ts`, `lib/projects/okr-bridge.test.ts`, `lib/projects/rollup.ts`, `app/api/projects/[id]/route.ts`, `app/api/projects/[id]/milestones/[milestoneId]/route.ts`, `app/api/objectives/[id]/delivery/route.ts`, `features/projects/components/okr/ProjectObjectiveLinker.tsx`, `features/projects/components/okr/MilestoneKeyResultLinker.tsx`, `features/projects/components/okr/ObjectiveDeliveryPanel.tsx`, `features/projects/hooks/useObjectives.ts`, `features/projects/index.ts`

## K2 — Portfolio Dashboard (CEO) — ✅ Verified
- **Requirements:** `/dashboard/projects/portfolio`. RAG counts + Portfolio SPI. Client-owned vs 360G delay split + headline %. C1 RAG wall, C17 bubble, C18 Pareto (all projects), C6, C9, C20. Escalations (RED projects, failed gates, overdue payments). Filters (client/PM/date).
- **Acceptance criteria:** all active projects w/ RAG/SPI/planned-vs-actual/slip split; C18 ranks reasons across all projects + cumulative; headline states client-owned %; escalations surface.
- **DoD:** portfolio page + charts · C18 across all projects · escalation logic · filters.
- **Done (2026-07-15):** Added `lib/projects/portfolio-dashboard.ts` aggregation service with real cross-project RAG counts, contract-value-weighted SPI, delay owner split, root-cause Pareto, client health score, capacity forecast, and escalations. Added `GET /api/projects/portfolio/dashboard` with client/PM/date filters. Built `PortfolioDashboard`, `PortfolioFilters`, and `PortfolioChartsLibrary` (real-data C1/C6/C9/C17/C18/C20). Updated `/dashboard/projects/portfolio` to render the dashboard above the existing WBR panel. Added unit test for Pareto aggregation.
- **Files:** `lib/projects/portfolio-dashboard.ts`, `lib/projects/portfolio-dashboard.test.ts`, `app/api/projects/portfolio/dashboard/route.ts`, `features/projects/components/portfolio/PortfolioDashboard.tsx`, `features/projects/components/portfolio/PortfolioFilters.tsx`, `features/projects/components/charts/PortfolioChartsLibrary.tsx`, `features/projects/hooks/usePortfolioDashboard.ts`, `app/dashboard/projects/portfolio/page.tsx`

## K3 — Cross-Project Performance Report — ✅ Verified
- **Requirements:** Portfolio snapshot persisted as a report; board-pack PDF export.
- **Acceptance criteria:** Generate a `ProjectReport(type=PORTFOLIO)` from current dashboard data; export to PDF; list historical reports.
- **DoD:** report generation endpoint · PDF export · historical list UI.
- **Done (2026-07-15):** Added `lib/projects/portfolio-report.ts` with `generatePortfolioReport` and `renderPortfolioReportPdfHtml`. Added `GET/POST /api/projects/portfolio/report`, `GET /api/projects/portfolio/report/[reportId]`, and `GET /api/projects/portfolio/report/[reportId]/pdf`. Built `PortfolioReportPanel` and added it to the portfolio page.
- **Files:** `lib/projects/portfolio-report.ts`, `app/api/projects/portfolio/report/route.ts`, `app/api/projects/portfolio/report/[reportId]/route.ts`, `app/api/projects/portfolio/report/[reportId]/pdf/route.ts`, `features/projects/components/portfolio/PortfolioReportPanel.tsx`

---

# Cross-cutting

## Permissions (§5.1) — 🟩 Done (baseline matrix)
15 new DocTypes (project, phase, milestone, activity, delay_event, change_request, raid_item, stage_gate, client_obligation, correction_of_error, payment_milestone, jira_connection, scrum_log, project_report, client_portal_user) w/ sensitive-field levels + default role matrix (ADMIN/EXECUTIVE/DEPARTMENT_LEAD/EMPLOYEE) + record scoping (own projects). Registered via existing permission seed pattern.

## Notifications (§5.2) — 🟩 Done (events registered)
New `PROJECT` category + 23 event keys (PROJECT_CREATED, PROJECT_BASELINE_COMMITTED, PROJECT_REBASELINED, PROJECT_RAG_CHANGED, PROJECT_WENT_RED, CLIENT_APPROVAL_PENDING⭐, CLIENT_APPROVAL_SLA_BREACH⭐, ACTIVITY_BLOCKED, ACTIVITY_OVERDUE, BASELINE_SLIPPED, STAGE_GATE_PENDING, STAGE_GATE_BYPASSED, CHANGE_REQUEST_SUBMITTED, CHANGE_REQUEST_APPROVED, RAID_HIGH_RISK_ADDED, CLIENT_REPORT_READY, CLIENT_COMMENT_POSTED, JIRA_SYNC_FAILED, PAYMENT_MILESTONE_READY, COE_REQUIRED, WBR_PACK_READY, PROJECT_DAILY_DIGEST, SCRUM_NOT_LOGGED). Added to `lib/notifications/events.ts`.

## Cron (§5.3) — ✅ Verified (6 of 6)
✅ `project-health` (daily 02:00), ✅ `approval-clock` (daily 08:00), ✅ `jira-sync` (30m), ✅ `client-report` (bi-weekly Mon 06:00), ✅ `wbr-pack` (weekly Mon 06:00), and ✅ `project-digest` (daily 07:00) shipped. All routes secured by Bearer `CRON_SECRET`.
6 routes (Bearer `CRON_SECRET`): jira-sync (30m), project-health (daily 02:00), approval-clock (daily 08:00), client-report (bi-weekly Mon 06:00), wbr-pack (weekly Mon 06:00), project-digest (daily 07:00).

---

# Global Definition of Done (§6.2) — applies to every feature

- [ ] **API:** `withAuth`/`withRole`, `{success, data?, error?}` envelope, Zod-validated input
- [ ] **Permissions:** DocType registered, defaults seeded, record scoping applied
- [ ] **Audit:** `recordActivity()` on every mutation
- [ ] **Types:** shared in `features/projects/types.ts` / `types/index.ts` — no re-declaration
- [ ] **Forms:** `react-hook-form` — no raw `useState` for forms
- [ ] **Modals:** `components/ui/Modal`; **Confirms:** `components/ui/ConfirmDialog`; **Empty:** `components/ui/EmptyState`
- [ ] **Styles:** `cn()` + design tokens — no hardcoded hex (except registered `project-status-*` tokens)
- [ ] **Feature barrel:** exported from `features/projects/index.ts`
- [ ] **Tests:** unit tests for business logic (rollup, EVM, delay ledger, scheduling, business-days)
- [ ] **Docs:** this tracker + `CHANGELOG_AI.md` + `MASTER_REFERENCE.md` updated

# Critical Invariants (§6.3) — must never break

1. ⭐ `baselineStart`/`baselineEnd` **immutable after commit** — server-side guard, not UI.
2. ⭐ **No date change on a baselined project without slip reason + owner** — hard gate.
3. ⭐ **Approval clock is automatic** — no PM action to accrue client delay.
4. ⭐ **No employee name ever reaches the client portal** — serializer + automated test.
5. ⭐ **Internal comments filtered at SQL level**, never CSS.
6. ⭐ **AI output capped + requires PM approval** before external use.
7. **Jira is read-only.** Never write to Jira.
8. **Projects work fully without Jira.** Layer 1 always sufficient.
9. **Rollup runs in the same transaction as the mutation.** No stale percentages.
10. **Every mutation writes `ActivityLog`.**
