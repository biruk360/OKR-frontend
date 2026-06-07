# Performance & Scorecard Module Implementation Proposal

**Source requirements:** `../../docs/performance_scorecard_module_requirements_detailed.md`
**Application references reviewed:** `docs/MASTER_REFERENCE.md`, `docs/COMPONENT_CATALOG.md`
**Prepared:** 2026-06-07

## 1. Executive Recommendation

Implement Performance & Scorecards as a new, self-contained `performance` feature module rather than extending the existing reports page. The module has its own lifecycle, privacy boundary, permissions, scoring engine, audit requirements, and employee-facing experience.

Use the existing platform patterns:

- Next.js App Router pages under `app/dashboard/performance/`
- REST endpoints under `app/api/performance/`
- A feature barrel under `features/performance/`
- Prisma models in `prisma/schema.prisma`
- TanStack Query hooks and a typed fetch client
- Existing shared UI primitives: `PageHeader`, `Modal`, `ConfirmDialog`, `EmptyState`, `StatCard`, and `StatGrid`
- Existing notification dispatcher, email delivery, cron security, permission registry, and activity log
- Recharts for radar and trend charts
- AG Grid Community for the keyboard-driven evaluator scoring grid

The implementation should be delivered in phases. The minimum usable release is Epics A-F. Epics G-H should follow after the core review lifecycle and privacy controls are proven.

## 2. Requirements That Need Resolution Before Implementation

The detailed requirements are strong, but several points conflict with the current data model or with each other. The implementation should adopt the following decisions.

### 2.1 Published Templates Must Always Be Immutable

Requirement A6 allows editing a published template in place when there are no active evaluations. That can still alter historical finalized evaluations referencing the template.

**Decision:** Any edit to a `PUBLISHED` template always creates a new `DRAFT` version. Published and archived versions are immutable.

This guarantees that every evaluation can render the exact definition used when it was opened.

### 2.2 Add a Template Family

Versioned templates need a stable identity across versions. Name alone is not sufficient because names can change and uniqueness rules become unclear.

**Decision:** Introduce `ScorecardTemplateFamily`, with each `ScorecardTemplate` representing one immutable version in that family.

Example:

```text
Software Engineer family
  - Version 1, ARCHIVED
  - Version 2, PUBLISHED
  - Version 3, DRAFT
```

Only one published version per family should be current for new cycles.

### 2.3 Do Not Link a Reusable Template Directly to One Employee's KR

Requirement A4 stores `keyResultId` on a reusable scorecard criterion. Existing `KeyResult` records belong to individual users. Linking a shared Software Engineer template criterion to one concrete KR would make every Software Engineer evaluation read the same person's KR.

**Decision:** Separate the metric definition from the employee-specific KR binding:

- Template criterion stores unit, target, aggregation, and structured scoring rule.
- `MetricSourceMapping` maps a criterion plus an employee to one or more KRs.
- `EvaluationMetricSource` snapshots the resolved KR links when the cycle opens.
- Consolidation snapshots actual values and source details so finalized reports do not change later.

Employees with unresolved required metric mappings should be listed as cycle-open issues for HR resolution.

### 2.4 Use Structured Scoring Rules

Do not execute or parse free-form expressions such as `min(10, actual/target*10)`.

**Decision:** Store a validated JSON rule:

```json
{ "type": "LINEAR_CAPPED", "maxScore": 10 }
```

or:

```json
{
  "type": "INVERSE_BANDS",
  "bands": [
    { "maxActual": 0, "score": 10 },
    { "maxActual": 1, "score": 5 },
    { "maxActual": null, "score": 0 }
  ]
}
```

The UI may display the equivalent friendly formula, but the server scoring engine must use validated rule types only.

### 2.5 Define Period-Bounded KR Actuals

`KeyResult.currentValue` is live and not period-bounded. The requirements also say the review cycle period bounds metric actuals.

**Decision for v1:**

- Resolve the latest `KeyResultCheckIn.value` whose `asOfDate <= cycle.periodEnd`.
- If no qualifying check-in exists, use `KeyResult.currentValue` and mark the source as a fallback.
- For multiple KRs, apply `SUM`, `AVG`, or `LATEST` to those resolved end-of-period values.
- Snapshot the resolved values at consolidation.

If period change rather than end-of-period value is needed later, add an explicit metric rule for delta calculation.

### 2.6 Lock Rubric Criteria to a 10-Point Scale in v1

Requirements A2 and A3 conflict: criteria can have editable `maxPoints`, but rubric anchors are fixed at 0/4/7/10.

**Decision:** In v1, `RUBRIC` criteria always have `maxPoints = 10`. Metric criteria may also default to 10. Supporting arbitrary rubric maxima requires proportional anchor scaling and should be a later enhancement.

### 2.7 Rename `BI_MONTHLY`

`BI_MONTHLY` can mean twice per month or every two months.

**Decision:** Use `EVERY_TWO_MONTHS` if that is the intended cadence. If twice monthly is intended, use `SEMI_MONTHLY`. Do not store the ambiguous value.

### 2.8 Multiple Active Managers Need an Explicit Rule

The system supports matrix reporting, and `ManagerRelationship` does not identify a primary manager.

**Decision for v1:**

- One active manager: assign as `LEAD`.
- No active manager: create a `NO_LEAD` cycle-open issue.
- Multiple active managers: create an `AMBIGUOUS_LEAD` issue and require HR selection.

A future organization-wide `isPrimary` manager field can remove this ambiguity.

### 2.9 Report Synthesis Is Deterministic in v1

The requirements ask for synthesized evaluator remarks but do not specify AI behavior.

**Decision:** Build a deterministic, HR-editable consolidated summary grouped by criterion and tier. Do not add AI generation to the privacy-sensitive report flow in v1.

### 2.10 Performance Authorization Must Fail Closed

The existing permission system provides useful DocType and feature permissions, but some current wrappers fall back or fail open when permission resolution errors occur. Score sealing and blind evaluation cannot rely on that behavior.

**Decision:** Add a dedicated fail-closed `performance-policy.ts` and explicit response DTO serializers. Performance endpoints must never return raw Prisma objects containing sealed fields.

## 3. Proposed Architecture

### 3.1 Directory Structure

```text
features/performance/
├── components/
│   ├── templates/
│   ├── cycles/
│   ├── evaluations/
│   ├── reports/
│   ├── growth/
│   └── actions/
├── hooks/
│   └── queries.ts
├── services/
│   └── api.ts
├── types.ts
└── index.ts

lib/performance/
├── policy.ts
├── state-machine.ts
├── template-validation.ts
├── template-versioning.ts
├── cycle-opening.ts
├── metric-resolver.ts
├── scoring.ts
├── consolidation.ts
├── report-builder.ts
├── finalization.ts
├── improvement-focus.ts
├── recommendations.ts
├── notifications.ts
└── audit.ts
```

Pages remain thin composition layers. Business transitions and scoring logic belong in `lib/performance/`.

### 3.2 Recommended Dependencies

- Use existing `ag-grid-community` and `ag-grid-react` for the scoring grid.
- Use existing `recharts` for radar and trend charts.
- Add `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` for accessible template-builder ordering.
- Use existing `zod` for request and JSON configuration validation.
- Add a test runner, preferably Vitest, because no automated unit-test harness currently exists.

### 3.3 Shared Components to Reuse or Add

Reuse from the component catalog:

- `PageHeader` for every performance workspace
- `Modal` for create/edit forms and remarks
- `ConfirmDialog` for publish, archive, close-cycle override, remove evaluator, and action transitions
- `EmptyState` for no cycles, no assignments, no reports, and no focuses
- `StatCard` and `StatGrid` for cycle and employee summaries
- `ActivityLogPanel` after adding performance evaluation activity support

Add reusable components:

- `RechartsWrapper`: standardized responsive chart container with loading, empty, and error states
- `WorkflowStatusBadge`: performance lifecycle status pill
- `PermissionGate`: UI-only action visibility backed by `/api/permissions/me`

The server remains authoritative even when `PermissionGate` hides actions.

## 4. Proposed Data Model

All status values can follow the repository's current string-stored enum convention.

### 4.1 Configuration and Templates

#### `PerformanceSettings`

Singleton configuration:

- `varianceThreshold` default `3`
- `improvementFocusLimit` default `2`
- `remarkAttributionEnabled` default `false`
- `weeklyNudgeDay`
- `recommendationRulesJson`
- `createdAt`, `updatedAt`

#### `ScorecardTemplateFamily`

- `id`
- `name`
- `roleLabel`
- `isActive`
- `createdById`
- timestamps

#### `ScorecardTemplate`

- `id`
- `familyId`
- `version`
- `status`: `DRAFT | PUBLISHED | ARCHIVED`
- `maxTotal`
- `gatekeeperJson`
- `bandsJson`
- `createdById`
- `forkedFromId`
- `publishedAt`
- `archivedAt`
- timestamps

Constraints:

- Unique `(familyId, version)`
- Published versions are immutable
- At most one current `PUBLISHED` version per family, enforced in service logic

#### `ScorecardTier`

- `id`
- `templateId`
- `name`
- `position`
- `maxPoints`

Constraint: unique `(templateId, position)`.

#### `ScorecardCriterion`

- `id`
- `tierId`
- `libraryEntryId` optional provenance only
- `type`: `RUBRIC | METRIC`
- `code` optional, such as `C1`
- `title`
- `position`
- `maxPoints`
- `weight`
- `anchorJson` nullable
- `unit` nullable
- `periodLabel` nullable
- `target` nullable
- `scoringRuleJson` nullable
- `krAggregation` nullable

Constraint: unique `(tierId, position)`.

#### `CriterionLibraryEntry`

- `id`
- `code`
- `name`
- `version`
- `type`
- `definitionJson`
- `isActive`
- timestamps

Templates copy library content. `libraryEntryId` is provenance, not a live reference.

#### `TemplateRoleMapping`

Maps a normalized designation and optional department to a template family:

- `id`
- `designationKey`
- `departmentId` optional
- `familyId`
- `priority`
- `isActive`

#### `EmployeeTemplateAssignment`

Explicit override:

- `id`
- `employeeId`
- `familyId`
- `effectiveFrom`
- `effectiveTo`
- `assignedById`

#### `MetricSourceMapping`

Employee-specific source mapping:

- `id`
- `criterionId`
- `employeeId`
- `keyResultId`
- `position`
- timestamps

Constraint: unique `(criterionId, employeeId, keyResultId)`.

### 4.2 Review Cycles and Evaluations

#### `ReviewCycle`

- `id`
- `name`
- `cadence`
- `periodStart`
- `periodEnd`
- `status`: `PLANNED | OPEN | CONSOLIDATING | CLOSED`
- `allCompany`
- `createdById`
- `openedAt`
- `closedAt`
- `closedById`
- `closeOverrideReason`
- timestamps

#### `ReviewCycleDepartment`

- `cycleId`
- `departmentId`

Used when `allCompany = false`.

#### `ReviewCycleIssue`

Persists opening and lifecycle problems:

- `id`
- `cycleId`
- `employeeId` optional
- `evaluationId` optional
- `type`: `NO_TEMPLATE | NO_LEAD | AMBIGUOUS_LEAD | METRIC_SOURCE_MISSING | ACTUAL_UNAVAILABLE`
- `detailJson`
- `status`: `OPEN | RESOLVED | WAIVED`
- `resolvedById`
- timestamps

#### `Evaluation`

- `id`
- `cycleId`
- `templateId`
- `employeeId`
- `status`: `ASSIGNED | IN_PROGRESS | CONSOLIDATED | CALIBRATION | DRAFT_SHARED | FINALIZED | EXCUSED`
- `maxTotal`
- `rawTotal`
- `normalized`
- `gatekeeperPass`
- `decisionBand`
- `startedAt`
- `consolidatedAt`
- `draftSharedAt`
- `finalizedAt`
- `excusedAt`
- `excusedReason`
- timestamps

Constraints:

- Unique `(cycleId, employeeId)`
- Evaluation always references one immutable published template version

#### `EvaluationMetricSource`

Snapshots the employee-specific KR links at cycle opening:

- `id`
- `evaluationId`
- `criterionId`
- `keyResultId`
- `keyResultTitleSnapshot`
- `position`

#### `EvaluatorAssignment`

- `id`
- `evaluationId`
- `evaluatorId`
- `role`: `LEAD | EVALUATOR`
- `status`: `PENDING | SUBMITTED`
- `submittedAt`
- timestamps

Constraints:

- Unique `(evaluationId, evaluatorId)`
- Exactly one lead enforced transactionally before scoring can start
- Employee cannot evaluate self

#### `EvaluatorScore`

- `id`
- `evaluationId`
- `evaluatorId`
- `criterionId`
- `score`
- `remark`
- `isAutoPulled`
- `lockedAt`
- timestamps

Constraint: unique `(evaluationId, evaluatorId, criterionId)`.

Rubric and manual metric scores are stored here. Auto metric values should be presented in the grid but resolved once by the metric service to avoid redundant conflicting values.

#### `CriterionResult`

- `id`
- `evaluationId`
- `criterionId`
- `consolidated`
- `variance`
- `flagged`
- `actualValue` nullable
- `actualSourceJson` nullable
- `calibrationNote` nullable
- `resolvedAt` nullable
- `resolvedById` nullable

Constraint: unique `(evaluationId, criterionId)`.

`actualSourceJson` freezes the KR values and fallback behavior used at consolidation.

#### `EvaluationReport`

- `id`
- `evaluationId`
- `version`
- `status`: `DRAFT | SHARED | FINAL`
- `contentJson`
- `generatedAt`
- `sharedAt`
- `finalizedAt`

This freezes exactly what was shared with the employee. A dispute can create a new report version after recalibration.

#### `EvaluationAcknowledgement`

- `id`
- `evaluationId`
- `status`: `PENDING | ACKNOWLEDGED | DISPUTED`
- `comment`
- `acknowledgedAt`
- timestamps

Constraint: one active acknowledgement per shared report version, or include `reportId` if multiple versions must retain separate responses.

### 4.3 Growth and Outcomes

#### `ImprovementFocus`

- `id`
- `evaluationId`
- `employeeId`
- `criterionId`
- `currentLevel`
- `targetText`
- `status`: `ACTIVE | IMPROVED | DROPPED`
- `weeklyStep`
- timestamps

#### `DevelopmentAction`

- `id`
- `evaluationId`
- `type`
- `detailJson`
- `recommendedBy`
- `status`: `RECOMMENDED | APPROVED | REJECTED | EXECUTED`
- `decisionReason`
- `approvedById`
- `executedById`
- timestamps

### 4.4 Existing Models to Extend

#### `User`

Add back-relations for all performance ownership and assignment models.

#### `KeyResult`

Add back-relations for `MetricSourceMapping` and `EvaluationMetricSource`.

#### `ActivityLog`

Add `evaluationId` and performance activity actions, or introduce a generic `entityId`. The lower-risk change is an optional `evaluationId` relation plus a dedicated evaluation activity endpoint.

#### Permission Registry

Add DocTypes:

- `scorecard_template`
- `review_cycle`
- `evaluation`
- `evaluator_assignment`
- `evaluator_score`
- `criterion_result`
- `evaluation_report`
- `improvement_focus`
- `development_action`

Add feature keys:

- `module.performance`
- `page.performance.my`
- `page.performance.evaluations`
- `page.performance.cycles`
- `page.performance.templates`
- `page.performance.actions`
- `page.performance.settings`

## 5. State Machines and Core Transactions

### 5.1 Template Lifecycle

```text
DRAFT -> PUBLISHED -> ARCHIVED
   \-> delete allowed only when never published and unused
```

Editing a published or archived version creates a new draft in the same family.

Publish runs all validation in one transaction and archives the previously current published version only after the new version passes validation.

### 5.2 Review Cycle Lifecycle

```text
PLANNED -> OPEN -> CONSOLIDATING -> CLOSED
```

Opening a cycle must be idempotent:

1. Resolve in-scope active employees.
2. Resolve explicit assignment, then designation/department role mapping.
3. Pin the latest published template.
4. Create evaluation if `(cycleId, employeeId)` does not exist.
5. Resolve manager panel.
6. Snapshot metric sources.
7. Persist all unresolved issues.
8. Emit notifications after the transaction commits.

Closing a cycle validates finalization. A close-anyway action requires a reason and audit entry.

### 5.3 Evaluation Lifecycle

```text
ASSIGNED
  -> IN_PROGRESS
  -> CONSOLIDATED
  -> CALIBRATION -> CONSOLIDATED
  -> DRAFT_SHARED
  -> CALIBRATION (employee dispute)
  -> DRAFT_SHARED (new report version)
  -> FINALIZED
```

`EXCUSED` is a terminal administrative state.

All transitions must be implemented in `lib/performance/state-machine.ts`. API routes call transition functions rather than setting status directly.

### 5.4 Submission and Consolidation

Evaluator submission transaction:

1. Verify caller is assigned and not already submitted.
2. Verify every rubric/manual metric criterion has a valid score.
3. Lock caller's scores.
4. Mark assignment submitted.
5. If every assignment is submitted, run consolidation.
6. Create or replace `CriterionResult` rows.
7. Calculate variance, totals, gatekeeper, normalized score, and decision band.
8. Set evaluation to `CALIBRATION` if any result is flagged; otherwise `CONSOLIDATED`.
9. Notify lead after commit.

### 5.5 Draft Sharing and Finalization

Draft sharing:

1. Verify evaluation is consolidated and all flags are resolved.
2. Generate deterministic report content.
3. Store an immutable `EvaluationReport` version.
4. Set evaluation to `DRAFT_SHARED`.
5. Create pending acknowledgement.
6. Notify employee.

Finalization:

1. Require acknowledgement or explicit HR override.
2. Mark report and evaluation final.
3. Generate improvement focuses.
4. Generate development-action recommendations.
5. Audit and notify after commit.

## 6. Scoring Engine

Implement scoring as pure functions in `lib/performance/scoring.ts` and `consolidation.ts`.

Required functions:

- `validateBands(bands)`
- `validateGatekeeper(gatekeeper, tiers)`
- `scoreMetric(actual, target, rule)`
- `resolveNextAnchor(score, anchorJson)`
- `mean(scores)`
- `varianceRange(scores)`
- `calculateTierSubtotals(results)`
- `calculateNormalized(rawTotal, maxTotal)`
- `resolveDecisionBand(normalized, gatekeeperPass, bands)`

Rules:

- Reject non-finite values.
- Clamp only when the configured rule explicitly calls for it.
- Round display values to two decimals in one shared helper.
- Preserve unrounded values during calculation to avoid accumulated rounding error.
- Never silently convert an unavailable metric actual to zero.
- Store the consolidation-time metric source snapshot.

## 7. Privacy and Authorization Design

### 7.1 Access Layers

Use both:

1. Coarse feature and DocType permissions from the existing permission registry.
2. A fail-closed domain policy for actor-, relationship-, and state-dependent access.

Suggested policy functions:

- `canManageTemplates(actor)`
- `canManageCycle(actor, cycle)`
- `canManagePanel(actor, evaluation)`
- `canScoreEvaluation(actor, evaluation)`
- `canViewCalibration(actor, evaluation)`
- `canShareDraft(actor, evaluation)`
- `canViewEmployeeReport(actor, evaluation)`
- `canManageDevelopmentAction(actor, action)`

### 7.2 Mandatory DTOs

Create separate serializers:

- `toEvaluatorQueueDto`
- `toEvaluatorGridDto`
- `toLeadCalibrationDto`
- `toHrEvaluationDto`
- `toEmployeeSealedStatusDto`
- `toEmployeeSharedReportDto`

Employee serializers must never include:

- `EvaluatorScore`
- raw evaluator remarks
- calibration notes
- pre-share `CriterionResult`
- pre-share totals, normalized score, gatekeeper, or decision band

Blind evaluation serializers must never include another evaluator's score before consolidation.

### 7.3 Security Tests Are Release Blockers

The following tests must pass before any rollout:

- Evaluator A cannot retrieve evaluator B's pre-consolidation scores.
- Employee cannot retrieve any score or band before `DRAFT_SHARED`.
- Employee never retrieves raw evaluator scores after sharing.
- Employee never retrieves calibration notes.
- Unauthorized users cannot infer sealed values from list endpoints, counts, exports, or notifications.
- Permission resolver failure returns `403`/`500`, never protected performance data.

## 8. API Proposal

All endpoints use the standard `{ success, data?, error?, pagination? }` envelope and `withAuth`. Performance authorization is checked inside each route with fail-closed domain policies.

### 8.1 Templates and Mappings

```text
GET/POST   /api/performance/templates
GET/PATCH  /api/performance/templates/[id]
POST       /api/performance/templates/[id]/fork
POST       /api/performance/templates/[id]/publish
POST       /api/performance/templates/[id]/archive
PUT        /api/performance/templates/[id]/builder
POST       /api/performance/templates/[id]/insert-culture
GET        /api/performance/templates/[id]/versions
GET/PUT    /api/performance/template-mappings
GET/PUT    /api/performance/metric-mappings
GET        /api/performance/criterion-library
```

Use one transactional builder-save endpoint rather than many small tier/criterion endpoints. This prevents partially saved ordering and subtotal states.

### 8.2 Cycles and Evaluations

```text
GET/POST   /api/performance/cycles
GET/PATCH  /api/performance/cycles/[id]
POST       /api/performance/cycles/[id]/open
POST       /api/performance/cycles/[id]/close
GET        /api/performance/cycles/[id]/issues
POST       /api/performance/cycles/[id]/issues/[issueId]/resolve

GET        /api/performance/evaluations
GET        /api/performance/evaluations/[id]
PUT        /api/performance/evaluations/[id]/panel
PUT        /api/performance/evaluations/[id]/scores
POST       /api/performance/evaluations/[id]/submit
GET        /api/performance/evaluations/[id]/calibration
PUT        /api/performance/evaluations/[id]/calibration
POST       /api/performance/evaluations/[id]/share-draft
POST       /api/performance/evaluations/[id]/acknowledge
POST       /api/performance/evaluations/[id]/dispute
POST       /api/performance/evaluations/[id]/finalize
GET        /api/performance/evaluations/[id]/report
GET        /api/performance/evaluations/[id]/activity
```

`PUT /scores` should accept a batch of changed cells and upsert only the caller's unlocked scores.

### 8.3 Employee Growth and Actions

```text
GET        /api/performance/me
PUT        /api/performance/focuses/[id]/weekly-step
GET        /api/performance/actions
PATCH      /api/performance/actions/[id]
GET/PUT    /api/performance/settings
POST       /api/cron/performance-nudge
```

## 9. Page and Navigation Proposal

Add a `Performance` navigation group, filtered by feature permissions:

```text
/dashboard/performance                         My Performance
/dashboard/performance/evaluations             Evaluator queue
/dashboard/performance/evaluations/[id]/score  Scoring grid
/dashboard/performance/evaluations/[id]        Evaluation workspace/report
/dashboard/performance/cycles                  HR cycle management
/dashboard/performance/cycles/[id]             Cycle detail and issues
/dashboard/performance/templates               Template management
/dashboard/performance/templates/[id]          Template builder/version history
/dashboard/performance/calibration             Lead/HR calibration queue
/dashboard/performance/actions                 Reward/development action queue
/dashboard/settings/performance                Performance settings
```

### 9.1 Key UI Components

#### Templates

- `TemplateList`
- `TemplateEditorModal`
- `TemplateBuilder`
- `TierEditor`
- `CriterionEditor`
- `RubricAnchorEditor`
- `MetricRuleEditor`
- `TemplateValidationPanel`
- `TemplateVersionHistory`
- `RoleMappingManager`
- `MetricMappingManager`

#### Cycles and Panels

- `CycleList`
- `CreateCycleModal`
- `CycleWorkspace`
- `CycleIssueList`
- `EvaluatorPanelEditor`
- `EvaluationStatusSummary`

#### Evaluations

- `EvaluatorQueue`
- `ScoringGrid`
- `RubricAnchorPopover`
- `CriterionRemarkModal`
- `MetricSourceCell`
- `CalibrationGrid`

Use AG Grid Community for `ScoringGrid`:

- Arrow and Enter navigation
- Numeric cell validation
- Read-only metric rows
- Tier grouping and subtotal rows
- Debounced batch autosave
- Unsaved/saving/saved indicator
- Submitted state locks all editable cells

#### Reports, Growth, and Actions

- `PerformanceReport`
- `TierBreakdown`
- `CompetencyRadar`
- `PerformanceTrend`
- `OkrAttainmentPanel`
- `AcknowledgementPanel`
- `ImprovementFocusCard`
- `WeeklyStepEditor`
- `DevelopmentActionQueue`
- `DevelopmentActionModal`

## 10. Notifications, Email, Cron, and Audit

### 10.1 Notification Changes

Add a `PERFORMANCE` category and events:

- `PERF_CYCLE_OPENED`
- `PERF_PANEL_COMPLETE`
- `PERF_DRAFT_SHARED`
- `PERF_DISPUTE_RAISED`
- `PERF_WEEKLY_FOCUS`
- `PERF_ACTION_RECOMMENDED`

Extend:

- Event key and category unions
- Event metadata
- Recipient routing
- Email templates
- Deep links
- Notification preference/default screens
- Redaction rules

`PERF_WEEKLY_FOCUS` must be bundled and score-free. Its payload schema should not permit score, rank, normalized result, gatekeeper, or band fields.

### 10.2 Cron

Add `POST /api/cron/performance-nudge`, secured by `CRON_SECRET`.

The job must:

- Select active focuses for active employees
- Bundle all focuses into one message per employee
- Avoid duplicate delivery for the same employee and week
- Allow weekly-step links without exposing scores

Add a delivery ledger or deterministic weekly idempotency key.

### 10.3 Audit

Audit at minimum:

- Template create, fork, publish, and archive
- Cycle create, open, close, and override close
- Panel changes and submitted-score deletion confirmation
- Consolidation and calibration resolution
- Draft share, acknowledgement, dispute, and finalization
- Development action recommendation, approval, rejection, and execution

Do not log sealed score values into broadly visible activity metadata.

## 11. Epic-by-Epic Delivery Plan

### Phase 0: Requirement Decisions and Source Data

Resolve:

- `EVERY_TWO_MONTHS` versus `SEMI_MONTHLY`
- v1 rubric fixed 10-point scale
- multiple-manager handling
- deterministic report synthesis
- metric source mapping workflow
- exact recommendation rules

Obtain the two Excel workbooks referenced by A8. They are not currently present in the repository.

### Phase 1: Foundation

Delivers:

- Core Prisma models and indexes
- Performance settings
- DocTypes, feature keys, and fail-closed policy
- Feature directory, typed API client, Query hooks, navigation shell
- State machine, template validation, scoring engine, and unit tests
- Activity and notification extension points

Supports: foundation for all epics.

### Phase 2: Template Management

Delivers Epic A:

- Template families and immutable versions
- Tier/criterion drag-drop builder
- Rubric anchors and culture library
- Structured metric rules
- Role mappings and employee metric mappings
- Publish/archive validation
- Version history
- Idempotent Excel seed script once source workbooks are available

Exit criteria:

- A valid template can be created, published, forked, archived, and mapped.
- A published version cannot be mutated.

### Phase 3: Cycles and Evaluator Panels

Delivers Epics B-C:

- Cycle CRUD and department scope
- Idempotent cycle opening
- Evaluation generation
- Default manager panel resolution
- Persistent issue queue
- Dynamic panel management with exactly one lead
- Evaluator queue and cycle notifications

Exit criteria:

- Opening the same cycle twice creates no duplicates.
- Every skipped or unresolved employee has a visible issue.

### Phase 4: Scoring, Metrics, Consolidation, and Calibration

Delivers Epics D-E:

- AG Grid evaluator experience
- Rubric popovers and remarks
- Debounced autosave
- Metric source resolution
- Blind evaluation DTOs
- Submit and score locking
- Simple-average consolidation
- Variance flags and calibration notes
- Gatekeeper, normalization, and banding

Exit criteria:

- Scoring math acceptance cases pass.
- Blind evaluation and score-sealing security tests pass.

### Phase 5: Reports, Sharing, and Finalization

Delivers Epic F:

- Immutable report snapshots
- Radar, trend, OKR attainment, tier breakdown, and deterministic summaries
- Draft sharing
- Employee acknowledgement/dispute
- Recalibration and report version regeneration
- Finalization

This completes the minimum usable release.

### Phase 6: Continuous Development

Delivers Epic G:

- Improvement focus generation
- Next-anchor target selection
- Score-free My Performance dashboard between cycles
- Weekly step updates
- Idempotent weekly focus cron and bundled notifications

### Phase 7: Reward and Outcome Engine

Delivers Epic H:

- Configurable recommendation rules
- Recommendation generation on finalization
- HR action queue
- Approve/reject/execute workflow
- Full activity audit

Start with recommendations only. Do not integrate payroll execution in v1.

### Phase 8: Hardening and Rollout

- Import and validate the eight Excel templates
- Seed production permissions and feature flags
- Backfill role and metric mappings
- Run a pilot cycle for a small department
- Perform privacy/security review
- Verify performance with realistic employee/panel counts
- Update master reference, component catalog, sitemap, feature status, cron docs, notification docs, and changelog

## 12. Requirement Coverage Matrix

| Requirement | Proposed implementation |
|---|---|
| A1 Create Scorecard Template | `ScorecardTemplateFamily` plus versioned `ScorecardTemplate`, template form, bands/gatekeeper validation, and `scorecard_template` create permission |
| A2 Build Tiers & Criteria | Transactional builder-save API, `ScorecardTier`, `ScorecardCriterion`, dnd-kit ordering, live totals, and mismatch validation |
| A3 Rubric Anchors | Required bilingual-capable `anchorJson`, four-anchor editor, scoring popover, and next-anchor focus resolver |
| A4 Metric with OKR Link | Structured metric definition plus employee-specific `MetricSourceMapping` and cycle-pinned `EvaluationMetricSource` |
| A5 Culture Value Block | Versioned `CriterionLibraryEntry` seed plus copy-on-insert culture block action |
| A6 Template Versioning | Immutable published versions grouped by `ScorecardTemplateFamily`, with fork and version history |
| A7 Publish / Archive | Transactional publish validation, archive transition, and published-only cycle selection |
| A8 Seed from Excel | Idempotent seed/import script after the referenced workbooks are supplied |
| B1 Create Review Cycle | `ReviewCycle`, department scope join, validated dates, and explicit unambiguous cadence |
| B2 Open Cycle | Idempotent cycle-opening service, employee/template resolution, pinned templates/sources, issue queue, and notifications |
| B3 Close Cycle | Finalization check, close-anyway reason, read-only closed state, and audit event |
| C1 Dynamic Panel | `EvaluatorAssignment`, panel editor, exactly-one-lead transaction validation, and submitted-score removal confirmation |
| C2 Default Panel | Active-manager resolution with no-lead and ambiguous-lead issues |
| D1 Scoring Grid | AG Grid keyboard scoring, tier subtotals, validation, debounced batch autosave, and read-only metric rows |
| D2 Rubric + Remarks | Anchor popover, per-criterion private remark modal, and deterministic report-summary input |
| D3 Metric Auto-Pull | Period-aware metric resolver, read-only source display, consolidation-time refresh, and frozen source snapshot |
| D4 Blind Evaluation | Actor-specific evaluator DTO that returns only the caller's pre-consolidation score rows |
| D5 Submit Scores | Completeness validation, assignment submission lock, and last-submitter consolidation transaction |
| E1 Simple Average | Pure consolidation service creating `CriterionResult`, tier totals, raw total, and normalized score |
| E2 Variance Flagging | Configurable range threshold, `flagged` result field, and automatic calibration routing |
| E3 Calibration | Lead/HR calibration grid, required notes, resolution fields, and employee-hidden DTO fields |
| E4 Gatekeeper / Banding | Pure gatekeeper, normalization, and ordered-band resolver with failed-gate cap |
| F1 Score Sealing | Fail-closed performance policy and employee sealed-status DTO with no score fields |
| F2 Consolidated Report | Immutable `EvaluationReport` snapshot with tier breakdown, radar, trend, OKR attainment, and summary |
| F3 Acknowledge / Dispute | `EvaluationAcknowledgement`, acknowledgement/dispute endpoints, recalibration transition, and notification |
| G1 Improvement Focus | Finalization service selecting bottom criteria and resolving next rubric anchor or metric target text |
| G2 Weekly Growth Nudge | Idempotent score-free weekly cron, bundled performance notification, and weekly-step update |
| G3 My Performance | State-aware employee dashboard showing sealed state, focuses, radar, and trend |
| H1 Recommendation Generation | Configurable pure recommendation rules run once during finalization |
| H2 Approval / Execution | `DevelopmentAction` queue, guarded transitions, required reasons, and activity audit |

## 13. Verification Strategy

### 13.1 Unit Tests

Highest-priority pure logic tests:

- Template publish validation
- Band ordering and coverage
- Structured metric scoring
- Multiple-KR aggregation
- Missing/archived KR handling
- Simple average and range variance
- Tier totals, normalization, gatekeeper, and band cap
- Next rubric anchor selection
- Evaluation state transitions
- Recommendation rules

### 13.2 Integration Tests

- Published-template immutability and version fork
- Cycle opening idempotency and issue generation
- Exactly-one-lead enforcement
- No self-evaluation
- Autosave writes only caller-owned score rows
- Last submission triggers consolidation once
- Consolidation snapshots metric actuals
- Dispute creates recalibration flow
- Finalization generates focus and action records once
- Weekly nudge idempotency

### 13.3 Authorization and Privacy Tests

Treat these as release blockers:

- Evaluator blind scoring
- Employee score sealing
- Raw remark and calibration-note exclusion
- Lead versus non-lead calibration access
- HR action permissions
- Fail-closed behavior when permission resolution fails
- No sealed values in notification, audit, export, or list payloads

### 13.4 UI Acceptance Tests

- Keyboard scoring and focus movement
- Invalid score feedback
- Autosave restore after reload
- Read-only metric rows with source links
- Drag-drop order persistence
- Publish validation display
- Employee sealed and shared states
- Radar/trend empty and single-point states

## 14. Deployment and Data Considerations

- Production uses PostgreSQL and `prisma db push`, not migration history.
- Update `scripts/preflight.sql` for any required compatibility checks.
- Make seed scripts idempotent and safe to rerun.
- Seed permission registry additions before enabling navigation.
- Keep the performance feature hidden behind `module.performance` until schema, seed, and privacy tests pass.
- Cycle opening, consolidation, finalization, and cron jobs must be idempotent.
- Add indexes for all queue and lifecycle queries, especially:
  - evaluation `(cycleId, status)`
  - evaluation `(employeeId, status)`
  - evaluator assignment `(evaluatorId, status)`
  - criterion result `(evaluationId, flagged)`
  - improvement focus `(employeeId, status)`
  - development action `(status, type)`

## 15. Main Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Score leakage through generic API includes | Critical privacy breach | Fail-closed policy plus explicit actor-specific DTOs |
| Reusable criterion linked to one concrete KR | Incorrect employee scores | Employee-specific metric mappings and evaluation snapshots |
| Published template mutation | Historical reports change | Immutable published versions |
| Live KR values change after consolidation | Reports become inconsistent | Snapshot actual and source details at consolidation |
| Permission system fallback behavior | Unauthorized access | Performance routes never use fail-open wrappers |
| Cycle-open partial failures | Missing or duplicate evaluations | Idempotent transaction plus persistent issue queue |
| Ambiguous manager relationships | Wrong lead evaluator | Flag multiple-manager cases for HR |
| Free-form scoring formulas | Security and correctness risk | Structured, validated rule types |
| Missing Excel source workbooks | A8 cannot be verified | Obtain source files before seed implementation |
| No current automated test harness | Regression risk | Add Vitest and prioritize scoring/privacy tests |

## 16. Recommended First Implementation Slice

Build a vertical slice before implementing every screen:

1. Foundation schema and permission policy.
2. Create and publish one rubric-only template.
3. Create and open one cycle for one department.
4. Auto-assign one manager as lead.
5. Score one evaluation in the keyboard grid.
6. Submit, consolidate, apply gatekeeper/band, and calibrate.
7. Share a sealed employee report and acknowledge it.

This slice proves the highest-risk architecture: immutable definitions, state transitions, score math, blind evaluation, and employee score sealing. After it works end to end, add metric KR bindings, bulk cycle handling, growth nudges, and rewards.
