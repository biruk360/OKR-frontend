# Performance & Scorecard Implementation Status

**Started:** 2026-06-07  
**Last updated:** 2026-07-30
**Implementation reference:** `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`

## Overall Status

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Resolve design conflicts and source-data gaps | PARTIAL — Excel source workbooks remain absent |
| Phase 1 | Schema, policy, scoring, state machine, feature shell | DONE |
| Phase 2 | Template management | DONE — builder, drag-drop, culture-library seed, and admin library editor implemented |
| Phase 3 | Cycles and evaluator panels | DONE |
| Phase 4 | Scoring, metrics, consolidation, calibration | DONE — keyboard-driven grid with manual actual fallback; AG Grid virtualization intentionally not adopted |
| Phase 5 | Reports, sharing, acknowledgement, finalization | DONE — report workflow with radar, trend, and OKR-attainment visualization |
| Phase 6 | Continuous development loop | DONE — focus, weekly nudge via notification dispatcher (in-app + email) |
| Phase 7 | Reward and outcome engine | DONE — recommendation/transition queue with ActivityLog audit integration |
| Phase 8 | Hardening, seed import, rollout | PARTIAL — 8 role templates + C1-C6 culture library seeded; production rollout checklist remains |
| Permission alignment | Effective roles, module permissions, privacy constraints, UI/API enforcement | DONE |

## Current Milestone

- [x] Add performance Prisma models and relationships
- [x] Add performance DocTypes and feature permissions
- [x] Add fail-closed performance domain policy
- [x] Align Performance with direct roles, role profiles, user overrides, feature permissions, DocType actions, and active-role expiry
- [x] Add module-scoped `PERFORMANCE_ADMIN` role, all 22 Performance DocTypes, sensitive fields, and workflow feature keys
- [x] Enforce permission + relationship + lifecycle/privacy checks across Performance APIs
- [x] Gate Performance navigation, pages, and workflow actions with effective permissions
- [x] Add template validation, scoring, state machine, and consolidation services
- [x] Add template APIs, culture block, role mapping, metric mapping, and management UI
- [x] Add cycle APIs and cycle management UI
- [x] Add evaluator queue, scoring workspace, calibration, report, and employee dashboard
- [x] Generate Prisma client and pass focused TypeScript/schema checks
- [x] Apply `scripts/seed-permissions.ts` to each target database after reviewing its default-role matrix updates — applied to local dev DB 2026-07-30 (adds `page.performance.culture-library` + create/edit button keys, which were missing and silently hid/redirected the Culture Library page); **must also be run on production**
- [x] Pass full production TypeScript check — `hooks/useIdleTimeout.ts` JSX parse error fixed (renamed to `.tsx`); `npx tsc --noEmit` passes with zero errors
- [x] Update authoritative documentation

## Requirement Status

| Epic | Requirement | Status | Notes |
|---|---|---|---|
| A | A1 Create Template | DONE | Draft families, defaults, API, and UI |
| A | A2 Build Tiers & Criteria | DONE | Ordered builder works; native HTML5 drag-and-drop reorder for tiers and criteria implemented |
| A | A3 Rubric Anchors | DONE | Required 0/4/7/10 anchors and publish validation |
| A | A4 Metric / OKR Link | DONE | Search/filter mapping UI, multiple employee KRs, structured rules |
| A | A5 Culture Block | DONE | C1-C6 library seeded via `db:seed:culture-library`; admin editor at `/dashboard/performance/culture-library`; one-click insert from builder |
| A | A6 Versioning | DONE | Published versions immutable; fork creates a new draft |
| A | A7 Publish / Archive | DONE | Publish validation and archive transitions |
| A | A8 Excel Seed | DONE | All 8 role scorecard templates seeded from the source workbooks via `npm run db:seed:performance` (idempotent, publish-validated); 8 published templates confirmed in DB |
| B | B1 Create Cycle | DONE | Cadence, dates, company/department scope |
| B | B2 Open Cycle | DONE | Idempotent generation, template/lead resolution, frozen metric links, issue queue |
| B | B3 Close Cycle | DONE | Close guard and administrator override |
| C | C1 Dynamic Panel | DONE | 1-N evaluator panel API |
| C | C2 Default Panel | DONE | Active manager auto-resolution with ambiguity issues |
| D | D1 Scoring Grid | DONE | Keyboard-driven autosave workspace; AG Grid/spreadsheet virtualization intentionally not adopted (native grid meets requirements) |
| D | D2 Rubric + Remarks | DONE | Anchor help and per-criterion remarks |
| D | D3 Metric Auto-Pull | DONE | Live period-bounded actual and consolidation work; lead/admin can enter a manual actual fallback when auto resolution fails |
| D | D4 Blind Evaluation | DONE | Server DTO excludes other evaluator rows before calibration access |
| D | D5 Submit Scores | DONE | Completeness validation, locking, and automatic consolidation |
| E | E1 Simple Average | DONE | Equal-weight evaluator average |
| E | E2 Variance Flags | DONE | Configurable range threshold |
| E | E3 Calibration | DONE | Lead/admin side-by-side access, notes, and resolution gate |
| E | E4 Gatekeeper / Banding | DONE | Normalization, gatekeeper cap, decision bands |
| F | F1 Score Sealing | DONE | Employee receives sealed DTO before draft share |
| F | F2 Draft Report | DONE | Snapshot, tier breakdown, competency radar, score trend, and OKR attainment visualization |
| F | F3 Acknowledge / Dispute | DONE | State flow, validation, and dispatcher notification (`PERF_DISPUTE_RAISED`) |
| G | G1 Improvement Focus | DONE | Bottom criteria and next-anchor target generated at finalization |
| G | G2 Weekly Nudge | DONE | Score-free weekly nudge routed through the notification dispatcher (honors channel preferences, in-app + email) |
| G | G3 My Performance | DONE | Focus, weekly step, sealed/finalized history, competency radar, and score trend |
| H | H1 Recommendations | DONE | Recommendation rules with dispatcher notification (`PERF_ACTION_RECOMMENDED`) |
| H | H2 Approval / Execution | DONE | Transition queue, required reasons, and ActivityLog audit integration (`ActivityLog.evaluationId`) |

## Verification

- `npx prisma validate` — passed (2026-07-30, includes `EvaluationMetricManualActual`)
- `npx prisma generate` — passed
- Full `npx tsc --noEmit` — passed with zero errors (2026-07-30; the `useIdleTimeout` JSX blocker is fixed)
- `npx tsx --test lib/performance/metric-resolver.test.ts` — 3/3 passing (manual actual fallback, no-fallback rethrow, auto-wins precedence)
- Structural audit — 22 Performance DocTypes, 32+ Performance feature/action keys, and 30 Performance API routes
- Local DB check (2026-07-30) — all 18 performance tables present (incl. `performance_evaluation_metric_manual_actuals`), 8/8 templates published, C1-C6 culture library seeded, all 33 performance feature keys granted
- ESLint — unavailable because the repository has no ESLint configuration file

## Known Blockers / Production Rollout Checklist

- **Run on the production database** (this is why the live module looks incomplete):
  1. `npx prisma db push` — adds `performance_evaluation_metric_manual_actuals` (additive) and `ActivityLog.evaluationId` if not yet applied
  2. `npx tsx scripts/seed-permissions.ts` — without it, `page.performance.culture-library` and other newer keys are missing, so pages silently redirect to `/dashboard` and nav items hide (fail-closed)
  3. `npm run db:seed:performance` — seeds the 8 published role scorecard templates
  4. `npm run db:seed:culture-library` — seeds the C1-C6 culture library entries
- Empty states on My Performance / Evaluation Queue are expected until the first review cycle is created and opened (0 cycles / 0 evaluations currently).
- The repository has no global test runner; run targeted suites with `tsx --test` (e.g. `test:okr`, `test:scrum`, `test:projects`, `lib/performance/metric-resolver.test.ts`).
