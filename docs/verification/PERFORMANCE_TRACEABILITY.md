# Performance & Scorecard Module — Requirements Traceability

**Verified:** 2026-09-27 (agent T4, read-only code review)
**Authoritative spec:** `../docs/performance_scorecard_module_requirements_detailed.md` (v2.0, 30 requirements A1–H2 + audit appendix 2026-07-12)
**Also checked against:** `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`, `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md`
**Code surface:** `lib/performance/**`, `app/api/performance/**`, `app/api/cron/performance-nudge`, `features/performance/**`, `app/dashboard/performance/**`, `prisma/schema.prisma` (performance models), `prisma/performance-templates-seed.json`, `prisma/seed-performance-templates.ts`, `prisma/seed-culture-library.ts`, `lib/notifications/{events,dispatcher,deep-link}.ts`, `lib/email/templates/index.ts`

The spec's inline "Implementation Status" lines are from the 2026-07-12 audit, taken **before** remediation P1–P7. None of them were taken on trust. Every status below comes from reading the current code. The status doc marks all 30 as DONE. This review does not agree for 12 of them.

**Status key:** DONE = every acceptance criterion is met in code (small gaps are still listed) · PARTIAL = at least one AC is unmet or only works through the API · DEVIATES = built to a deliberately different design (usually accepted in the proposal) that still changes a spec AC · MISSING = not built.

---

## 1. Summary

| | DONE | PARTIAL | DEVIATES | MISSING | Total |
|---|---|---|---|---|---|
| Spec requirements (A1–H2) | 18 | 8 | 4 | 0 | 30 |
| Cross-cutting items (X1–X7) | 3 | 3 | 0 | 1 | 7 |

| Epic | DONE | PARTIAL | DEVIATES |
|---|---|---|---|
| A — Templates | A1, A7, A8 | A2, A3 | A4, A5, A6 |
| B — Cycles | B1, B2 | B3 | — |
| C — Panels | C1, C2 | — | — |
| D — Scoring | D1, D3, D4, D5 | — | D2 |
| E — Consolidation | E1, E2, E3, E4 | — | — |
| F — Report | F2 | F1, F3 | — |
| G — Growth loop | G2, G3 | G1 | — |
| H — Rewards | — | H1, H2 | — |

**Test coverage:** `npm run test:performance` runs **4 tests, 4 passing** (run 2026-09-27):
- `lib/performance/metric-resolver.test.ts`: 3 tests, covering the manual-actual fallback only.
- `app/api/performance/audit-coverage.test.ts`: 1 static scan that checks every mutating route calls `recordActivity`.

Nothing tests scoring math, the state machine, template validation, consolidation, finalization/recommendations, the cron, or the sealing and blind-evaluation DTOs. Proposal §7.3 calls the security tests "release blockers". Coverage is marked **WEAK** for every area except the metric resolver and the audit invariant.

### Known open items: confirmed status

| Open item | Result | Evidence |
|---|---|---|
| `PerformanceSettings.remarkAttributionEnabled` read? | **Yes.** Read in the report builder. | `lib/performance/report-builder.ts:31-45` |
| `weeklyNudgeDay` read? | **Yes.** Cron gates on the ISO weekday; `?force=1` overrides. | `app/api/cron/performance-nudge/route.ts:21-34`; crontab runs daily (`scripts/install-crontab.sh:187`) |
| `recommendationRulesJson` read? | **Yes.** Merged over the defaults at finalize. | `lib/performance/finalization.ts:25-37,104` |
| `varianceThreshold` / `improvementFocusLimit` settings UI | **Yes.** Admin API and UI (RHF-validated). | `app/api/performance/settings/route.ts:45-58`; `features/performance/components/PerformanceSettingsPanel.tsx:127-151`; page `app/dashboard/performance/settings/page.tsx` |
| D1 arrow-key nav / timed autosave / running total | **Present, with limits.** ↑/↓/Enter move between score cells, but ←/→ do nothing. Autosave fires on a 3 s debounce and on blur, with no `beforeunload` flush. The running raw total includes auto-metric scores. | `ScoringWorkspace.tsx:413-421`, `:24-25,221-241`, `:297-312,358` |
| D2/F2 remark attribution | **Yes.** Entries become `"Name: remark"` when the toggle is on. When off, remarks are **concatenated verbatim** (no real synthesis). | `report-builder.ts:42,62-64` |
| H1 "Ready" rule | **Matches the spec defaults, but brittle.** Ready + gatekeeper pass produces SALARY_ADJUSTMENT + BONUS{tier:'top'} + PROMOTION (only if improving vs. the prior finalized evaluation). The rule matches the literal labels `'Ready'` and `'On Track'`, so any template whose bands have been renamed gets no reward recommendations. | `finalization.ts:105-128` |
| B1 department-scoped cycles | **Yes.** UI scope selector with department checklist; API gated by `review_cycle_department:create`. | `CyclesWorkspace.tsx:44-63,165-196`; `app/api/performance/cycles/route.ts:43-69`; `cycle-opening.ts:55-61` |
| EXCUSED flow | **API and UI exist, with 3 gaps.** (1) The UI shows the button to anyone holding `evaluation:submit`, but the API accepts admins only. (2) Excused evaluations stay in the evaluator queue. (3) An evaluation can be excused on a CLOSED cycle. | `evaluations/[id]/excuse/route.ts:16,25`; `ScoringWorkspace.tsx:187,361-365,445-470`; `EvaluatorQueue.tsx:13` |
| Amharic anchors | **Can be entered, but are never shown.** They are entered in the builder and library editor. The evaluator popover shows English only, focus `targetText` prefers English, and the C1–C6 constants are English-only. | `TemplateBuilder.tsx:268-298`; `CultureLibraryManager.tsx:249-258`; `ScoringWorkspace.tsx:131-138`; `scoring.ts:113-115`; `culture-library.ts` |
| Evaluation ActivityLog panel | **Yes.** Visible to lead and admin only. The UI renders `metadata` only, but the API returns the full rows including `changes`, which contain raw score values (see F1). | `evaluations/[id]/activity/route.ts:14-24`; `EvaluationActivityPanel.tsx:59-103` |

---

## 2. Traceability tables

### Epic A — Scorecard Template Management

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| A1 | Create a named, role-targeted template (DRAFT, v1, maxTotal 0, default bands 85/70/0; same name makes a new version; button hidden without permission; invalid bands blocked on save) | DONE | `app/api/performance/templates/route.ts:8-13,30-81` (family upsert, `version = latest+1`, `maxTotal: 0`); `TemplatesWorkspace.tsx:22-23,46`; bands validated inline, save disabled in `TemplateScoringSettings.tsx:19-45,137-139` | The server accepts unvalidated `gatekeeper`/`bands` on POST (`templates/route.ts:60-61`) and PATCH (`templates/[id]/route.ts:63-64`). Only publish validates. The create form does not capture gatekeeper or bands; they default. Tests: none. |
| A2 | Tier/criterion builder with drag-drop, live totals, non-blocking tier-sum warning, fork when a published template is edited | PARTIAL | HTML5 drag-drop plus ↑/↓ buttons, with position taken from array order (`TemplateBuilder.tsx:117-162,190-237`; `builder/route.ts:84-110`); live "Criterion total" (`TemplateBuilder.tsx:213-215`); `maxTotal` recomputed on save (`builder/route.ts:80-83`) | AC2: the mismatch is neutral text, not a warning, and blocks publish (`template-validation.ts:96-101`). AC4 deviates: edits to a published template are rejected (`state-machine.ts:40-42`) and forking is an explicit action. `weight` is not exposed. Inserting the culture block refetches the template and **overwrites unsaved builder edits** (`TemplateBuilder.tsx:64-84`). Tests: none. |
| A3 | 0/4/7/10 anchors; publish blocked when any are missing; next-anchor-up focus text; EN + AM | PARTIAL | Required anchors are checked at publish and each missing level is named (`template-validation.ts:33,108-117`); `resolveNextAnchor` picks the first level strictly above the score (`scoring.ts:106-116`); formatted, ordered popover (`ScoringWorkspace.tsx:140-165`); bilingual entry (`TemplateBuilder.tsx:268-298`, `anchor-helpers.ts`) | Amharic is stored but never displayed to evaluators or employees (popover `anchorText` returns `.en` only, and `resolveNextAnchor` prefers `en`). Tests: none for `resolveNextAnchor`. |
| A4 | Metric criterion with KR link; LINEAR/INVERSE/MANUAL rules; SUM/AVG/LATEST; unavailable KR routed to manual | DEVIATES | Rule picker for all three rules (`TemplateBuilder.tsx:300-380`); scoring (`scoring.ts:25-58`); aggregation (`metric-resolver.ts:144-155`); per-employee KR search mapping (`MetricMappingManager.tsx:23-45`, `metric-mappings/route.ts`) frozen at cycle open (`cycle-opening.ts:161-196`); unavailable actuals raise an `ACTUAL_UNAVAILABLE` issue and block (`consolidation.ts:23-72`), with a manual-actual fallback (`evaluations/[id]/manual-actual/route.ts`, `metric-resolver.ts:41-68`) | Accepted divergence: no `criterion.keyResultId`. A `LINEAR_CAPPED` `maxScore` or inverse band `score` can exceed the criterion `maxPoints`, and nothing validates this (`template-validation.ts:118-123`). The period has no lower bound: check-ins with `asOfDate ≤ periodEnd` are used even when older than `periodStart` (`metric-resolver.ts:128-131`). Tests: 3 (resolver fallback only). `scoreMetric` is untested, so AC1 (9.2) and AC2 (10/5/0) are unverified. |
| A5 | Reusable C1–C6 culture block read from the Criterion Library, copied not referenced | DEVIATES | One-click, idempotent insert copying anchors into the tier and recomputing tier and template totals (`templates/[id]/culture-block/route.ts:32-67`); admin library editor (`CultureLibraryManager.tsx`, `culture-library/[id]/route.ts`) | **The insert ignores the library.** It copies the hardcoded `CULTURE_CRITERIA` constant (`culture-block/route.ts:33,50-61`), so admin edits made in the library editor never reach templates. The upsert also **overwrites an edited name and re-activates a deactivated entry** (`:39-49`), and `db:seed:culture-library` overwrites edited anchors (`seed-culture-library.ts:30-34`). The library text differs from the Excel-seeded Tier 4 text (seed C1 "Shortsighted decisions; ignores ambiguity." vs. `culture-library.ts:8` "Regularly makes decisions…"), so AC2 fails between seeded templates and templates built with the block. Tests: none. |
| A6 | Versioning: edits fork, version history with publish dates and usage counts | DEVIATES | Explicit fork (`templates/[id]/fork/route.ts`); publish archives the previous published version of the family (`publish/route.ts:20-35`); cycle open pins the newest published version (`cycle-opening.ts:106-117`); the API returns `publishedAt` and `_count.evaluations` per version (`templates/[id]/route.ts:17-22`) | Accepted divergence: no edit-triggers-fork. The history UI shows the evaluation count but **not the publish date** (`TemplatesWorkspace.tsx:79`). Tests: none. |
| A7 | Publish/archive with the full validation list | DONE | `publish/route.ts:16-18` returns every failing issue; `archive/route.ts:13-17`; non-admins only see PUBLISHED (`templates/route.ts:20`) | "KR or manual" cannot be checked at publish (per-employee mapping). A missing link surfaces as a `METRIC_SOURCE_MISSING` issue at cycle open. Tests: none for `validateTemplateForPublish`. |
| A8 | Seed the 8 Excel templates | DONE | `prisma/seed-performance-templates.ts:6-8,66,95` (idempotent, publish-validated, v1 PUBLISHED); 8 families in `performance-templates-seed.json` (7 × 160 pts rubric, SE OKR 6 tiers / 210 pts, LINEAR/INVERSE rules, Tier 1 ≥ 25, bands 85/70/0) | The SE OKR culture tier is seeded as six `METRIC`/`MANUAL` criteria with no anchors, not as a RUBRIC culture block. It must be run on production (`STATUS.md:87-91`). |

### Epic B — Review Cycle Management

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| B1 | Create cycle: cadence, period, concurrency, department scope | DONE | `cycles/route.ts:7,35-86` (`end ≤ start` rejected, no uniqueness constraint, department scope); UI with RHF errors (`CyclesWorkspace.tsx:37-67,139-198`) | Cadence token is `EVERY_TWO_MONTHS` (an accepted deviation). The cadence does not drive any nudge schedule (the nudge is global weekly). Tests: none. |
| B2 | Open cycle: auto-generate evaluations; `PERF_CYCLE_OPENED` | DONE | `cycle-opening.ts:34-205`: active users only; explicit then role-mapping template; newest PUBLISHED version pinned; `NO_TEMPLATE` issue; transactional and idempotent. Per-evaluator notification (`cycles/[id]/open/route.ts:23-38`). Issues drill-down with resolve/waive (`CycleIssuesModal.tsx:12-18,70-73`; `cycles/[id]/issues/[issueId]/route.ts`) | Resolving an issue does not fix the underlying data (by design). Tests: none. |
| B3 | Close cycle: finalized/excused check, logged override, read-only once closed | PARTIAL | `cycles/[id]/close/route.ts:17-49` (lists incomplete evaluations, requires override reason, audit-logged); UI override dialog (`CyclesWorkspace.tsx:69-86,200-218`); scoring and panel are gated on `cycle.status==='OPEN'` (`policy.ts:132`, `panel/route.ts:20`) | **AC3 not enforced.** After a closed override, `share-draft`, `finalize`, `calibration` PUT, `acknowledge`, `dispute`, `excuse` and `manual-actual` never check cycle status, so a closed cycle's evaluations can still change. Cycle status `CONSOLIDATING` is never set anywhere. Tests: none. |

### Epic C — Evaluator Panel Management

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| C1 | Dynamic 1–N panel, exactly one LEAD, no self-evaluation, confirm before discarding submitted scores | DONE | `evaluations/[id]/panel/route.ts:19-65` (diff-based; retained submissions preserved, which fixes the audit bug; closed cycle blocked); `PanelManager.tsx:19-64` (employee excluded, discard-confirm flow) | Tests: none. |
| C2 | Manager auto-assigned as LEAD; "no lead" flagged | DONE | `cycle-opening.ts:141-159` (`NO_LEAD` and `AMBIGUOUS_LEAD` issues); an evaluation without an assignment cannot be scored or consolidated (`policy.ts:125-132`, `consolidation.ts:103`) | Tests: none. |

### Epic D — Evaluation & Scoring

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| D1 | Excel-like keyboard grid, live subtotals and running total, autosave/resume, read-only metric rows, over-max clamp | DONE | Tier subtotals (`ScoringWorkspace.tsx:376-383`); running total (`:297-312`); ↑/↓/Enter navigation (`:413-421`); 3 s debounced batch autosave plus blur-save (`:221-251,314-319`); inline clamp hint (`:325-344,423`); metric rows read-only (`:386,396`) and rejected server-side (`scores/route.ts:28-31`) | ←/→ do not move between cells. There is no `beforeunload`/`visibilitychange` flush, so up to 3 s of typing is lost if the tab closes (AC3 is only partly met). The grid still uses a `document.querySelectorAll` focus hack. Tests: none. |
| D2 | Anchor popover, per-criterion remark, remarks private and synthesized unless attribution is on | DEVIATES | Formatted popover (`ScoringWorkspace.tsx:140-165`); remark upserted per (evaluation, evaluator, criterion) (`scores/route.ts:56-75`); attribution toggle honored (`report-builder.ts:42`) | With attribution off, the employee still sees **the raw remark text, verbatim and concatenated** (`report-builder.ts:62-64`), not a synthesis. This is the proposal §2.9 deterministic choice, but it conflicts with the AC wording. `EvaluatorScore.isAutoPulled` is dead (`schema.prisma:2496`, never written). Tests: none. |
| D3 | Metric auto-pull from the OKR, identical across evaluators, re-resolved at consolidation, unavailable routed to manual | DONE | `okr-actual/[criterionId]/route.ts:36-64` (returns an `unavailable` flag rather than 500); re-resolved inside the consolidation transaction (`consolidation.ts:131-135`); manual actual modal (`ScoringWorkspace.tsx:27-129`, `ManualActualModal.tsx`) | Accepted deviation: the actual is the latest `KeyResultCheckIn` ≤ `periodEnd`, with `currentValue` only as a fallback. A `currentValue` change with no check-in is ignored (AC2 semantics differ). Tests: 3 (resolver). |
| D4 | Blind evaluation enforced server-side | DONE | Detail: non-lead, non-admin callers get only their own scores (`evaluations/[id]/route.ts:59-62`); the lead gets calibration access only once consolidated (`policy.ts:161-166`); the list endpoint has no scores (`evaluations/route.ts:30-47`); the activity route is lead/admin and lead only after consolidation (`activity/route.ts:14`) | **Tests: none.** The proposal §7.3 release-blocker test ("A cannot read B pre-consolidation") does not exist. |
| D5 | Submit: completeness check, lock, auto-consolidate on the last submitter, `PERF_PANEL_COMPLETE` | DONE | `submit/route.ts:21-44` (missing list, `lockedAt`), `:58-80` (consolidates and notifies the LEAD), `:86-88` (blocked metric handled gracefully); UI lock after submit (`ScoringWorkspace.tsx:289-291,406`) | `consolidateEvaluation` never calls `assertEvaluationTransition`, so an evaluation with no rubric criteria can jump from ASSIGNED straight to CONSOLIDATED. Tests: none. |

### Epic E — Consolidation, Calibration & Scoring Math

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| E1 | Simple average, max−min variance, rawTotal, normalized | DONE | `scoring.ts:8-23`; `consolidation.ts:137-145,184-210` (rounded to 2 dp) | **Tests: none.** AC1 (8,6 → 7 / var 2) is unverified by tests. |
| E2 | Variance flagging (`> threshold`) routes to CALIBRATION; average unchanged | DONE | `consolidation.ts:152,199`; threshold editable via settings (`settings/route.ts:45-51`) | Tests: none. |
| E3 | Side-by-side calibration, a note per flag, resolve returns to CONSOLIDATED, notes hidden from employee | DONE | `CalibrationPanel.tsx:11-53,74-94`; `calibration/route.ts:24-56` (status guard plus `assertEvaluationTransition`, which fixes audit bug #1); notes stripped for the employee (`evaluations/[id]/route.ts:51`) | After a dispute (see F3), the lead has no in-grid view of the employee's comment. Tests: none. |
| E4 | Gatekeeper, normalization, banding, failure cap | DONE | `scoring.ts:60-104`; `consolidation.ts:186-198`; `template-validation.ts:130-152` | Tests: none. ACs 22→Not Ready, 88→Ready and 74→On Track are unverified by tests. |

### Epic F — Employee Report & Acknowledgement

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| F1 | Scores sealed until DRAFT_SHARED; never raw per-evaluator scores; server-enforced | PARTIAL | Employee-first sealed DTO, which also closes the employee-admin edge (`evaluations/[id]/route.ts:30-57`); list and /me omit sealed fields (`evaluations/route.ts:31-46`, `me/route.ts:55-67`); report gated (`policy.ts:225-239`) | **(1) Inference leak.** After sharing, the employee DTO includes each criterion's `variance` and `flagged` (`evaluations/[id]/route.ts:51`). For a 2-evaluator panel the raw scores follow exactly: mean ± variance/2. This breaks AC2 and proposal §7.3 "cannot infer". **(2)** `PUT /scores` writes raw score values into `ActivityLog.changes` (`scores/route.ts:43-54,81-91`), contrary to proposal §10.3. The activity API returns them to any performance admin, including an employee who is an admin (`activity/route.ts:14-24`), and the global audit-logs page shows them too (`lib/settings/settings-pages.server.ts:14-19`). Tests: none. |
| F2 | Draft report: tiers, radar, trend, OKR attainment, gatekeeper, band, remarks | DONE | Content assembled in `report-builder.ts:47-145`; UI `PerformanceReport.tsx:54-82` with `CompetencyRadar`, `PerformanceTrend` (single point shows "More data needed", `PerformanceTrend.tsx:38-47`) and `OkrAttainmentSection` | Only the employee gets the report UI. Lead and HR never see the shared report, because `PerformanceReport` renders only when `!scores && report` (`ScoringWorkspace.tsx:272-287`). There is no `/evaluations/[id]` workspace page (proposal §9). Tests: none. |
| F3 | Acknowledge / dispute (comment required), dispute returns to CALIBRATION, `PERF_DISPUTE_RAISED` | PARTIAL | `acknowledge/route.ts`; `dispute/route.ts:26-48` (comment required, notifies LEAD and admins); UI requires a dispute comment (`PerformanceReport.tsx:42-50`); admin override accepted by the API (`finalize/route.ts:13-17`, `finalization.ts:55-58`) | **The admin override has no UI:** `CalibrationPanel.tsx:108` calls `finalize.mutate(undefined)`, so an unacknowledged draft cannot be finalized from the app. The lead and HR cannot see the acknowledgement status or the **dispute comment**: the evaluation GET does not include `acknowledgements`, and the only trace is 60-character metadata in the activity panel. The dispute transition skips `assertEvaluationTransition` (`dispute/route.ts:33`); the move is valid, but nothing guards it. Tests: none. |

### Epic G — Continuous Development Loop

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| G1 | Bottom-N improvement focus at finalize; next-anchor target; metric target text; ACTIVE / IMPROVED / DROPPED | PARTIAL | `finalization.ts:60-88` (`improvementFocusLimit`, ties handled by the cap, metric text) | **The focus lifecycle is missing.** `IMPROVED`/`DROPPED` are schema-only (`schema.prisma:2576`) and no code sets them. Focuses from earlier cycles stay ACTIVE forever, so they pile up on the dashboard and in every weekly nudge. Ranking uses raw `consolidated`, which assumes a 10-point scale. Tests: none. |
| G2 | Weekly score-free nudge, bundled, in-app + email, weekly step | DONE | `cron/performance-nudge/route.ts:17-66` (CRON_SECRET via `withCronAuth`, day gate, ISO-week idempotency via `PerformanceNudgeDelivery`, one bundled `emitNow`); event registered as WEEKLY (`events.ts:229`); email template (`lib/email/templates/index.ts:1308-1316`); deep link (`deep-link.ts:91`); step API (`focuses/[id]/weekly-step/route.ts`) | The step can only be logged from the dashboard, which the notification deep-links to. Because of the G1 gap, the nudge also bundles stale focuses. Tests: none (only an indirect email render fixture). |
| G3 | My Performance: sealed indicator, radar/trend after finalize, empty state | DONE | `PerformanceHome.tsx:61-89,121-123`; `me/route.ts:34-51` | The sealed banner only appears while the cycle is OPEN or CONSOLIDATING (`PerformanceHome.tsx:61-62`), and `CONSOLIDATING` is never set. History rows still show earlier finalized scores during an in-progress cycle. Tests: none. |

### Epic H — Reward & Outcome Engine

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| H1 | Configurable recommendation rules at finalize; never auto-executed; `PERF_ACTION_RECOMMENDED` | PARTIAL | `finalization.ts:16-37,90-131` (dedup; Ready produces salary, top bonus and promotion when improving; On Track produces a bonus; any criterion below the threshold produces training); notification to admins (`finalize/route.ts:40-52`); rules UI (`PerformanceSettingsPanel.tsx`) | Rules match the **literal band labels** `'Ready'`/`'On Track'` (`finalization.ts:105,126`), while band labels are HR-editable (`TemplateScoringSettings.tsx`). A renamed band silently produces no reward recommendations. Rules should key off band position or a band flag. "Improving" compares against the last finalized evaluation of **any** template. Tests: none. |
| H2 | Approval queue, required reason, audit trail visible in the evaluation log, HR edits detail | PARTIAL | `actions/[id]/route.ts:9-45` (transition table, reason required for APPROVED/REJECTED, `recordActivity` with `evaluationId`); ConfirmDialog queue (`ActionsWorkspace.tsx:24-111`) | The UI labels the note **"Optional"** and does not require it (`ActionsWorkspace.tsx:101-105`), but the server rejects approve and reject without one, so users hit an avoidable 400 toast. There is **no detail-editing UI** (`detailJson` is API-only), and action detail (such as the TRAINING criterion) is not displayed. Tests: none. |

### Cross-cutting

| ID | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| X1 | PerformanceSettings: all 5 fields persisted, read, and editable | DONE | `settings/route.ts:22-123`; readers: `consolidation.ts:107-152`, `finalization.ts:60-65,104`, `report-builder.ts:31-42`, `cron/performance-nudge/route.ts:21-34` | Tests: none. |
| X2 | Notifications: 6 `PERF_*` events with email templates and deep links | DONE | `lib/notifications/events.ts:93-98,224-229`; `dispatcher.ts:302-310`; `deep-link.ts:86-92`; `lib/email/templates/index.ts:1272-1316`; emit sites in open, submit, share-draft, dispute, finalize and cron | `redactable:false` on all six. Nothing tests that the payloads stay score-free. |
| X3 | Audit: every mutation writes ActivityLog | PARTIAL | Static invariant test passes (`app/api/performance/audit-coverage.test.ts`) | Sensitive score values are logged in `changes` (see F1). Template and library events are logged under `entityType: 'PERFORMANCE_SETTINGS'` (`templates/route.ts:69`, etc.), which makes the audit taxonomy misleading. |
| X4 | EXCUSED flow | PARTIAL | `excuse/route.ts`; state machine allows EXCUSED from any non-terminal status (`state-machine.ts:13-21`); close counts EXCUSED as complete (`close/route.ts:22`) | The UI gate differs from the server gate (`ScoringWorkspace.tsx:187` vs `excuse/route.ts:16`). Excused evaluations stay in `EvaluatorQueue`, even though the dialog copy says they are removed. Excusing is not blocked on a CLOSED cycle. |
| X5 | Evaluation activity panel | DONE | `activity/route.ts`; `EvaluationActivityPanel.tsx` | The payload includes `changes`, which the UI does not render (see F1). |
| X6 | Test coverage | PARTIAL (WEAK) | 4 tests total (see §1) | There are no unit tests for `scoring.ts`, `state-machine.ts`, `template-validation.ts`, `consolidation.ts`, `finalization.ts` or `report-builder.ts`, and no route tests. |
| X7 | Proposal §7.3 security release-blocker tests (blind evaluation, sealing, no inference, fail-closed) | MISSING | None exist | The F1 inference leak above is exactly the kind of bug these tests would catch. |

---

## 3. Gaps to fix (prioritised)

| # | Sev | Effort | Gap | Where |
|---|---|---|---|---|
| 1 | **High** | S | **Sealing inference leak:** the employee DTO exposes per-criterion `variance`/`flagged`, from which raw evaluator scores can be derived (exactly, for 2 evaluators). Strip them from the employee branch. | `app/api/performance/evaluations/[id]/route.ts:51` |
| 2 | **High** | M | **No security or scoring tests:** add the proposal §7.3 release-blocker suite (blind evaluation, sealed DTO, no inference, employee-admin), plus unit tests for `scoring.ts` (A4 AC1/AC2, E1, E4 ACs), `state-machine.ts`, `template-validation.ts` and `finalization.ts` rules. | `lib/performance/*.test.ts` (new) |
| 3 | **High** | S | **Raw scores in the audit log:** `PUT /scores` writes score and remark values into `ActivityLog.changes`, which reach admins (including the evaluated employee-admin) and the global audit-log page. Log only criterion ids and counts. | `scores/route.ts:43-54,81-91`; `activity/route.ts` |
| 4 | **Medium** | S | **H1 keyed to band labels:** renaming a band disables salary, bonus and promotion recommendations. Key the rules off band rank or a `rewardTier` flag. | `lib/performance/finalization.ts:105,126` |
| 5 | **Medium** | S | **Closed cycles are not read-only:** add a `cycle.status !== 'CLOSED'` guard to share-draft, finalize, calibration PUT, acknowledge, dispute, excuse and manual-actual. | `app/api/performance/evaluations/[id]/*` |
| 6 | **Medium** | M | **The culture block ignores the library:** read active `CriterionLibraryEntry` rows instead of `CULTURE_CRITERIA`; stop the insert and seed upserts from overwriting admin edits; align the library text with the Excel Tier 4 anchors. | `templates/[id]/culture-block/route.ts:33-61`; `prisma/seed-culture-library.ts:30-34`; `lib/performance/culture-library.ts` |
| 7 | **Medium** | S | **No finalize-override UI, and the dispute comment is invisible:** add an admin override-reason dialog; include `acknowledgements` (status and comment) in the lead/admin evaluation DTO and show them in `CalibrationPanel`. | `CalibrationPanel.tsx:104-110`; `evaluations/[id]/route.ts` |
| 8 | **Medium** | S | **The improvement-focus lifecycle is missing:** at finalize, retire (DROPPED/IMPROVED) the previous ACTIVE focuses for that employee; optionally let the employee or lead mark a focus improved. | `lib/performance/finalization.ts:66-88` |
| 9 | Medium | S | H2 UI/server mismatch on the reason: make the note required for approve and reject; add detail editing and show the detail. | `ActionsWorkspace.tsx:99-108` |
| 10 | Low | S | Lead and HR cannot view the shared or final report: render `PerformanceReport` for non-employee viewers when `evaluation.report` exists. | `ScoringWorkspace.tsx:272-287,375` |
| 11 | Low | S | Amharic anchors are never displayed: show `am` in the popover (both languages or a locale toggle) and in focus `targetText`. | `ScoringWorkspace.tsx:131-138`; `scoring.ts:113-115` |
| 12 | Low | S | EXCUSED polish: align the UI gate with admin-only, filter EXCUSED out of `EvaluatorQueue`, block excusing on closed cycles. | `ScoringWorkspace.tsx:187`; `EvaluatorQueue.tsx:13`; `excuse/route.ts` |
| 13 | Low | S | Metric rule bounds: validate that `maxScore` and inverse band scores are ≤ criterion `maxPoints`; add a `periodStart` lower bound to the check-in lookup. | `template-validation.ts:118-123`; `metric-resolver.ts:128-131` |
| 14 | Low | S | Builder: show an actual non-blocking warning on tier-sum mismatch; protect unsaved edits before a culture insert; show `publishedAt` in version history. | `TemplateBuilder.tsx:64-84,213-215`; `TemplatesWorkspace.tsx:79` |
| 15 | Low | S | D1 polish: add ←/→ cell navigation and flush dirty drafts on `visibilitychange`/`beforeunload`. | `ScoringWorkspace.tsx:221-241,413-421` |
| 16 | Low | S | Server-side band and gatekeeper validation on template POST and PATCH; add `assertEvaluationTransition` to consolidation and dispute; set or remove the unused `CONSOLIDATING` cycle state; remove the dead `isAutoPulled`. | `templates/route.ts`, `templates/[id]/route.ts`, `consolidation.ts`, `dispute/route.ts`, `schema.prisma` |

**Deploy prerequisites (from STATUS.md, still open):** run `prisma db push`, `scripts/seed-permissions.ts`, `db:seed:performance` and `db:seed:culture-library` on production.
