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
| **0** | Groundwork | Tracker · CLAUDE.md guardrails · Prisma schema · feature skeleton · permissions/notifications | 🟨 In Progress |
| **P1** | A, B | A1, A2, B1, B2 | ⬜ Not Started |
| **P2** ⭐ | C | C1, C2, C3, C4, C5 | ⬜ Not Started |
| **P3** | D, E, F | D1–D4, E1, F1, F2 | ⬜ Not Started |
| **P4** | H | H1–H6 | ⬜ Not Started |
| **P5** | I | I1, I2, I3 | ⬜ Not Started |
| **P6** | G | G1–G6 | ⬜ Not Started |
| **P7** | J | J1–J6 | ⬜ Not Started |
| **P8** | K | K1, K2, K3 | ⬜ Not Started |
| — | Cross-cutting | Permissions (§5.1) · Notifications (§5.2) · Cron (§5.3) | ⬜ Not Started |

**Legend for DoD checkboxes below:** each feature carries the spec's DoD list. Global DoD (API envelope,
permissions, audit, shared types, react-hook-form, Modal/ConfirmDialog/EmptyState, `cn()` tokens,
barrel export, unit tests, docs) applies to **all** and is not repeated per row.

---

# EPIC A — Project Setup & Templates  *(P1 · resolves #4, #14)*

## A1 — Create Project — ⬜ Not Started
- **User story:** As a PM, create a project (client, dates, PM, budget) as the single source-of-truth container.
- **Requirements:** 3-step wizard (Basics/Schedule/Template) at `/dashboard/projects` → full-page (not modal). Auto `PRJ-{YYYY}-{NNN}` code (unique, editable, transaction-safe sequence). PM picker defaults to current user (`useUsersForSelection`). Dept via `useDepartments`. Contract value + currency (ETB default). Draft persisted per step in Zustand until final submit. Created in `PLANNING`, `baselineCommittedAt=null`, `percentComplete=0`. Template selection instantiates full tree (A2). PM auto-added as `ProjectMember(role=PM)`.
- **Acceptance criteria:** wizard opens with PM pre-filled; duplicate code → inline error, cannot advance; `plannedEnd ≤ plannedStart` → blocked; complete w/ template → full phase/milestone/activity tree, status `PLANNING`, land on Gantt; "Start blank" → zero phases, empty state + "Add Phase" CTA; `ActivityLog` `created` entry exists.
- **UI/UX:** stepper (● ━ ○ ━ ○); primary "New Project" top-right; fields per spec table; inline validation.
- **DoD:** `POST /api/projects` (withAuth, Zod, envelope) · react-hook-form · txn-safe code · transactional template instantiation · ActivityLog · unit tests (code-gen, date validation, template instantiation) · empty state.
- **Files:** _TBD_

## A2 — Project Templates (Seeded Lifecycle) — ⬜ Not Started
- **User story:** Start from a predefined delivery lifecycle so methodology is a reusable asset.
- **Requirements:** Seed 3 system templates (`isSystem=true`, non-deletable): "Standard Software Delivery" (7 phases per spec table; **every `*_Approval` activity `ownerParty=CLIENT`**), "Consulting/Advisory" (no Jira/dev), "Government Tender" (compliance gates). Template builder at `/dashboard/projects/templates` (Admin/PM): drag-drop tree (Phase→Milestone→Activity) + properties panel. **Copy-on-instantiate** (not live reference). Clone system → editable copy `isSystem=false`.
- **Acceptance criteria:** fresh install → 3 system templates; instantiate "Standard" → 7 phases + all milestones/activities w/ correct weight/position + `ownerParty=CLIENT` on approvals; clone → editable copy; edit template → existing projects unaffected.
- **UI/UX:** left tree + right properties; drag reorders persist `position`.
- **DoD:** seed script (3 templates) · copy-not-reference instantiation · `ownerParty=CLIENT` verified on every approval · drag-drop persists position · cloning works.
- **Files:** _TBD_ (`prisma/seed-project-templates.ts`)

---

# EPIC B — Schedule of Record  *(P1 · resolves #4, #13)*

## B1 — Manage Phases, Milestones, Activities — ⬜ Not Started
- **User story:** Organize schedule as Phase→Milestone→Activity→Sub-activity w/ weights so progress rolls up automatically.
- **Requirements:** Exactly ONE nesting level (Instagantt parity). Weights within a parent should sum to 100 (warn, don't block). Rollup `Activity%→Milestone%→Phase%→Project%` weighted average, **same DB transaction as mutation** (`lib/projects/rollup.ts::recalcActivityAndAncestors()`). Activity fields per spec table. 6-value status enum w/ exact colors. Planned% from baseline dates. Sub-activities → parent `percentComplete` read-only/derived.
- **Acceptance criteria:** weights 2/1 with 100%/0% → milestone 66.7%; update % → milestone/phase/project recompute in same txn; non-100 weights → non-blocking warning badge; activity w/ subtasks → % read-only; `currentEnd<currentStart` → blocked.
- **UI/UX:** 6 statuses render exact colors (NOT_STARTED grey `#E5E5EA` · STARTED `#A8D0F0` · FINISHED `#4A90D9` · APPROVAL_REQUESTED `#F5D547` · APPROVED `#5CB85C` · REJECTED `#F0932B`) via named `project-status-*` tokens.
- **DoD:** full CRUD (withAuth) · rollup in same txn · 6 colors exact · weight-mismatch warning · ActivityLog on every status change.
- **Files:** _TBD_ (`lib/projects/rollup.ts`)

## B2 — Project Confidence Score — ⬜ Not Started
- **User story:** 0–100 confidence so "80% done but 40 days late w/ 6 risks" isn't shown healthy.
- **Requirements:** `confidence = 100 - penalties` clamped 0..100 (schedule variance ×1.5, slip min(30,×0.5), risk ×5, blocked ×3, approval min(20,×0.4), staleness 10 if >7d). RAG derivation (GREEN ≥75 & spi≥0.95; AMBER 50–74 or spi 0.85–0.94; RED <50 or spi<0.85). Mirrors `lib/confidence-calc.ts`.
- **Acceptance criteria:** worked example ≈57.5 → AMBER; confidence<50 → RAG RED + `PROJECT_WENT_RED` notification (PM+CEO); nightly cron recomputes all active projects.
- **UI/UX:** shown on C24 ring + portfolio cards.
- **DoD:** `lib/projects/confidence.ts` + unit tests per penalty · cron `/api/cron/project-health` · RAG change → notification · displayed on C24 + portfolio.
- **Files:** _TBD_ (`lib/projects/confidence.ts`)

---

# EPIC C — Baselines & The Delay Ledger ⭐ CORE  *(P2 · resolves #1, #2, #5, #7, #25)*

## C1 — Commit Baseline — ⬜ Not Started
- **User story:** Freeze agreed schedule at kickoff so every later change is measurable variance, not a silent edit.
- **Requirements:** While `baselineCommittedAt=null` show warning banner; delay tracking inactive (`slipDays=0`). On commit: copy `current*→baseline*` for every Activity/Milestone/Phase; set `baselineCommittedAt=now`, `baselineVersion=1`; write `BaselineSnapshot` (full JSON). **Baseline fields immutable after commit** — server-side guard, no API path edits them except C2.
- **Acceptance criteria:** uncommitted → banner + slipDays always 0; commit → all `baseline*`=`current*` + snapshot v1; any API write to `baselineStart` → **403**; `ActivityLog` `baseline_committed` with actor.
- **UI/UX:** amber banner + confirm modal ("N activities will be baselined", optional notes).
- **DoD:** `POST /api/projects/[id]/baseline` · server-side write guard on baseline fields · snapshot full JSON · banner show/hide · transaction-safe across all activities.
- **Files:** _TBD_

## C2 — Re-Baseline (Formal Revision) — ⬜ Not Started
- **User story:** Re-baselining is formal, logged, reason-required so schedules can't be quietly rewritten.
- **Requirements:** Modal requires reason (≥20 chars), approver (default CEO/Exec), diff preview (old→new per activity). `baselineVersion` increments; new snapshot; **previous baseline preserved** (never overwritten). Reports can still show variance vs **v1**.
- **Acceptance criteria:** re-baseline → version++ + new snapshot + prior retained; reason <20 chars → blocked; reports show variance vs v1.
- **UI/UX:** diff table; approver picker.
- **DoD:** multiple versions retained · reports select version (default v1 for client) · accurate diff · ActivityLog + CEO notification.
- **Files:** _TBD_

## C3 — The Approval Clock ⭐ — ⬜ Not Started
- **User story:** Auto-start a clock when a deliverable is sent for client approval, stop on response, so client delay accrues as timestamped fact.
- **Requirements:** On `→APPROVAL_REQUESTED`: `waitingSince=now`, force `ownerParty=CLIENT`, notify client+PM. On `→APPROVED|REJECTED`: `daysWaited=businessDaysBetween(...)`, create `DelayEvent(APPROVAL_WAIT, owner=CLIENT, reason=CLIENT_APPROVAL_DELAY, isAutoDetected=true, phaseAtTime)`; if over SLA → `ApprovalSlaBreach` + `obligation.breachCount++`; clear `waitingSince`. **Business days** (configurable holidays). Clock automatic. Escalations at SLA/+3/+7.
- **Acceptance criteria:** set REQUESTED Mon → waitingSince=Mon, owner=CLIENT; approve +5 business days → DelayEvent daysLost=5; SLA 3, took 5 → breach daysOverSla=2 + breachCount++; +3 past SLA → escalation; REJECTED still records; weekend not counted.
- **UI/UX:** live "days waiting" counter in T3 + on Gantt yellow bar.
- **DoD:** `lib/projects/delay-ledger.ts::onStatusChange()` all transitions · business-day calc w/ holidays · auto DelayEvent · ApprovalSlaBreach · escalations SLA/+3/+7 · unit tests (weekend, breach, rejection) · live counter.
- **Files:** _TBD_ (`lib/projects/delay-ledger.ts`, `lib/projects/business-days.ts`)

## C4 — Slip Reason & Owner Attribution — ⬜ Not Started
- **User story:** Be forced to record why + whose fault whenever a baselined date moves, to prove statistically where delays come from.
- **Requirements:** On any date change on a **baselined** project (drag or edit), modal fires; **change not saved until reason+owner provided**. Reason taxonomy (9) auto-suggests owner (overridable). No modal pre-baseline. Creates `DelayEvent` w/ `phaseAtTime`. Cancel → Gantt bar snaps back. Recompute `slipDays` + roll to project.
- **Acceptance criteria:** baselined + move date → modal gates save; non-baselined → free edit; SCOPE_ADDITION → owner CLIENT (override to SHARED allowed); record → DelayEvent w/ phase; cancel → revert.
- **UI/UX:** modal shows activity, baseline end, new end (+N days), owner radio, reason select, detail.
- **DoD:** hard gate (no write w/o reason) · bar reverts on cancel · DelayEvent w/ phase context · reason→owner suggestion + override · slipDays recomputed + rolled up.
- **Files:** _TBD_

## C5 — Delay Ledger Table (T1) — ⬜ Not Started
- **User story:** One table of every delay w/ owner/reason/days to answer "why are we late?" in one screen (also shown to client).
- **Requirements:** Columns: Activity · Phase · Baseline date · Current date · Slip days · Reason · Owner · SLA breach flag · Recovery plan/owner/date. Header totals split by owner (server-computed). Filters (owner/reason/phase). CSV+PDF export (visible/filtered rows). Recovery plan inline editable. >7d w/o recovery plan → warning icon.
- **Acceptance criteria:** header totals split by owner arithmetically correct; filter owner=CLIENT → only client rows + totals update; SLA breach → red badge days-over; export contains filtered rows; >7d no-recovery → warning.
- **UI/UX:** table w/ owner-colored totals (🔴 client / 🔵 360G).
- **DoD:** sort/filter/export · totals server-side · SLA badges · inline recovery · rendered PM view AND portal.
- **Files:** _TBD_

---

# EPIC D — Gantt Chart (Instagantt Parity)  *(P3 · resolves #4, #19)*
> Custom React component. **Do NOT use `dhtmlx-gantt`.** New dep: `@tanstack/react-virtual`.

## D1 — Gantt Layout & Structure — ⬜ Not Started
- **Requirements:** Split pane (resizable divider, persisted per user; synced vertical scroll). Configurable left columns (Assignee/EH/Start/Due/Status/Priority/Risk/%/Owner). Row types Phase(summary)/Milestone/Activity/Sub-activity. Collapse/expand per-row + global. Live search filter. Today marker (red line + red header day). Two-row timeline header (month/year + day, week numbers). Scales Days/Weeks/Months/Quarters/Years. Zoom ±%. Minimap. Sort by Date/Name/Status/Priority. **Row virtualization** (500 activities @ 60fps).
- **Acceptance criteria:** panes scroll in sync; divider resizes + persists; collapse hides children keep summary; today red line correct x; scale change re-renders proportional; 200+ activities virtualize @ 60fps.
- **DoD:** custom Gantt (no dhtmlx) · virtualized rows · synced scroll + resizable divider (persisted) · all 5 scales · minimap · 500 activities @ 60fps.
- **Files:** _TBD_ (`features/projects/components/gantt/*`)

## D2 — Bars, Baseline Overlay & Colors — ⬜ Not Started
- **Requirements:** Actual bar = status color; baseline ghost `#D1D1D6@40%` 4px below when baselined; progress fill (darker) to `percentComplete`%; milestone diamond ◆ at `currentEnd` when `isMilestone`; phase summary bar auto-spans children (not draggable); RAG red tint on RED activities; ⏱ badge + days-waiting on yellow (APPROVAL_REQUESTED) bars.
- **Acceptance criteria:** slipped 14d → ghost ends 14d before actual; 60% → 60% fill; milestone → diamond; phase → auto-span, not draggable; APPROVAL_REQUESTED → yellow + ⏱ badge.
- **DoD:** ghost bar · 6 colors exact · progress fill · diamonds · phase auto-span · approval badge.
- **Files:** _TBD_

## D3 — Drag, Resize & Dependency Auto-Shift — ⬜ Not Started
- **Requirements:** Drag bar (move both), drag edges (resize start/end). Drop on baselined → C4 modal; cancel → snap back (incl cascaded). FS successors shift by delta, transitively. Draw dependency via hover handles; delete via click+confirm. Cycle detection blocks. Live tooltip w/ new dates. All 4 dep types (FS default).
- **Acceptance criteria:** drag A → FS successor B shifts same; chain A→B→C transitive; baselined drop → C4 before persist; cancel → all reverts; cycle → blocked w/ message; live tooltip.
- **DoD:** `lib/projects/scheduling.ts::shiftSuccessors()` + cycle detection · drag/resize + tooltip · reason gate · full revert · dep draw/delete · 4 types.
- **Files:** _TBD_ (`lib/projects/scheduling.ts`)

## D4 — Gantt Toolbar — ⬜ Not Started
- **Requirements:** Export&Share (PDF/PNG/CSV/MSProject XML/Share to portal); Baselines (show/hide, version select, commit, re-baseline); Options (deps/progress/critical path/weekends/today); Columns (toggle, persisted per user); Segments (group by Phase/Assignee/Status/Owner); Undo; Critical Path (CPM); Duplicate; Legend; Comments toggle; Minimap toggle; AI Assistant (J6); Sort; Scale.
- **Acceptance criteria:** hide baselines → ghosts gone; critical path → red zero-float path; toggle column persists; export PDF → print-ready w/ header; scale panel matches Image 5.
- **DoD:** all dropdowns functional · CPM forward/backward pass · PDF/PNG/CSV/MSProject export · column prefs persisted · scale panel parity.
- **Files:** _TBD_

---

# EPIC E — View Toggles  *(P3 · resolves #16, #4)*

## E1 — View Switcher — ⬜ Not Started
- **Requirements:** 6 views (Gantt default · Table inline-edit/bulk · Board kanban 6 status cols, drag=status change fires C3 · Workload people×weeks heatmap across ALL projects · Mindmap radial `reactflow` · Overview C24 ring + KPIs + charts + registers). Active filter/search persists across views (Zustand).
- **Acceptance criteria:** filter persists across switch; board drag Finished→ApprovalRequested → clock starts + client notified; workload >100% → red; overview → C24 Expected vs Actual.
- **DoD:** 6 views · filters persist · board drag = real transition w/ side effects · workload across all projects · overview parity (Images 3+9).
- **Files:** _TBD_

---

# EPIC F — Activity Detail Panel & Comments  *(P3 · resolves #3, #19)*

## F1 — Activity Detail Panel — ⬜ Not Started
- **Requirements:** Right side panel (reuse `SideDrawer`) w/ all fields, subtasks, comment thread (Image 2 parity) + 3 additions: Owner Party radio, approval-clock banner (live business-days + SLA breach), visibility toggles. 7 header actions: Mark done (→FINISHED,100%), Outdent, Indent, Convert to Milestone, Color, Delete, Close. Optimistic save + undo toast.
- **Acceptance criteria:** click bar → panel w/ fields; APPROVAL_REQUESTED → live clock banner + SLA breach red; Indent → becomes sub-activity, Gantt re-renders; ◇ → diamond; status→APPROVAL_REQUESTED → clock + client notified; edit → optimistic save + undo.
- **DoD:** panel layout + 3 additions · 7 actions · indent/outdent restructures · live clock banner · optimistic save + undo.
- **Files:** _TBD_ (`features/projects/components/activity/ActivityDetailPanel.tsx`)

## F2 — Comments w/ Internal/Client Visibility ⭐ — ⬜ Not Started
- **Requirements:** Each comment INTERNAL|CLIENT_VISIBLE (**default INTERNAL**). INTERNAL physically absent from portal API (SQL `WHERE visibility='CLIENT_VISIBLE'`, not CSS). Client comments → `isClientAuthor=true` + distinct badge. @mention → notification. Same rule for attachments.
- **Acceptance criteria:** INTERNAL never in portal raw JSON; CLIENT_VISIBLE shows; client comment → isClientAuthor + badge; @mention → notification; default INTERNAL.
- **DoD:** visibility field default INTERNAL · portal serializer filters at query level · same for attachments · @mention notifications · client-authored distinct.
- **Files:** _TBD_

---

# EPIC G — Jira Integration (Optional)  *(P6 · resolves #8–#12)*

## G1 — Connect Jira — ⬜ Not Started
- **Requirements:** Project Settings→Integrations. Fields: site URL, email, API token (write-only), project key. Token **AES-256 at rest**, never returned. Test Connection calls `GET /rest/api/3/myself`. Error mapping 401/403/404/429.
- **Acceptance criteria:** valid → confirm + counts; invalid → clear error; save → encrypted + `jiraLinked=true`; view later → `••••`, never sent to client.
- **DoD:** AES-256 at rest · token never in response · test endpoint · error mapping.
- **Files:** _TBD_

## G2 — Sync Engine — ⬜ Not Started
- **Requirements:** Pull issues (JQL search), sprints, worklogs, changelogs. Cron 30min + manual "Sync Now". Incremental (`updated >= -35m`). Rate-limit aware (10 req/s) + exponential backoff. `JiraSyncLog` per run. Email→User resolution. Graceful degradation (project works w/o Jira).
- **Acceptance criteria:** cron → all connections sync + log each; 429 → backoff + PARTIAL; email matches User → assigneeUserId resolves; failure → PM banner; unreachable → project fully functional on Layer 1.
- **DoD:** 4 endpoints · incremental · rate-limit/backoff · email→User · JiraSyncLog every run · failure never breaks page.
- **Files:** _TBD_ (`features/projects/services/jira/*`, `app/api/cron/jira-sync`)

## G3 — Map Jira Issues to Activities — ⬜ Not Started
- **Requirements:** Map by Epic/Label/Component/Sprint/Manual. Auto-rollup `% = doneIssues/totalIssues×100` (or story-point weighted) when `jiraAutoRollup`. Manual override wins (turns auto off).
- **Acceptance criteria:** map Epic + auto → 6/10 done → 60%; manual set → auto off, manual persists; no mapping → 100% manual.
- **DoD:** 5 mapping types · auto-rollup on sync · manual wins · mapping UI w/ live preview.
- **Files:** _TBD_

## G4 — Idle Days & Estimate Accuracy ⭐ — ⬜ Not Started
- **Requirements:** Idle day = working day w/ no transition AND no worklog AND no comment. Estimate accuracy `actual/estimated`; bias = median across issues. Exclude weekends/holidays.
- **Acceptance criteria:** no activity Mon–Wed → 3 idle; 8h→12h → accuracy 1.5; median 1.4/20 → "systematically underestimates"; weekends excluded.
- **DoD:** idle via transitions+worklogs+comments · working-day calendar · accuracy per issue + median per person · feeds R3 + Performance module.
- **Files:** _TBD_

## G5 — Jira Adoption Score — ⬜ Not Started
- **Requirements:** Weighted avg (assignee 25% / estimate 25% / updated<3d 25% / story points 25%). <60% → warning banner on reports.
- **Acceptance criteria:** worked example → 67.5%; <60% → warning banner.
- **DoD:** per project + team · warning banner <60% · shown in R4.
- **Files:** _TBD_

## G6 — Scrum Attendance Log ⭐ — ⬜ Not Started
- **Requirements:** Quick-log widget (date, time held, duration, facilitator, attendees/absentees/late, blockers). Unique on `projectId+scrumDate` (re-log edits). R5 report + C16 heatmap. Attendance % per person; <70% flagged.
- **Acceptance criteria:** log → stored w/ date/time; report → totals + per-person rate + team rate; <70% flagged in R5; re-log edits existing.
- **DoD:** widget · R5 + C16 · attendance % per person · feeds Performance module.
- **Files:** _TBD_

---

# EPIC H — Governance Registers  *(P4 · resolves #6, #17, #18, #21, #22, #23)*

## H1 — RAID Log — ⬜ Not Started
- **Requirements:** 4 tabs (Risks/Assumptions/Issues/Dependencies), type-specific fields (§3.3). 5×5 risk matrix (P×I, dots colored by score: 1–6 green/8–12 amber/15–25 red). `daysOpen` auto-computed. `clientVisible` controls portal. High risks feed B2 confidence penalty. Dependency past `neededByDate` → red + can generate DelayEvent.
- **Acceptance criteria:** P4×I5 → score 20, red zone; issue open 15d → daysOpen shows; overdue client dependency → red + DelayEvent; clientVisible → portal; high risks penalize confidence.
- **DoD:** 4 types w/ fields · 5×5 matrix · daysOpen auto · client visibility respected · high risks → confidence penalty.
- **Files:** _TBD_

## H2 — Change Control Board — ⬜ Not Started
- **Requirements:** Workflow SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED→IMPLEMENTED. Approved w/ scheduleImpactDays → auto `DelayEvent(SCOPE_ADDITION, CLIENT)` + shift affected activities' `currentEnd`. Client sign-off capture. Feeds C22 scope volatility.
- **Acceptance criteria:** approve w/ impact 14 → DelayEvent daysLost=14; approve → affected currentEnd shift; pending → client report CR section; cumulative → C22 running total.
- **DoD:** full workflow · approved CR auto DelayEvent + shift · client sign-off · appears R2+R6.
- **Files:** _TBD_

## H3 — Stage-Gates — ⬜ Not Started
- **Requirements:** Per-phase gate w/ entry/exit criteria, required deliverables/approvals. Soft-block next-phase `STARTED` if gate unpassed (override w/ logged reason). WAIVED requires `waiverReason`. Status in R6.
- **Acceptance criteria:** unpassed gate + next-phase STARTED → warning + override w/ reason; all exit criteria + approvals → PASSED; WAIVED → mandatory reason logged; steering pack shows gate status per phase.
- **DoD:** criteria checklists · soft block + override + reason · waiver reason · gate status in reports.
- **Files:** _TBD_

## H4 — Client Obligations & SLA Tracking — ⬜ Not Started
- **Requirements:** Register w/ named person + SLA business days. Auto breach detection tied to C3. `complianceRate = withinSLA/total×100`. <60% → Client Health drop + CEO warning. In R6.
- **Acceptance criteria:** 5-day SLA, took 9 → breach daysOverSla=4 + breachCount++; breaches → complianceRate; <60% → C9 drop + CEO warning; R6 scorecard shows rate + count.
- **DoD:** register w/ people+SLA · auto breach via C3 · compliance rate · feeds Client Health · appears R6.
- **Files:** _TBD_

## H5 — Correction of Errors (COE) — ⬜ Not Started
- **Requirements:** Auto-prompt when milestone slips >10d OR project RED. 5-Whys (5 entries required to close). Root cause class feeds C18 Pareto. `systemicFix` + `fedIntoTemplate` → Lessons Learned. CEO sees overdue fixes.
- **Acceptance criteria:** milestone 15d → prompt; 5-Whys requires 5 before close; systemicFix + fedIntoTemplate → Lessons Learned; CEO dashboard shows overdue fixes.
- **DoD:** auto-trigger · 5-Whys structured · root cause class (C18) · template feedback loop.
- **Files:** _TBD_

## H6 — Payment Milestones — ⬜ Not Started
- **Requirements:** Trigger on linked activity →APPROVED → flag "Ready to Invoice" + notify finance. >30d outstanding → overdue on CEO dashboard.
- **Acceptance criteria:** trigger activity APPROVED → Ready to Invoice + finance notified; >30d → overdue flag.
- **DoD:** trigger on approval · finance notification · overdue tracking.
- **Files:** _TBD_

---

# EPIC I — Client Portal  *(P5 · resolves #19, #2)*
> **Anonymization is a data-layer rule, not a UI toggle.** Separate routes + separate serializer.

## I1 — Client Portal Authentication — ⬜ Not Started
- **Requirements:** `/portal` separate from `/dashboard`. Separate `ClientPortalUser` model + distinct NextAuth provider/callback, never mixed w/ internal sessions. Hard project scoping (`projectIds`). Internal user → "Preview as client".
- **Acceptance criteria:** client sees only their projectIds; client → `/dashboard/*` → 403; internal → `/portal` preview w/ banner.
- **DoD:** separate auth · hard scoping · `/dashboard` blocked for client · preview-as-client.
- **Files:** _TBD_

## I2 — Anonymized Serializer ⭐ — ⬜ Not Started
- **Requirements:** `features/projects/services/portal-serializer.ts` is the ONLY client data path. Owner = "Your Team"/"360Ground Team" (never a person). Forbidden in ALL client responses: assigneeId/name/avatar, individual perf, INTERNAL comments/attachments, cost/margin, Jira keys, other clients' projects, `clientVisible=false` RAID. All `/api/portal/*` use it exclusively.
- **Acceptance criteria:** raw portal JSON contains no employee name/userId/avatar anywhere; internal comments excluded at SQL level; assigned activity → owner "360Ground Team"; **automated test asserts zero DB `User.name` in any portal response**.
- **DoD:** dedicated serializer (only path) · all `/api/portal/*` use it · **automated no-name test** · SQL-level filtering · code-review checklist item.
- **Files:** _TBD_ (`features/projects/services/portal-serializer.ts`)

## I3 — Client Portal Dashboard — ⬜ Not Started
- **Requirements:** "Awaiting Your Action" first w/ live days-waiting + SLA. Anonymized Gantt. Schedule-changes table (incl client-owned delays honestly). Comment read+write (isClientAuthor). Report view/download.
- **Acceptance criteria:** Awaiting Your Action first + live counters; Gantt owners anonymized; delay table shows client-owned delays; client comment → isClientAuthor + PM notified; published report viewable.
- **DoD:** Awaiting Your Action prominent · anonymized Gantt · honest delay table · comment read+write · report viewing.
- **Files:** _TBD_

---

# EPIC J — Reports & Charts Engine  *(P7 · resolves #3, #5, #15)*

## J1 — Chart Library (C1–C24) — ⬜ Not Started
- **Requirements:** All via `recharts` + `<ChartWrapper>` (design tokens). C1–C24 per spec table; C24 Image-9 parity (completion ring + 6 KPI tiles); C18 Root-Cause Pareto (ranked + cumulative %). PNG export. Responsive + dark mode.
- **Acceptance criteria:** all 24 render; C24 matches Image 9; C18 Pareto w/ cumulative line; PNG export; responsive + dark.
- **DoD:** 24 charts · C24 parity · C18 Pareto · PNG export · responsive + dark.
- **Files:** _TBD_ (`features/projects/components/charts/*`)

## J2 — Bi-Monthly Client Report (R2) — ⬜ Not Started
- **Requirements:** Workflow AI DRAFT→PM_REVIEW→APPROVED→SENT (Letters pattern). Sections per spec. AI summary **≤5 bullets/≤800 chars**, from structured facts only, post-validated, PM must approve. Anonymized. Bi-weekly cron. PDF + email + portal.
- **Acceptance criteria:** cron → DRAFT per active project + PM notified; summary ≤5 bullets/≤800 chars; not approved → cannot send; edit → aiSummaryEdited; sent → clientEmails + portal; no employee name.
- **DoD:** bi-weekly cron · capped AI + post-validation · PM approval hard gate · anonymization · PDF + email · portal.
- **Files:** _TBD_

## J3 — Weekly Business Review Pack (R1) — ⬜ Not Started
- **Requirements:** Monday 6am cron. Portfolio SPI headline. Red items w/ owner + committed recovery date, carry-forward until green. No-recovery-date → "NO RECOVERY PLAN" red. PDF.
- **Acceptance criteria:** Monday → generate + notify CEO+PMs; red item → owner+date, carries forward; no date → flagged.
- **DoD:** Monday cron · every red item owner+date or flagged · carry-forward · PDF.
- **Files:** _TBD_

## J4 — Individual & Team Performance Reports (R3, R4) — ⬜ Not Started
- **Requirements:** R3 fields (dev, PM, sprint, assigned, estimate, buffer, completed, blocked, perf%, idle days, estimate accuracy, cycle time, blocked duration, scrum %, AI insight PM-editable). R4 team fields incl velocity, adoption score. 4 cadences (Daily/Weekly/Sprint/Monthly). Hidden entirely if no Jira. Expose metrics to Performance module.
- **Acceptance criteria:** Jira project → R3/R4 per cadence; non-Jira → hidden; AI insight PM-editable; metrics exposed to Performance module.
- **DoD:** all fields · 4 cadences · hidden w/o Jira · AI insight editable · API exposes metrics to Performance.
- **Files:** _TBD_

## J5 — Steering / COE / Estimation / Capacity (R6, R7, R9, R10) — ⬜ Not Started
- **Requirements:** Each a `ProjectReport` w/ its template. PDF export.
- **DoD:** R6 steering (monthly/quarterly) · R7 COE · R9 estimation learning · R10 capacity/bench · all PDF.
- **Files:** _TBD_

## J6 — AI Assistant (Constrained) — ⬜ Not Started
- **Requirements:** Allowed: capped exec summaries, risk detection, delay-pattern insights, estimate suggestions. Forbidden: generating requirements/specs, client prose w/o PM review, output > cap, auto-send. Reuse `AiGenerationLog`.
- **DoD:** all outputs capped + post-validated · PM approval before external use · reuse AiGenerationLog.
- **Files:** _TBD_

---

# EPIC K — OKR Integration & Portfolio Intelligence  *(P8 · resolves #9, #20, #24)*

## K1 — Link Milestones to Key Results — ⬜ Not Started
- **Requirements:** `Milestone.keyResultId` + `Project.objectiveId`. Milestone % change contributes to KR progress; recompute KR `currentValue` (weighted) + `recalcNodeAndAncestors()` (**existing** OKR fn, no duplication — reuse `lib/objectiveProgress.ts`). Delivery panel on objective detail (RAG/SPI/slip). Projects appear as delivery nodes in alignment map.
- **Acceptance criteria:** milestone 100% → KR currentValue updates + parent Objective recalcs via existing fn; objective→project → Delivery panel; alignment map shows project nodes.
- **DoD:** milestone→KR link · project→objective link · milestone drives KR via existing OKR fns · delivery panel · **no duplication** of OKR progress logic.
- **Files:** _TBD_

## K2 — Portfolio Dashboard (CEO) — ⬜ Not Started
- **Requirements:** `/dashboard/projects/portfolio`. RAG counts + Portfolio SPI. Client-owned vs 360G delay split + headline %. C1 RAG wall, C17 bubble, C18 Pareto (all projects), C6, C9, C20. Escalations (RED projects, failed gates, overdue payments). Filters (client/PM/date). PDF for board packs.
- **Acceptance criteria:** all active projects w/ RAG/SPI/planned-vs-actual/slip split; C18 ranks reasons across all projects + cumulative; headline states client-owned %; escalations surface.
- **DoD:** portfolio page + charts · C18 across all projects · escalation logic · filters · PDF export.
- **Files:** _TBD_

## K3 — Cross-Project Performance Report — ⬜ Not Started
- **Requirements:** Portfolio SPI/CPI trend, delay attribution trend, on-time delivery rate, approval latency/client (C21), scope volatility (C22), estimation accuracy trend, utilization, root-cause distribution (C18).
- **Acceptance criteria:** ≥2 completed projects → trend charts; report answers "#1 systemic delivery problem" w/ ranked quantified answer.
- **DoD:** cross-project aggregation · trend charts · exportable board pack.
- **Files:** _TBD_

---

# Cross-cutting

## Permissions (§5.1) — ⬜ Not Started
15 new DocTypes (project, phase, milestone, activity, delay_event, change_request, raid_item, stage_gate, client_obligation, correction_of_error, payment_milestone, jira_connection, scrum_log, project_report, client_portal_user) w/ sensitive-field levels + default role matrix (ADMIN/EXECUTIVE/DEPARTMENT_LEAD/EMPLOYEE) + record scoping (own projects). Registered via existing permission seed pattern.

## Notifications (§5.2) — ⬜ Not Started
New `PROJECT` category + 22 event keys (PROJECT_CREATED, PROJECT_BASELINE_COMMITTED, PROJECT_REBASELINED, PROJECT_RAG_CHANGED, PROJECT_WENT_RED, CLIENT_APPROVAL_PENDING⭐, CLIENT_APPROVAL_SLA_BREACH⭐, ACTIVITY_BLOCKED, ACTIVITY_OVERDUE, BASELINE_SLIPPED, STAGE_GATE_PENDING, STAGE_GATE_BYPASSED, CHANGE_REQUEST_SUBMITTED, CHANGE_REQUEST_APPROVED, RAID_HIGH_RISK_ADDED, CLIENT_REPORT_READY, CLIENT_COMMENT_POSTED, JIRA_SYNC_FAILED, PAYMENT_MILESTONE_READY, COE_REQUIRED, WBR_PACK_READY, SCRUM_NOT_LOGGED). Added to `lib/notifications/events.ts`.

## Cron (§5.3) — ⬜ Not Started
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
