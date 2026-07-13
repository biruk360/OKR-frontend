# Project Management Module — Remaining Task List (for Kimi Code)

Work through these **in order, top to bottom**. Each task is scoped to be reviewed in isolation
(like the C3 trial). Do **one task, verify, update docs, then STOP and report** before the next —
do not batch multiple tasks into one turn. The full acceptance criteria + DoD for every feature live
in `docs/project_management_module_BUILD_SPEC.md` (cited per task as "spec §…"); this file gives you
the sequence, the files, the reuse constraints, and the gotchas. Track status in
`docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md`.

Prereq: you've read `docs/PROJECT_MANAGEMENT_MODULE_HANDOVER.md` and the guardrails in `CLAUDE.md`.

---

## Standing rules (apply to EVERY task — non-negotiable)

1. **Side-effects go AFTER the transaction commits.** Never call `emit()`, email, or pusher inside a
   `prisma.$transaction`. Return data/decisions from the txn, then fire effects after it commits.
   (This is the fix from the C3 review — apply it everywhere. Model: the objectives route emits after
   the write, outside any txn.)
2. **Reuse first. Only ONE new dependency is approved for the whole remaining build:**
   `@tanstack/react-virtual` (P3 Gantt). Everything else already exists — check `package.json`, the
   reuse table in the handover, and existing `components/ui/*`, `lib/*`, `hooks/*`, `features/*` before
   writing anything new.
3. **Rollup (`recalcProjectRollup`) runs in the same transaction as any schedule mutation.**
4. **Every mutation → `recordActivity()`; every route → `withAuth`/`withRole` + Zod + `{success,data}`
   envelope.** Record scoping via `lib/projects/access.ts` (`getReadableProject`/`getWritableProject`).
5. **Design system:** existing tokens/primitives only (no hardcoded hex except the `project-status-*`
   tokens; new dynamic class names must be added to the `tailwind.config.js` safelist).
6. **Per-task DoD:** `npx tsc --noEmit` clean · `npm run test:projects` green (add tests for new
   business logic, `node:test` style — no test framework) · update the feature's tracker row + append
   `docs/CHANGELOG_AI.md` · `docs/MASTER_REFERENCE.md` updated · **no scope creep** into other tasks.
7. **Remember the gotchas** (handover §8): shell cwd resets (run from `OKR-frontend/`); `diffEntity` is
   OKR-only (build change maps inline); `StatCardTone` = blue/green/yellow/red/purple/gray/indigo;
   `ConfirmDialog` needs `message`; new notification `entityType`s go in all 3 of
   `lib/notifications/{events,deep-link,redact}.ts`; `prisma db push` never migrate.
8. **Stop at every phase gate** (end of P2, P3, …) and report for review before starting the next phase.

---

## PHASE 2 — Delay Ledger core (Epic C). ⭐ Finishes the gate before the Gantt.

### Task 2.0 — Fix C3 emit-in-transaction (from review)
- **Do:** In `lib/projects/delay-ledger.ts`, stop calling `emit()` inside `applyApprovalClock`. Instead
  return the notification intents on the decision (e.g. `pendingEmails: [{eventKey, payload}]`), and
  have `app/api/projects/[id]/activities/[activityId]/route.ts` fire them **after** the
  `prisma.$transaction` commits.
- **Verify:** existing tests still green; add a note in the C3 changelog entry.
- **Then:** flip C3 tracker row to `✅ Verified`.

### Task 2.1 — C1 Commit Baseline (spec §C1)
- **Files:** `app/api/projects/[id]/baseline/route.ts` (POST); wire the "Commit Baseline" action into
  the existing amber banner in `features/projects/components/ProjectDetailClient.tsx` (use `Modal`/
  `ConfirmDialog`, show the activity count).
- **Logic (one txn):** copy `current*→baseline*` for every Phase/Milestone/Activity of the project;
  set `project.baselineCommittedAt=now`, `baselineVersion=1`; write a `BaselineSnapshot` (version 1,
  `snapshotJson` = the full schedule tree). Audit `BASELINE_COMMITTED`. Emit
  `PROJECT_BASELINE_COMMITTED` **post-commit**.
- **Invariant #1:** after commit, `baseline*` fields must be immutable. Confirm no route writes them
  (the activity PATCH already never does) and add an explicit server guard/comment. The re-baseline
  endpoint (2.2) is the only exception.
- **Acceptance:** uncommitted → banner shown + `slipDays` stays 0; commit → all `baseline*`=`current*`
  + snapshot v1 exists; any attempt to PATCH a baseline field → 403; audit entry exists.

### Task 2.2 — C2 Re-Baseline (spec §C2)
- **Files:** extend the baseline route (or `.../baseline/rebaseline`), plus a modal in the detail UI.
- **Logic:** require `reason` (≥20 chars); increment `baselineVersion`; write a **new** `BaselineSnapshot`
  (never overwrite prior ones); copy current→baseline again; audit `REBASELINED`; emit
  `PROJECT_REBASELINED` (CEO) post-commit. Provide a diff (old→new per activity) for the modal preview.
- **Acceptance:** version increments; prior snapshot retained; reason <20 chars → blocked; reports can
  still compute variance vs **v1**.

### Task 2.3 — C4 Slip attribution → DelayEvent (spec §C4)
- **Files:** `app/api/projects/[id]/activities/[activityId]/route.ts` (the gate already rejects a
  baselined date change without `slipReason`+`slipOwner`); add the DelayEvent creation. Client: a
  reason modal on the schedule-tree date edit.
- **Logic:** when a baselined activity's dates move (gate passed), inside the txn create a `DelayEvent`
  `{ eventType:'BASELINE_SLIP', owner: slipOwner, reason: slipReason, phaseAtTime, daysLost: newSlip -
  oldSlip (min 0), isAutoDetected:false }`; `recalcProjectRollup` already recomputes `slipDays`. Reason→
  owner auto-suggest is in `features/projects/types.ts::SLIP_REASON_OWNER`.
- **Acceptance:** baselined + date move w/o reason → 403 (already); with reason → DelayEvent created w/
  `phaseAtTime`; non-baselined project → free edit, no modal, no event. (Bar snap-back on cancel is a
  Gantt concern — deferred to P3; enforce the gate on the tree edit for now.)

### Task 2.4 — C5 Delay Ledger table (spec §C5)
- **Files:** `app/api/projects/[id]/delays/route.ts` (GET, server-computed owner totals + filters;
  PATCH a delay's recovery plan), `features/projects/components/DelayLedgerTable.tsx` (reuse
  `@tanstack/react-table`), a hook, and a tab/section on the project detail page.
- **Columns/behavior:** Activity · Phase · Baseline date · Current date · Slip days · Reason · Owner ·
  SLA-breach flag · Recovery plan/owner/date. Header totals split by owner (**computed server-side**,
  not a page sum). Filters (owner/reason/phase). CSV export of the filtered rows. >7d with no recovery
  plan → warning icon.
- **Acceptance:** owner totals arithmetically correct; filter updates totals; SLA breach badge; CSV has
  filtered rows.

### Task 2.5 — approval-clock cron (spec §5.3)
- **Files:** `app/api/cron/approval-clock/route.ts` (copy `app/api/cron/project-health/route.ts` for the
  `CRON_SECRET` pattern).
- **Logic:** find activities in `APPROVAL_REQUESTED` past their obligation SLA and fire
  `CLIENT_APPROVAL_SLA_BREACH` escalations at SLA, +3, +7 business days (dedupe so each threshold fires
  once). Business days via `lib/projects/business-days.ts`.

**► P2 GATE:** verify C1–C5 end-to-end (a throwaway script like `scripts/verify-p1.ts`: commit baseline
→ move a date with reason → assert DelayEvent + snapshot; request→approve across a weekend → assert
APPROVAL_WAIT event + SLA breach). Flip all C rows to `✅ Verified`. Report before P3.

---

## PHASE 3 — Gantt + Views + Detail panel (Epics D, E, F). Biggest phase — split into sub-tasks.

> Install `@tanstack/react-virtual` (the one approved dep). Build a **custom** Gantt — do NOT use
> `dhtmlx-gantt`. Files under `features/projects/components/gantt/` per spec §2.3.

- **3.1 D1 — Gantt layout/structure** (spec §D1): split pane (resizable, persisted), synced scroll,
  configurable left columns, row types (phase summary/milestone/activity/sub), collapse/expand, search,
  today marker, 2-row timeline header, 5 scales, zoom, minimap, sort. **Virtualize rows** (500 @ 60fps).
- **3.2 D2 — Bars, baseline overlay, colors** (spec §D2): status-colored actual bar (`project-status-*`
  tokens), baseline ghost (`project-baseline` @40%) when baselined, progress fill, milestone diamonds,
  phase auto-span, approval-clock badge on yellow bars.
- **3.3 D3 — Drag/resize + dependency auto-shift** (spec §D3): new `lib/projects/scheduling.ts`
  (`shiftSuccessors` transitive cascade + cycle detection + CPM critical path — pure, unit-tested);
  drag/resize with live tooltip; **on a baselined project the drop fires the C4 reason modal and cancel
  snaps back (incl. cascaded successors)**; draw/delete dependencies; 4 types (FS default).
- **3.4 D4 — Toolbar + export** (spec §D4): Export&Share (PDF via the `lib/letter-pdf-puppeteer.ts`
  pattern / PNG / CSV / MS-Project XML), Baselines (show/hide/version/commit/re-baseline), Options,
  Columns (persisted), Segments, Undo, Critical Path, Duplicate, Legend, Comments, Minimap, Scale.
- **3.5 E1 — View switcher** (spec §E1): 6 views (Gantt/Table/Board/Workload/Mindmap/Overview). Table =
  `@tanstack/react-table`/`ag-grid`; Board drag = real status transition (fires the C3 clock); Workload
  heatmap across **all** projects; Mindmap = `reactflow`; Overview = KPIs + registers. Filters persist
  across views (Zustand).
- **3.6 F1 — Activity detail panel** (spec §F1): reuse `components/ui/SideDrawer`; all fields + subtasks
  + 7 header actions (mark done/outdent/indent/convert-to-milestone/color/delete/close) + owner-party
  radio + live approval-clock banner + visibility toggles. Optimistic save + undo toast.
- **3.7 F2 — Comments w/ visibility** (spec §F2 ⭐): `ActivityComment` CRUD, default `INTERNAL`, TipTap
  editor, @mention notifications, threaded. **Visibility is enforced at the SQL level** — the portal
  query (P5) filters `WHERE visibility='CLIENT_VISIBLE'`; never CSS. Same rule for attachments.

**► P3 GATE:** the Gantt drives the schedule with baseline overlay + working drag/dependencies; report.

---

## PHASE 4 — Governance registers (Epic H). Each: models already exist; build routes + UI + tracker.

- **4.1 H1 RAID** (spec §H1): 4 tabs, type-specific fields, 5×5 risk matrix (score 1–6 green/8–12
  amber/15–25 red), `daysOpen` auto-compute, `clientVisible` flag, high risks feed B2 confidence
  (already wired in `lib/projects/health.ts` — it counts `score>=15` open risks).
- **4.2 H2 Change Control Board** (spec §H2): workflow SUBMITTED→…→IMPLEMENTED; approved CR w/
  `scheduleImpactDays` auto-creates a `DelayEvent(reason:SCOPE_ADDITION, owner:CLIENT)` and shifts
  affected activities' `currentEnd` (in txn + rollup); client sign-off.
- **4.3 H3 Stage-Gates** (spec §H3): entry/exit criteria checklists; soft-block next-phase `STARTED`
  when the prior gate is unpassed (override w/ logged reason); WAIVED requires `waiverReason`.
- **4.4 H4 Client Obligations & SLA** (spec §H4): register w/ named person + SLA; **wire the SLA source
  into C3** (the approval clock's obligation lookup); compliance rate; feeds Client Health.
- **4.5 H5 Correction of Errors** (spec §H5): auto-prompt when a milestone slips >10d or project goes
  RED; 5-Whys (5 entries required to close); root-cause class (feeds C18 Pareto later).
- **4.6 H6 Payment Milestones** (spec §H6): trigger on linked activity →APPROVED → "Ready to Invoice" +
  notify finance; >30d outstanding → overdue.

**► P4 GATE:** report.

---

## PHASE 5 — Client Portal (Epic I). ⚠ Hard data-layer rules — highest-scrutiny phase.

- **5.1 I2 Anonymized serializer FIRST** (spec §I2 ⭐): `features/projects/services/portal-serializer.ts`
  as the **only** path to client data (owner shown as "Your Team"/"360Ground Team"; never a name; no
  cost/assignee/Jira/internal-comment fields). **Write the automated test that fetches every
  `/api/portal/*` response and asserts zero DB `User.name` appears — this test must pass before the
  portal ships (Invariant #4).**
- **5.2 I1 Portal auth** (spec §I1): `/portal` with a **separate** NextAuth provider + `ClientPortalUser`
  (never mixed with internal sessions); hard project scoping (`projectIds`); `/dashboard/*` → 403 for
  portal users; "preview as client" for PMs.
- **5.3 I3 Portal dashboard** (spec §I3): "Awaiting Your Action" first (live business-day counters),
  anonymized Gantt, honest delay table (incl. client-owned delays), client comment read+write
  (`isClientAuthor`), report viewing. All comment/attachment/RAID queries filter
  `visibility/clientVisible` at the SQL level (Invariant #5).

**► P5 GATE:** the no-employee-name test passes; report.

---

## PHASE 6 — Jira integration (Epic G). Optional layer — module must work fully without it.

- **6.1 crypto util:** `lib/projects/jira-crypto.ts` using Node's built-in `crypto` (AES-256-GCM) — **no
  new dep**; key from an env var. Token is write-only, never returned by any API (Invariant #7).
- **6.2 G1 Connect** (spec §G1): settings UI + `Test Connection` (`GET /rest/api/3/myself`), error map
  401/403/404/429.
- **6.3 G2 Sync engine** (spec §G2): `features/projects/services/jira/*` — pull issues/sprints/worklogs/
  changelogs; incremental (`updated >= -35m`); rate-limit + exponential backoff; `JiraSyncLog` per run;
  email→User resolution; **failure never breaks the project page**. `app/api/cron/jira-sync` (30m).
- **6.4 G3 Mapping + rollup** (spec §G3): 5 mapping types; auto-rollup when `jiraAutoRollup`; manual
  override wins.
- **6.5 G4 Idle days + estimate accuracy** (spec §G4): reuse `business-days.ts` working-day calendar;
  expose to the Performance module.
- **6.6 G5 Adoption score + G6 Scrum log** (spec §G5/§G6): adoption weighted score + warning <60%; scrum
  quick-log widget (unique on projectId+scrumDate) + attendance %.

**► P6 GATE:** report.

---

## PHASE 7 — Reports & Charts (Epic J).

- **7.1 J1 Chart library** (spec §J1): `features/projects/components/charts/ChartWrapper.tsx` + C1–C24
  with `recharts` (design tokens; responsive + dark). C24 completion ring (Image-9 parity) + C18
  Root-Cause Pareto are the priority charts.
- **7.2 J2–J5 Reports** (spec §J2–J5): `ProjectReport`-backed reports (R1–R10) reusing the **Letters
  workflow pattern** (DRAFT→PM_REVIEW→APPROVED→SENT). AI summaries **hard-capped ≤5 bullets/≤800 chars,
  post-validated, PM-approval gate** (Invariant #6), logged via `AiGenerationLog`. Crons:
  `client-report` (bi-weekly Mon 06:00), `wbr-pack` (Mon 06:00).
- **7.3 J6 AI assistant** (spec §J6): capped, data-grounded, PM-approved; never auto-send.

**► P7 GATE:** report.

---

## PHASE 8 — OKR integration & Portfolio (Epic K).

- **8.1 K1 Milestone→KR / Project→Objective** (spec §K1): milestone % change drives the linked KR's
  `currentValue` and recalcs the objective via the **existing** `lib/objectiveProgress.ts::
  recalcNodeAndAncestors` — **do not duplicate OKR logic**. Delivery panel on the objective detail page.
- **8.2 K2 Portfolio dashboard** (spec §K2): replace the placeholder at
  `app/dashboard/projects/portfolio/page.tsx` — RAG wall (C1), bubble (C17), **cross-project Pareto
  (C18)**, delay-by-owner headline %, escalations (RED projects / failed gates / overdue payments),
  filters, PDF export.
- **8.3 K3 Cross-project report** (spec §K3): portfolio SPI/CPI + delay-attribution trends, on-time
  rate, root-cause distribution.
- **8.4 project-digest cron** (spec §5.3): daily overdue/blocked digest to PMs.

**► FINAL GATE:** full module walkthrough; all tracker rows `✅ Verified`; `MASTER_REFERENCE.md`
complete; every cron present (6 total).

---

## Cron summary (6 total — 2 done)
✅ `project-health` (daily 02:00) · ✅ `approval-clock` (daily, Task 2.5). To build: `jira-sync` (6.3), `client-report`
+ `wbr-pack` (7.2), `project-digest` (8.4). All secured by `Bearer CRON_SECRET` (copy the health cron).
