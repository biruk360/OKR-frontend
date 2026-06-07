# Performance & Scorecard Implementation Status

**Started:** 2026-06-07  
**Last updated:** 2026-06-07  
**Implementation reference:** `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`

## Overall Status

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Resolve design conflicts and source-data gaps | PARTIAL — Excel source workbooks remain absent |
| Phase 1 | Schema, policy, scoring, state machine, feature shell | DONE |
| Phase 2 | Template management | PARTIAL — no drag-drop builder; culture library is inserted lazily |
| Phase 3 | Cycles and evaluator panels | DONE |
| Phase 4 | Scoring, metrics, consolidation, calibration | PARTIAL — functional keyboard grid, not AG Grid; no manual actual-resolution workflow |
| Phase 5 | Reports, sharing, acknowledgement, finalization | PARTIAL — report workflow works; radar/trend/OKR-attainment visualization remains |
| Phase 6 | Continuous development loop | PARTIAL — focus and bundled in-app nudge work; dispatcher/email integration remains |
| Phase 7 | Reward and outcome engine | PARTIAL — recommendation and transition queue work; ActivityLog integration remains |
| Phase 8 | Hardening, seed import, rollout | BLOCKED — Excel seed source absent; full build blocked by unrelated existing hook parse error |
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
- [ ] Apply `scripts/seed-permissions.ts` to each target database after reviewing its default-role matrix updates
- [ ] Pass full production build — blocked by pre-existing `hooks/useIdleTimeout.ts` JSX parse error
- [x] Update authoritative documentation

## Requirement Status

| Epic | Requirement | Status | Notes |
|---|---|---|---|
| A | A1 Create Template | DONE | Draft families, defaults, API, and UI |
| A | A2 Build Tiers & Criteria | PARTIAL | Ordered builder works; drag-drop is not implemented |
| A | A3 Rubric Anchors | DONE | Required 0/4/7/10 anchors and publish validation |
| A | A4 Metric / OKR Link | DONE | Search/filter mapping UI, multiple employee KRs, structured rules |
| A | A5 Culture Block | PARTIAL | C1-C6 library and one-click copy work; install-time seed/admin library editor remain |
| A | A6 Versioning | DONE | Published versions immutable; fork creates a new draft |
| A | A7 Publish / Archive | DONE | Publish validation and archive transitions |
| A | A8 Excel Seed | BLOCKED | Referenced Excel workbooks are not in the repository |
| B | B1 Create Cycle | DONE | Cadence, dates, company/department scope |
| B | B2 Open Cycle | DONE | Idempotent generation, template/lead resolution, frozen metric links, issue queue |
| B | B3 Close Cycle | DONE | Close guard and administrator override |
| C | C1 Dynamic Panel | DONE | 1-N evaluator panel API |
| C | C2 Default Panel | DONE | Active manager auto-resolution with ambiguity issues |
| D | D1 Scoring Grid | PARTIAL | Keyboard-driven autosave workspace; not AG Grid/spreadsheet virtualization |
| D | D2 Rubric + Remarks | DONE | Anchor help and per-criterion remarks |
| D | D3 Metric Auto-Pull | PARTIAL | Live period-bounded actual and consolidation work; unavailable actual has no manual resolution action |
| D | D4 Blind Evaluation | DONE | Server DTO excludes other evaluator rows before calibration access |
| D | D5 Submit Scores | DONE | Completeness validation, locking, and automatic consolidation |
| E | E1 Simple Average | DONE | Equal-weight evaluator average |
| E | E2 Variance Flags | DONE | Configurable range threshold |
| E | E3 Calibration | DONE | Lead/admin side-by-side access, notes, and resolution gate |
| E | E4 Gatekeeper / Banding | DONE | Normalization, gatekeeper cap, decision bands |
| F | F1 Score Sealing | DONE | Employee receives sealed DTO before draft share |
| F | F2 Draft Report | PARTIAL | Snapshot and tier breakdown work; radar, trend, and OKR attainment remain |
| F | F3 Acknowledge / Dispute | PARTIAL | State flow and validation work; dispatcher notification remains |
| G | G1 Improvement Focus | DONE | Bottom criteria and next-anchor target generated at finalization |
| G | G2 Weekly Nudge | PARTIAL | Score-free bundled in-app weekly nudge; email/dispatcher wiring remains |
| G | G3 My Performance | PARTIAL | Focus, weekly step, sealed/finalized history work; radar/trend remain |
| H | H1 Recommendations | PARTIAL | Recommendation rules work; recommendation notification remains |
| H | H2 Approval / Execution | PARTIAL | Transition queue and required reasons work; shared ActivityLog integration remains |

## Verification

- `npx prisma validate` — passed
- `npx prisma generate` — passed
- Targeted syntax transpilation across 64 Performance/permission files — passed with zero diagnostics
- Targeted TypeScript program across Performance/permission files — passed with zero diagnostics
- Structural audit — 22 Performance DocTypes, 32 Performance feature/action keys, and 29 Performance API routes
- Performance-scoped `git diff --check` — passed
- Full `npx tsc --noEmit` — blocked by pre-existing JSX in `hooks/useIdleTimeout.ts` (a `.ts` file)
- ESLint — unavailable because the repository has no ESLint configuration file

## Known Blockers

- The two Excel scorecard source files required by A8 are absent.
- The repository currently has no automated unit-test runner configured.
- The shared `ActivityLog` model has no performance entity foreign key, so H2 audit integration requires a cross-cutting schema extension.
- Full TypeScript/build verification is blocked by the unrelated `hooks/useIdleTimeout.ts` parse error.
- The permission seed was not executed against the current database because it intentionally updates the system-wide default role matrix.
