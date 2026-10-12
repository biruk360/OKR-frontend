# Employee Operating Package — Requirements

**Status:** BUILT — pending deploy (2026-10-11, `operating-package` worktree). Schema push, `npm run db:seed:package-permissions`, crontab reinstall and the I1/I2 data scripts are still to run on prod.

| Section | Status | Notes |
|---|---|---|
| FND foundations (lock guards, progress span, recurrence, Todo kind) | BUILT | QUARTERLY/SEMIANNUAL recurrence; `recurrenceCountsProgress` has no API/UI toggle yet |
| KRX KR extensions + checkpoints + definition | BUILT | Direction-aware check-ins and clone; checkpoints on KR page + quick view |
| LNK OKR links | BUILT | `/api/okr-links`, LinkManagerModal; hard deletes clean links + lineage |
| CON connections | BUILT | Detail pages, quick views, Explorer rows, profile tree, KPI/duty/development views; batched endpoint not built |
| ROL role definition | BUILT | Seat → user matched by title (no link column) |
| DUT recurring duties | BUILT | Monthly nth-weekday timing only honoured for the first due date |
| KPI | BUILT | KPI-3 auto-fill + KPI-5 via cron; KPI-8 filter; KPI-9 performance source (live mapping) |
| DEV development plan | BUILT (partial) | Evidence file upload and DEV-7 metric pending; link kept in `evidenceNote` |
| DEP dependencies + Dependency Map | BUILT | CSV, graphs, DEP-4 completion offer |
| DEC decisions | BUILT (partial) | DEC-4 comments pending a schema decision |
| PKG package header + review | BUILT | HR cannot approve (open question 3 reading) |
| PRF profile surfaces | BUILT (partial) | PRF-12 PDF pending (Phase 6); Explorer List owner chip pending |
| IMP importer + FY25/26 close | BUILT | Scripts; not run against prod |
| PERM permissions | BUILT | Seed not yet run (local Postgres was down during integration) |
| NTF notifications | BUILT | PACKAGE category, 11 events, package-daily cron |
| AUD audit | BUILT | `lib/package/audit.ts`; ActivityLogPanel labels |

**Owner:** Biruk (product) · Claude (spec) · implementer TBD
**Date:** 2026-10-11 · **Version:** 0.1
**Module:** OKR + People (new sub-module `package`)
**Source data:** `data-import/*.xlsx` — the FY 2026/27 Company OKR (v4) and nine employee Operating Packages
**Related specs:** `okr_period_close_and_rollover_requirements.md` (close + lineage), `recurring_subtasks_REQUIREMENTS.md` (recurrence), `okr_quick_view_modals_REQUIREMENTS.md` (quick views), `PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md` (scorecards)

**Legend:** **[V]** verified in code on 2026-10-11 · **[A]** assumption to confirm · **[N]** new.
**ID prefixes:** `FND` foundations · `LNK` OKR links · `KRX` KR extensions · `DUT` recurring duties · `ROL` role definition · `KPI` KPIs · `DEV` development plan · `DEP` dependencies · `DEC` decisions · `PKG` package header + review · `PRF` profile surfaces · `CON` connections (links/dependencies visibility) · `IMP` importer · `PERM` permissions · `NTF` notifications · `AUD` audit.

---

## 0. Why this exists

The FY 2026/27 plan is not only OKRs. Each employee has an **Operating Package**, and its README defines these parts:

| Bucket (workbook definition) | Meaning |
|---|---|
| Key Result | A measurable change that can fail. C = committed (100% expected), A = aspirational (70% = success). Not tied to pay. |
| Milestone | A dated one-time deliverable proving progress on a KR. |
| Task | A step, planned in two-week sprints in the OKR system. |
| KPI | A standard held every week; quarterly averages feed the performance review (50% weight). |
| Recurring duty | Work on a fixed cadence — an auto-generated recurring task and part of the role. |
| Development (mandatory) | ≥1 certification or course and ≥40 training hours this year; 15% of the performance score. |
| Links | Inbound dependencies (clear first) and outbound commitments (others wait on this). |
| Decisions needed | Items waiting on a CEO decision (Decision Log IDs D01–D78). |
| Role definition | Seat, reports to, direct reports, purpose, accountabilities. |

The system supports only part of this today. This spec adds the missing parts. Every part is shown on the **employee's profile page** and on a new **employee OKR profile**, and each item shows its links and dependencies.

### 0.1 Sheet → feature map

| Workbook sheet | Rows (FY26/27) | Today [V] | This spec |
|---|---|---|---|
| Company OKR / OKR | 59 objectives, 245 KRs | Objective, KeyResult | `KRX` (C/A, baseline/target text, checkpoints), `FND-1` externalRef |
| "Linked company KR" / "Lands in" | ~245 links | Objective→objective parent only, same timeframe | `LNK` `CONTRIBUTES_TO` |
| FY25-26 Carry-Forward | 50 rows | `rolledFromId`, one successor, same type only | `LNK` `SUCCEEDS` (n:m, cross-type, typed) |
| Milestones | 290 | Project `Milestone` needs a project phase | Initiatives (`Todo` + `keyResultId`), flagged `kind=MILESTONE` (`FND-4`) |
| Tasks | 141 | Todo child tasks (one level) | Child `Todo` under the milestone initiative |
| Recurring Duties | 166 | Todo recurrence (no QUARTERLY, no event-driven duties) | `DUT` — new `RecurringDuty` that drives Todo series |
| KPIs | 96 | Nothing. The "Tagged as KPI" filter is a dead stub [V] | `KPI` — new `Kpi` + `KpiReading` |
| Development Plan | ~55 | `DevelopmentAction` is an HR outcome, not a plan [V] | `DEV` — new `DevelopmentItem` |
| Role Definition | ~9 × 20 rows | `User.designation` only [V] | `ROL` — new `RoleDefinition` |
| Dependency Map / Links / Dependencies | 66 company + package-specific X-ids | Projects `ActivityDependency` only [V] | `DEP` — new `WorkDependency` |
| Decisions for the CEO / Decision Log / Decisions Needed | 78 | Nothing | `DEC` — new `Decision` |
| Performance Review weights | 9 | Scorecard templates (Performance module) | `PKG-4` stored on the package; Performance integration in `KPI-9` / `DEV-7` |
| Review: Agree / Dispute columns | every sheet | Nothing | `PKG-5` item review |
| Hiring & Promotions, Revenue Bridge, Campaigns, Bonus & Commission, Rhythm & Reviews, Source Coverage, Traceability | — | — | **Out of scope** (§12). These stay in the workbooks. |

---

## 1. Current implementation [V]

- **Objective / KeyResult:** these already have the close lifecycle (`closureStatus`, `outcome`, `finalGrade`, `OkrRetrospective`) and single-successor lineage (`rolledFromId`, `lineageRootId`). A KR has `targetValue > startValue > = 0` enforced (`lib/keyResultNumbers.ts:18-23`), so a decreasing metric cannot be entered.
- **Alignment:** `Objective.parentObjectiveId` only. The parent must be ACTIVE and in the **same timeframe** (`app/api/objectives/route.ts:248-258`). There is no KR→KR or objective→KR alignment.
- **Initiatives:** `Todo` with `keyResultId` / `objectiveId`, `progressValue`, and a one-level `parentId`. Recurrence rules are DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY | YEARLY (`lib/todos/recurrence.ts:21-28`). The generator cron runs daily at 01:00 UTC (`lib/todos/recurrence-generator.ts`). Each completed occurrence re-adds `progressValue` to the KR (bug, `:248-251`).
- **Employee profile:** `/dashboard/org/users/[id]` is the canonical profile. It has no tabs: a sidebar plus sections for objectives & KRs, initiatives, and check-ins. It is loaded by `loadUserProfile` (`features/admin-org/services/org-pages.server.ts:265-519`) and filtered per item by OKR visibility. `/dashboard/profile` redirects to it.
- **Per-person OKR view:** none exists. `/dashboard/my-okrs` shows the viewer only. The Explorer has no `?owner=` param, although `/api/okr-hierarchy` accepts `owner=` (`route.ts:63,91`).
- **Alignment UI:** tree (`OkrHierarchyTable`), map (`ExplorerMapView`, React Flow `OKRHierarchy`), and `RolledFromBanner`. The KR detail page does not show linked project milestones.
- **RBAC:** doctypes are registered by idempotent seed scripts (pattern: `scripts/seed-scrum-permissions.ts`). The scope engine (`lib/apply-scope.ts`) has **no direct-report operator**; direct-report scope is coded per module (`features/scrum/services/access.ts`, `lib/okr/visibility-scope.ts:53-113`).
- **Known bugs that this spec depends on:**
  - The objective and KR create routes do not check `isLocked`.
  - Objective progress uses `current/target` and ignores `startValue` (`lib/objectiveProgress.ts:93-96`).

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Group everything under an **Operating Package**: one header per employee per timeframe. Items belong to the employee and timeframe directly; the header holds status, version, weights and review. | Matches the workbooks, and lets the profile show "FY 2026/27 package — v2 — in review". Items still work if no header exists. |
| D2 | Milestones and tasks stay **initiatives** (`Todo`), not Project milestones. | Project `Milestone` requires a project phase. Initiatives already roll up to KRs and appear on boards, calendar and scrum. |
| D3 | A **recurring duty is a definition**, not a Todo. When `autoTask` is set, it owns a Todo recurrence head. | Duties are part of the role and must show on the profile even when no task is generated. Their cadences (QUARTERLY, PER_BID, PER_RELEASE…) exceed what Todo recurrence can express. |
| D4 | Add **QUARTERLY** and **SEMIANNUAL** to Todo recurrence. Event-driven cadences produce no tasks automatically; instead the duty has a "Log occurrence" action. | 30 duties are quarterly. About 30 are event-driven. |
| D5 | KPIs are a **new first-class entity** with periodic readings. They are not KRs. | KPIs are held, not achieved; putting them in KRs would distort OKR scores. The workbooks score them separately (50%). |
| D6 | KPIs **feed** the Performance module through `MetricSourceMapping` with a new `sourceType = 'KPI'`; scorecard criteria are not duplicated. | METRIC criteria are already per-role KPIs in Performance [V]. This avoids two sources of truth. |
| D7 | One generic **`OkrLink`** table covers both lineage (`SUCCEEDS`) and cross-level alignment (`CONTRIBUTES_TO`). `rolledFromId` stays and is set for the primary successor. | The FY25/26→FY26/27 mapping is n:m and cross-type. Individual objectives align to company KRs, not objectives. Existing banner and lineage code keeps working. |
| D8 | Dependencies are **company-level records** (`WorkDependency`). "Inbound" and "outbound" are derived per person and not stored. | The package "Links" sheets are generated from one company Dependency Map; storing per-person copies would fork them. |
| D9 | Person-relationship access (self / direct report / department / all) is coded in one module helper, `features/package/services/access.ts`, following the Scrum pattern. | The scope engine cannot express direct reports [V]. |
| D10 | Every new entity has `externalRef` (e.g. `EDN-K03`, `DEP14`, `D46`), unique per timeframe. | Makes the importer idempotent and re-runnable as the workbooks are revised (they are DRAFT v2/v4). |

---

## 3. Data model [N]

All string enums follow the repo convention (strings, not Prisma enums). Every model gets `createdAt`, `updatedAt` and `@@map` snake_case. The sketches below show fields only.

### 3.1 Foundations (`FND`)

| ID | Requirement |
|---|---|
| FND-1 | Add `externalRef String?` to `Objective`, `KeyResult`, `Todo`, and to every new model below. Unique on `(timeframeId, externalRef)` where the model has a timeframe; for `Todo`, unique on `(keyResultId, externalRef)`. |
| FND-2 | Add the lock check to `POST /api/objectives` (a parent must not be CLOSED) and to `POST /api/keyresults` (the objective must not be locked → 423). |
| FND-3 | Objective progress must use `(current − start) / (target − start)` per KR, the same formula as KR progress (`lib/objectiveProgress.ts:93-96`). |
| FND-4 | Add `Todo.kind String @default("TASK")` with values TASK \| MILESTONE \| DUTY \| DEPENDENCY. The profile and KR views group by kind. |
| FND-5 | Recurrence: add `QUARTERLY` (every 3 months) and `SEMIANNUAL` (every 6 months) to `lib/todos/recurrence.ts`, using the month-step and anchor-day logic MONTHLY uses. |
| FND-6 | Recurrence bug: generated occurrences must copy `progressValue = null` unless the head sets `recurrenceCountsProgress = true` (new, default false). |

### 3.2 OKR links (`LNK`)

```prisma
model OkrLink {
  id            String   @id @default(cuid())
  fromType      String   // OBJECTIVE | KEY_RESULT
  fromId        String
  toType        String   // OBJECTIVE | KEY_RESULT
  toId          String
  kind          String   // SUCCEEDS | CONTRIBUTES_TO
  subKind       String?  // SUCCEEDS: CARRIED | REFRAMED | SUPERSEDED | MERGED | SPLIT
  isPrimary     Boolean  @default(false) // primary successor (mirrors rolledFromId)
  note          String?  // ≤500
  createdById   String
  @@unique([fromType, fromId, toType, toId, kind])
  @@index([toType, toId])
}
```

- **Direction:** `from` is the newer or lower item and `to` is the older or higher item. For example, "FY26/27 C5 SUCCEEDS FY25/26 4WCHWG" and "EDN-O1 CONTRIBUTES_TO company KR1.3".
- **LNK-1:** `SUCCEEDS` may cross timeframes. `CONTRIBUTES_TO` must be in the same timeframe.
- **LNK-2:** When a `SUCCEEDS` link with `isPrimary` is created between two items of the same type, also set `rolledFromId`, `lineageRootId` and `lineageDepth` on the newer item, so `RolledFromBanner` keeps working.
- **LNK-3:** Creating a `CONTRIBUTES_TO` link does **not** change progress roll-up. Roll-up stays governed by `alignmentType` and `parentObjectiveId`.
- **LNK-4:** When an individual objective is linked to a company KR and has no parent, it may set `parentObjectiveId` to that KR's objective (the user chooses; the importer does this by default).

### 3.3 KR extensions (`KRX`)

| Field on `KeyResult` | Type | Purpose |
|---|---|---|
| `commitment` | String? COMMITTED \| ASPIRATIONAL \| MIXED | C / A / C/A |
| `direction` | String @default("INCREASE") INCREASE \| DECREASE | Allows "< 5 a week", "−15% cost" |
| `baselineText` | String? | "38% of qualified bids (sales-team figure, Sep 2026)" |
| `targetText` | String? | The full compound target as written |
| `measuredBy` | String? | Data source / KPI ids |
| `dueText` / `dueDate` | String? / DateTime? | "Measured Q2; scored Q3 and Q4" |

```prisma
model KeyResultCheckpoint {
  id          String   @id @default(cuid())
  keyResultId String
  label       String   // "Q2", "Q3", "Q4"
  dueDate     DateTime
  targetText  String
  targetValue Float?
  actualValue Float?   // filled at the checkpoint review
  status      String   @default("PENDING") // PENDING | MET | MISSED
  @@index([keyResultId, dueDate])
}
```

- **KRX-1:** When `direction = DECREASE`, `keyResultNumbers` accepts `target < start`, and progress is computed as `(start − current) / (start − target)`.
- **KRX-2:** When `commitment = ASPIRATIONAL`, the KR shows "70% = success". Close-flow outcome suggestion: progress ≥ 0.7 → ACHIEVED.
- **KRX-3:** The KR detail page and quick view show the checkpoints as a strip (Q2 · Q3 · Q4), with each one's status, and the next checkpoint in the KR row on the profile.
- **KRX-4:** Show `baselineText`, `targetText` and `measuredBy` in a "Definition" section of the KR detail and quick view. They are editable by the KR owner and managers.

### 3.4 Recurring duties (`DUT`)

```prisma
model RecurringDuty {
  id             String    @id @default(cuid())
  externalRef    String?   // RD-W1
  ownerId        String
  timeframeId    String
  packageId      String?
  title          String
  cadence        String    // DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | SEMIANNUAL | YEARLY | EVERY_SPRINT | EVENT
  eventLabel     String?   // when cadence = EVENT: "per bid", "per release", "per project"…
  timingText     String?   // "By 10:00", "Fixed slot", "First Saturday"
  durationMin    Int?      // 30
  outputText     String?   // "Bid register entries"
  keyResultId    String?   // optional link
  objectiveId    String?
  autoTask       Boolean   @default(true)
  todoHeadId     String?   @unique // the Todo recurrence head this duty owns
  status         String    @default("ACTIVE") // ACTIVE | PAUSED | RETIRED
  startsOn       DateTime?
  endsOn         DateTime? // default = timeframe end
  collaborators  RecurringDutyCollaborator[] // userId[] ("With")
}
```

| ID | Requirement |
|---|---|
| DUT-1 | When a duty is created with `autoTask = true` and a calendar cadence, the system creates a Todo head: `kind=DUTY`, `recurrenceRule` mapped from the cadence, `dueDate` = the next occurrence (from `startsOn` + `timingText` if parseable, otherwise the next working day), `recurrenceEndsAt = endsOn`, assignee = owner, members = collaborators, and `keyResultId`/`objectiveId` copied. |
| DUT-2 | `EVERY_SPRINT` uses the BIWEEKLY rule anchored on the first sprint start. **[A]** The two-week sprint calendar (S1 starts Mon 12 Oct 2026) is fixed company-wide. |
| DUT-3 | `EVENT` cadence never creates a head. The duty card shows a **Log occurrence** button that creates a one-off Todo (`kind=DUTY`, linked to the duty), due today by default. |
| DUT-4 | Editing cadence, timing or end date updates the head in one transaction. Pausing archives the head (no generation); resuming restores it with `dueDate` = the next future occurrence (no backfill). Retiring archives the head and stops the series. |
| DUT-5 | Duty adherence: for each duty, completed occurrences ÷ generated occurrences over the last 30 and 90 days, shown on the duty card and the profile summary. |
| DUT-6 | Deleting a duty is allowed only when it has no completed occurrences; otherwise it can only be retired. |
| DUT-7 | Generated occurrences carry `progressValue = null` (FND-6) so duties never inflate KR progress. |
| DUT-8 | Company rhythm items (e.g. "Saturday management meeting", chaired by the CEO) are duties owned by the chair, with attendees as collaborators. **[A]** No separate "meeting" entity is needed. |

### 3.5 Role definition (`ROL`)

```prisma
model RoleDefinition {
  id            String    @id @default(cuid())
  userId        String
  timeframeId   String?
  packageId     String?
  seatTitle     String    // "Bid Lead, Strategic Pursuits & Senior Sales Engineer"
  reportsToId   String?   // User
  reportsToText String?   // when the manager is a seat, not a person
  purpose       String
  effectiveFrom DateTime?
  status        String    @default("DRAFT") // DRAFT | APPROVED | SUPERSEDED
  approvedById  String?
  approvedAt    DateTime?
  items         RoleDefinitionItem[]
}
model RoleDefinitionItem {
  id               String @id @default(cuid())
  roleDefinitionId String
  section          String // ACCOUNTABILITY | DIRECT_REPORT_SEAT | DECISION_RIGHT | INTERFACE | OTHER
  text             String
  position         Int
}
```

| ID | Requirement |
|---|---|
| ROL-1 | A user has at most one APPROVED role definition per timeframe. Approving a new one marks the previous one SUPERSEDED, and earlier versions stay readable. |
| ROL-2 | When a role definition is approved, `seatTitle` is **offered** (not forced) as the new `User.designation`. |
| ROL-3 | `reportsToId` is shown against `ManagerRelationship`. If they differ, show a warning chip "Reporting line differs from org chart". It never auto-edits the org chart. |
| ROL-4 | Planned direct-report seats (e.g. "Presales Lead (30 Nov 2026)") are items. A seat is shown as **Vacant** until it is linked to a user via `ManagerRelationship`. |

### 3.6 KPIs (`KPI`)

```prisma
model Kpi {
  id             String   @id @default(cuid())
  externalRef    String?  // EDN-K03
  ownerId        String
  timeframeId    String
  packageId      String?
  name           String   // "Win rate"
  kpiType        String   // LEADING | LAGGING
  definition     String
  formula        String?
  dataSource     String?
  unit           String   // %, ETB, count, days, x
  direction      String   @default("INCREASE") // INCREASE | DECREASE | RANGE
  baselineText   String?
  baselineValue  Float?
  targetText     String
  targetValue    Float?   // primary numeric target; null = text-only, scored manually
  targetMin      Float?   // RANGE
  targetMax      Float?
  thresholdAmber Float?   // % of target that counts as amber (default 0.9)
  frequency      String   // WEEKLY | MONTHLY | QUARTERLY
  scoredFrom     DateTime? // "scored from Q3"
  keyResultId    String?  // optional link
  isSensitive    Boolean  @default(false) // e.g. quota/commission KPIs
  status         String   @default("ACTIVE") // ACTIVE | RETIRED
  note           String?
  readings       KpiReading[]
}
model KpiReading {
  id          String   @id @default(cuid())
  kpiId       String
  periodStart DateTime
  periodEnd   DateTime
  value       Float?
  valueText   String?  // compound KPIs ("100%; 100%; 100%; ≥30 qualified")
  rag         String?  // GREEN | AMBER | RED — computed, overridable by manager
  note        String?
  source      String   @default("MANUAL") // MANUAL | KR | IMPORT
  enteredById String
  @@unique([kpiId, periodStart])
}
```

| ID | Requirement |
|---|---|
| KPI-1 | Reading periods follow `frequency`: weekly (Mon–Sun), calendar month, or fiscal quarter. One reading per period; editing a reading is logged. |
| KPI-2 | RAG is computed from `direction`, target and `thresholdAmber`. Before `scoredFrom` the reading is shown as **Measured (not scored)**. |
| KPI-3 | A KPI linked to a KR may set `source = KR`. The reading is then auto-filled from the KR's `currentValue` at period end by the daily cron, and the owner can override it. |
| KPI-4 | The KPI card shows the latest value, target, RAG, a sparkline of the last 12 readings, and the quarter-to-date average. |
| KPI-5 | **Missing reading:** a period that ended more than 3 working days ago without a reading shows "Reading overdue" and triggers `NTF-KPI-DUE` (§9). |
| KPI-6 | Compound KPIs (several sub-targets in one row) are stored as one KPI with `valueText` and a manual RAG. The importer flags them for splitting later; splitting is optional. |
| KPI-7 | `isSensitive` KPIs (quota, commission base) are visible only to the owner, their manager chain, and holders of `package.kpi.sensitive.read` (Finance, Executive, Admin). |
| KPI-8 | Wire up the dead "Tagged as KPI" Analyze filter (`features/filters/segments.ts:44`): either remove it, or repoint it to "KRs linked to a KPI". **[A]** Repoint. |
| KPI-9 | **Performance integration:** add `sourceType = 'KPI'` and `kpiId` to `MetricSourceMapping`. `metric-resolver` uses the quarter's KPI average as the criterion actual. No KPI data is copied into Performance. |

### 3.7 Development plan (`DEV`)

```prisma
model DevelopmentItem {
  id             String    @id @default(cuid())
  externalRef    String?   // DV1
  ownerId        String
  timeframeId    String
  packageId      String?
  title          String    // "Hardware/IoT architecture certification"
  kind           String    // CERTIFICATION | COURSE | TRAINING_HOURS | MENTORING | OTHER
  targetText     String    // "Certified", "Completed", "40 hours"
  targetHours    Float?
  hoursLogged    Float     @default(0)
  dueDate        DateTime?
  keyResultId    String?
  status         String    @default("NOT_STARTED") // NOT_STARTED | IN_PROGRESS | DONE | DROPPED
  completedAt    DateTime?
  evidenceNote   String?
  isMandatory    Boolean   @default(false)
}
```

| ID | Requirement |
|---|---|
| DEV-1 | Evidence (certificate PDF or image) is attached using the existing attachment storage pattern (`CommentAttachment` / `TodoAttachment` handling). **[A]** A comment thread on the item is enough; there is no separate attachment table. |
| DEV-2 | Marking an item DONE requires an evidence note or attachment when `kind` is CERTIFICATION or COURSE. Approval by the manager is optional (`PKG-5`). |
| DEV-3 | The profile shows the yearly rule: "≥1 certification or course and ≥40 training hours" as two progress bars (items done, hours logged). The rule values come from `OrganizationSettings` (`devMinItems`, `devMinHours`), defaulting to 1 and 40. |
| DEV-4 | Status ≠ DONE after `dueDate` → overdue chip, and `NTF-DEV-DUE` 14 days before the due date. |
| DEV-5 | Dropping an item requires a reason (≥10 characters) and is logged. |
| DEV-6 | Development items are **not** `DevelopmentAction`s (HR outcomes such as salary or promotion), and the two are never merged. |
| DEV-7 | Performance integration: on-time DONE items ÷ mandatory items is exposed as a metric (`sourceType='DEVELOPMENT'`) for a scorecard criterion. **[A]** Phase 5 or later. |

### 3.8 Work dependencies (`DEP`)

```prisma
model WorkDependency {
  id            String   @id @default(cuid())
  externalRef   String?  // DEP14, X03
  timeframeId   String
  title         String   // "World Bank project map: every active IDA/IBRD-financed project…"
  depType       String   // DECISION | POLICY | HIRE | ASSET | DATA | SYSTEM | BUDGET | OTHER
  neededByDate  DateTime?
  unblocksText  String?  // free text as in the sheet
  status        String   @default("OPEN") // OPEN | IN_PROGRESS | DONE | BLOCKED | DROPPED
  doneAt        DateTime?
  note          String?
  providers     WorkDependencyParty[]  // role = PROVIDER ("Owner (delivers)")
  // needers are also WorkDependencyParty rows, role = NEEDER ("Needed by (people)")
  links         WorkDependencyLink[]
  decisionId    String?  // when depType = DECISION, link to the Decision
  deliveryTodoId String? @unique // optional Todo for the provider
}
model WorkDependencyParty {
  id           String @id @default(cuid())
  dependencyId String
  userId       String
  role         String // PROVIDER | NEEDER
  @@unique([dependencyId, userId, role])
}
model WorkDependencyLink {
  id           String @id @default(cuid())
  dependencyId String
  entityType   String // OBJECTIVE | KEY_RESULT | TODO | KPI | DUTY | DEVELOPMENT
  entityId     String
  @@unique([dependencyId, entityType, entityId])
  @@index([entityType, entityId])
}
```

| ID | Requirement |
|---|---|
| DEP-1 | For each person, **Inbound** = dependencies where they are a NEEDER ("clear first"). **Outbound** = dependencies where they are a PROVIDER ("others wait on this"). Both are derived; nothing is stored per person. |
| DEP-2 | A dependency is **late** when `status ∉ {DONE, DROPPED}` and `neededByDate < today`, and **due soon** when it is due within 7 days. |
| DEP-3 | Any linked entity whose inbound dependency is late shows a **Blocked by DEPxx** chip, and its quick view lists the blockers (`CON-2`). The KR's confidence is **not** changed automatically; the owner gets a nudge (`NTF-DEP-LATE`). |
| DEP-4 | Optional "Create delivery task": creates a Todo (`kind=DEPENDENCY`) for the first provider, due on `neededByDate`, linked back through `deliveryTodoId`. Completing the Todo offers to mark the dependency DONE (it does not set it automatically). |
| DEP-5 | Marking a dependency DONE notifies every NEEDER (`NTF-DEP-DONE`) and clears the blocked chips. |
| DEP-6 | A company Dependency Map page lists all dependencies, with filters for status, type, provider, needer, due window and linked company KR. It can be exported to CSV. |
| DEP-7 | Package-specific links (X-ids) are ordinary dependencies with the same model, distinguished only by `externalRef` prefix. |

### 3.9 Decisions (`DEC`)

```prisma
model Decision {
  id              String   @id @default(cuid())
  externalRef     String?  // D46
  timeframeId     String
  title           String
  requestedById   String?
  requestedByText String?  // "Meklit (structure)"
  deciderId       String   // default: CEO
  neededBy        DateTime?
  batch           String?  // "16 Oct", "30 Oct"
  optionsText     String?  // options / recommendation
  unblocksText    String?
  status          String   @default("OPEN") // OPEN | DECIDED | DEFERRED | WITHDRAWN
  decisionText    String?
  decidedAt       DateTime?
  links           DecisionLink[] // entityType + entityId, like WorkDependencyLink, incl. USER
}
```

| ID | Requirement |
|---|---|
| DEC-1 | The decider sees an **Awaiting my decision** list grouped by batch and sorted by `neededBy`. Overdue items are flagged. |
| DEC-2 | Recording a decision requires `decisionText` and stamps `decidedAt`. It notifies the requester and every linked user (`NTF-DEC-DECIDED`), and marks linked `WorkDependency` rows of type DECISION as DONE (they can be reopened). |
| DEC-3 | Each person's profile shows **Decisions affecting me**: decisions linked to them or their items, with status. |
| DEC-4 | Only the decider, Executive or Admin can record or change a decision. Anyone who can view a decision can comment on it (using the existing `Comment` pattern). |

### 3.10 Operating package header and review (`PKG`)

```prisma
model OperatingPackage {
  id            String   @id @default(cuid())
  userId        String
  timeframeId   String
  version       String   // "v2"
  status        String   @default("DRAFT") // DRAFT | IN_REVIEW | APPROVED | ARCHIVED
  seatTitle     String?
  summaryJson   Json?    // "The numbers this package commits to" lines
  weightsJson   Json?    // { kpis: 50, values: 20, okr: 15, development: 15 }
  sourceFile    String?  // workbook filename imported from
  submittedAt   DateTime?
  approvedById  String?
  approvedAt    DateTime?
  @@unique([userId, timeframeId])
}
model PackageItemReview {
  id          String   @id @default(cuid())
  packageId   String
  entityType  String   // OBJECTIVE | KEY_RESULT | TODO | KPI | DUTY | DEVELOPMENT | ROLE_ITEM | DEPENDENCY
  entityId    String
  verdict     String   // AGREE | DISPUTE
  comment     String?  // required when DISPUTE
  reviewerId  String
  resolvedAt  DateTime?
  resolution  String?
  @@unique([packageId, entityType, entityId, reviewerId])
}
```

| ID | Requirement |
|---|---|
| PKG-1 | Lifecycle: DRAFT → IN_REVIEW (the manager or HR sends it to the employee) → APPROVED (the manager approves once every DISPUTE is resolved) → ARCHIVED when the timeframe closes. |
| PKG-2 | In IN_REVIEW, the employee can mark each item Agree or Dispute (a comment is mandatory for Dispute), which replaces the yellow workbook columns. The package shows "n of m reviewed · k disputes open". |
| PKG-3 | Item edits are allowed in DRAFT and IN_REVIEW. After APPROVED, edits are still allowed (OKRs evolve), but each one is logged with "edited after approval" and shown in the package history. |
| PKG-4 | `weightsJson` is shown on the profile as the performance mix. It is informational until it is linked to a scorecard template (`KPI-9`, `DEV-7`). |
| PKG-5 | Items do not require a package: an employee without a package still gets every tab, and the header just says "No package for this timeframe". |

---

## 4. Profile surfaces (`PRF`)

### 4.1 Employee profile page — `/dashboard/org/users/[id]` (canonical)

| ID | Requirement |
|---|---|
| PRF-1 | Convert the main column to URL-synced tabs (`components/shared/LinkTabs.tsx`, `?tab=`): **Overview** (default, the current content) · **OKRs** · **Role & duties** · **KPIs** · **Development** · **Links & dependencies** · **Decisions**. Tabs the viewer may not see (§8) are hidden, not disabled. |
| PRF-2 | **Overview** keeps the existing sections and adds a **Package summary** card at the top for the selected timeframe:<br>• Package status and version<br>• OKR progress (objectives, KRs, next checkpoint)<br>• KPI health (G/A/R counts)<br>• Duties this week (due, done) and 30-day adherence<br>• Development (items done of required, hours of 40)<br>• Inbound blockers (late count, first 3)<br>• Outbound due within 7 days<br>• Open decisions affecting the person<br>Each figure deep-links to its tab. |
| PRF-3 | A timeframe switcher in the page header applies to every tab. It defaults to the active timeframe and includes past (closed) timeframes, read-only. |
| PRF-4 | The sidebar shows the role definition (seat title, reports to, purpose, first 3 accountabilities, "View all" → Role & duties tab) under the name. |
| PRF-5 | `loadUserProfile` gains a per-tab loader (only the active tab's data is fetched). Each loader applies `features/package/services/access.ts` plus existing OKR visibility, and redacts private items with the same rules as `canViewObjectiveInMemory`. |
| PRF-6 | `/dashboard/settings/users/[id]` (admin record) gets a **"View profile"** link to the right user (it currently links to the directory) and a **Role definition** section editable by HR, Executive and Admin. |

### 4.2 Employee OKR profile — new view

There is no per-person OKR page today [V]. Add one, reachable from three places.

| ID | Requirement |
|---|---|
| PRF-7 | Route `/dashboard/org/users/[id]?tab=okrs`, which is the **OKRs** tab. `/dashboard/my-okrs` gets a "My OKR profile" link to the same tab for the viewer. The Explorer gains an `?owner=<id>` param (passing through to `/api/okr-hierarchy`), and every `PersonLink` in quick views offers "Open OKR profile". |
| PRF-8 | Layout:<br>• **Header strip:** objectives, KRs, average progress, committed vs aspirational split, next checkpoint, last check-in date.<br>• **Tree:** Objective → KR → Milestones (initiatives `kind=MILESTONE`, with due date and status) → Tasks (child Todos, with sprint). Duties linked to a KR show as a collapsed "Recurring: n" row under it.<br>• Every node shows the connection chips (§5). |
| PRF-9 | Filters: level (company-owned, contributed, individual), commitment (C/A/C-A), status (on track / at risk / off track / closed), "blocked only", "checkpoint due in 30 days". |
| PRF-10 | **Past OKRs** section (collapsed): the person's CLOSED objectives from previous timeframes, with outcome, final grade, retrospective link and their `SUCCEEDS` successors ("Carried → C5 · company O4"). Retired or deferred items show "Retired — no successor". |
| PRF-11 | Actions from this view follow existing permissions: check in, open the quick view, open the close flow (owner or manager, and only when the timeframe has ended or the user is Admin/Exec), add a milestone or task. |
| PRF-12 | Print / PDF of the OKR profile (reusing the period-close report PDF pipeline) for one-on-ones. **[A]** Phase 6. |

### 4.3 Tab contents

| Tab | Content |
|---|---|
| **Role & duties** (PRF-13) | Role definition (all sections, version history, status). Duties grouped by cadence (Daily → Yearly → Every sprint → Event), each showing timing, duration, output, collaborators (avatars), linked KR chip, adherence %, next due, and Pause/Retire/Log occurrence actions. |
| **KPIs** (PRF-14) | KPI cards (KPI-4) grouped Leading / Lagging, an "Enter reading" action for the current period, and a reading history table. |
| **Development** (PRF-15) | Two rule bars (DEV-3), then the item list with status, due date, linked KR and evidence. |
| **Links & dependencies** (PRF-16) | Two columns: **Inbound — clear first** and **Outbound — others wait on you**. Rows are sorted late → due soon → open → done, and each shows counterparty avatars, needed-by date, linked items and status. A **Graph** toggle (`CON-4`). |
| **Decisions** (PRF-17) | Open decisions affecting the person (DEC-3), plus, for the decider, "Awaiting my decision" (DEC-1). |

---

## 5. Connections — links and dependencies visible everywhere (`CON`)

The user requirement: **for each item, the link and dependency is visible.**

| ID | Requirement |
|---|---|
| CON-1 | A shared `ConnectionChips` component, shown on every row of an objective, KR, initiative, KPI, duty or development item in the profile tabs, OKR tree, Explorer list and quick views:<br>• **↑ Aligns to:** parent objective or company KR (from `parentObjectiveId` + `CONTRIBUTES_TO`).<br>• **↓ Supported by n:** children and contributing items.<br>• **⟲ From FY25/26:** predecessor(s) (`SUCCEEDS`); in the old timeframe, **→ Continued as** successor(s).<br>• **⛔ Blocked by DEPxx** (late inbound), **⏳ Waiting on n** (open inbound), **⇢ n waiting on this** (outbound).<br>• **⚖ Decision D46** (open decision linked).<br>• **KPI** chip on a KR linked to a KPI, and the reverse. |
| CON-2 | A shared `ConnectionsPanel` (a `RailCard` in quick views and a section on detail pages) lists every link, grouped as in CON-1, with title, owner avatar, status and a deep link. It is on the objective detail, KR detail, quick views, initiative card modal, KPI, duty and development detail. |
| CON-3 | The **KR detail page** must also show linked Project milestones (`Milestone.keyResultId`), which it does not today [V]. |
| CON-4 | **Dependency graph** (Links & dependencies tab, and a company version on the Dependency Map page): React Flow, reusing `components/hierarchy` node styles. Person in the centre, inbound providers on the left, outbound needers on the right, edges coloured by status (late = danger, due soon = warn, done = muted). Clicking a node opens its quick view. |
| CON-5 | **Alignment trail** on every KR and objective: a breadcrumb `Company O1 › KR1.3 › EDN-O1 › EDN-KR1.1` built from `CONTRIBUTES_TO` + `parentObjectiveId` (extends `OkrBreadcrumb`). |
| CON-6 | **Lineage**: `RolledFromBanner` reads `OkrLink SUCCEEDS` (n:m) and shows "Continues 3 FY25/26 items" with a popover listing each, its sub-kind and its final grade. |
| CON-7 | **Company KR "Lands in" view**: the company KR detail lists every contributing individual KR and objective with owner and progress (the "KR Ownership Matrix" sheet, generated live). |
| CON-8 | All chips and panels respect visibility: a linked item the viewer may not see renders as "Private item" with no title (same rules as the `isRedacted` flag in the quick views). |

---

## 6. API surface [N]

Every route is wrapped in `withAuth` / `withFeature`, validated with zod, checked through `features/package/services/access.ts`, and writes `recordActivity`.

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/okr-links` | List links for an entity (`?type=&id=`) / create |
| DELETE | `/api/okr-links/[id]` | Remove a link |
| GET/POST/PATCH | `/api/keyresults/[id]/checkpoints` | KR checkpoints |
| GET/POST | `/api/package/duties` | `?userId=&timeframeId=` |
| PATCH/DELETE | `/api/package/duties/[id]` | Edit, pause, resume, retire, delete (DUT-4, DUT-6) |
| POST | `/api/package/duties/[id]/log` | Event occurrence (DUT-3) |
| GET/POST/PATCH | `/api/package/role-definitions[/id]` | Plus `POST …/approve` |
| GET/POST/PATCH | `/api/package/kpis[/id]` | KPIs |
| GET/PUT | `/api/package/kpis/[id]/readings` | Readings (upsert per period) |
| GET/POST/PATCH | `/api/package/development[/id]` | Development items, plus `POST …/hours` |
| GET/POST/PATCH | `/api/dependencies[/id]` | Plus `POST …/delivery-task`, `POST …/status` |
| GET | `/api/dependencies/person/[userId]` | Inbound / outbound (DEP-1) |
| GET/POST/PATCH | `/api/decisions[/id]` | Plus `POST …/decide` |
| GET/POST/PATCH | `/api/package/packages[/id]` | Header; plus `POST …/submit`, `…/approve` |
| PUT | `/api/package/packages/[id]/reviews` | Agree / Dispute per item |
| GET | `/api/users/[id]/profile-tab?tab=&timeframeId=` | Per-tab loader (PRF-5) |
| GET | `/api/connections?type=&id=` | Everything for CON-1 / CON-2 in one call |

---

## 7. Importer (`IMP`)

| ID | Requirement |
|---|---|
| IMP-1 | One-shot script `scripts/import-operating-packages.ts`: plain `PrismaClient`, no `@/` imports, `--dry-run` (default) and `--apply`, idempotent on `externalRef` (create or update; never delete). Follows `scripts/import-business-ops-sprint.ts`. |
| IMP-2 | Dry run writes a review workbook covering:<br>• owner → user matches;<br>• unmatched names;<br>• each KR's proposed `targetValue`, `unit` and `direction` (numeric when the target is a single figure, otherwise 0→100 % milestone-scored);<br>• duty cadence → rule;<br>• KPI numeric parsing;<br>• `CONTRIBUTES_TO` and `SUCCEEDS` link plans;<br>• old FY25/26 items matched by `upper(right(id, 6))`. |
| IMP-3 | Sheet order: Company OKR → packages (OKR → Milestones as `kind=MILESTONE` initiatives with `progressValue = 100 / n` → Tasks as child Todos → Recurring Duties → Role Definition → KPIs → Development) → Dependency Map → Decisions → Links (package X-ids) → Carry-forward (close and link the old OKRs per the earlier proposal). |
| IMP-4 | Writes `ActivityLog` rows (`metadata.source='import'`). No notification fan-out, except one summary notification per employee ("Your FY 2026/27 operating package is ready for review") when `--notify` is passed. |
| IMP-5 | Each phase's sheets import only once that phase is deployed; earlier sheets re-run safely. |
| IMP-6 | "Review: Agree / Dispute" cells with values import as `PackageItemReview` rows. |

---

## 8. Permissions (`PERM`)

New doctypes (module `package`), seeded by `scripts/seed-package-permissions.ts`:
`okr_link`, `kr_checkpoint`, `recurring_duty`, `role_definition`, `kpi`, `kpi_reading`, `development_item`, `work_dependency`, `decision`, `operating_package`, `package_item_review`.

Access is resolved in `features/package/services/access.ts` (Scrum pattern: `isDirectManager`, manager chain, `sharesActiveDepartment`):

| Viewer → subject | OKR / role / duties / dependencies / decisions | KPIs (non-sensitive) | KPIs (sensitive), development, weights | Edit |
|---|---|---|---|---|
| Self | Read | Read; enter readings | Read | Own duties, readings, dev items, reviews; **not** own role definition or package approval |
| Direct manager / manager chain | Read | Read | Read | Everything for the report; approve the package and role definition |
| Same department (peer) | Read (OKR visibility applies) | Read | — | — |
| Department lead (subtree) | Read | Read | Read (dev); sensitive KPIs need the feature below | Department members' items |
| HR (`package.hr` feature) | Read all | Read all | Read all | Role definitions, development, package lifecycle |
| Executive / Admin | All | All | All | All |
| Any employee | Dependencies and decisions they are a party to, plus the company Dependency Map (titles + status) | — | — | Mark own provided dependencies DONE |

Feature keys:
- **Module and pages:** `module.package`, `page.people.package`, `page.okr.dependency-map`, `page.okr.decisions`.
- **Buttons:** `button.package.duty.create`, `button.package.kpi.create`, `button.package.role.approve`, `button.package.approve`, `button.decision.decide`.
- **Capabilities:** `package.kpi.sensitive.read`, `package.hr`.

All of these are added to `FeaturesNavTab` and seeded centrally (also seed the missing `page.settings.timeframes` [V]).

Sensitive fields (`DocTypeFieldRegistry.isSensitive`): `Kpi.targetValue`, `KpiReading.value` when `isSensitive`, and `OperatingPackage.weightsJson`.

---

## 9. Notifications (`NTF`)

These go in the new category **Operating package** in `lib/notifications/events.ts` and `docs/NOTIFICATIONS.md` §2.

| Event | Default cadence | Recipients | Redactable |
|---|---|---|---|
| `KPI_READING_DUE` | Digest | KPI owner (KPI-5) | Yes |
| `DEPENDENCY_DUE_SOON` (7 d) | Digest | Providers | No |
| `DEPENDENCY_LATE` | Immediate, then weekly | Providers + needers + needers' managers | No |
| `DEPENDENCY_DONE` | Immediate | Needers | No |
| `DECISION_REQUESTED` | Digest | Decider | No |
| `DECISION_DECIDED` | Immediate | Requester + linked users | No |
| `DEV_ITEM_DUE` (14 d) | Digest | Owner | Yes |
| `PACKAGE_SENT_FOR_REVIEW` | Immediate | Employee | No |
| `PACKAGE_ITEM_DISPUTED` | Digest | Manager | No |
| `PACKAGE_APPROVED` | Immediate | Employee | No |
| `KR_CHECKPOINT_DUE` (7 d) | Digest | KR owner | Yes |

Duty occurrences reuse the existing Todo due and reminder events; no new event is needed.

Cron: extend the daily job (or add `/api/cron/package-daily`, 02:00 UTC, `withCronAuth`) for KPI-3 auto-fill, KPI-5, DEP-2 and the due-soon events. Document it in `docs/CRON.md` and `scripts/install-crontab.sh`.

---

## 10. Audit (`AUD`)

- **AUD-1:** Add entity types `OKR_LINK`, `KR_CHECKPOINT`, `RECURRING_DUTY`, `ROLE_DEFINITION`, `KPI`, `KPI_READING`, `DEVELOPMENT_ITEM`, `WORK_DEPENDENCY`, `DECISION` and `OPERATING_PACKAGE` to `ActivityEntityType`, with ids in `metadata` (Scrum pattern).
- **AUD-2:** Add actions `LINKED`, `UNLINKED`, `PAUSED`, `RESUMED`, `RETIRED`, `READING_ENTERED`, `DECIDED`, `REVIEWED`, `SUBMITTED` and `APPROVED`. Field edits use `recordUpdateIfChanged`.
- **AUD-3:** Hydrate the deep links in `lib/activity-log-hydrate.ts` so the activity panel opens the right profile tab.

---

## 11. Design (Apple Pro)

- Use only `--ap-*` tokens and the Tailwind aliases. Use the shared `PageHeader`, `SectionHeading`, `StatGrid`, `KpiCard`, `Sparkline`, `EmptyState`, `SideDrawer`, `Modal`, `LinkTabs`, `UserAvatar`, `Progress` and `MiniBadge`, plus `quick-view-parts` (`RailCard`, `Chip`, `PersonLink`, `MetaRow`). No new colour literals.
- RAG and status colours come from `ok`, `warn` and `danger` tokens. Chart colours come from `lib/chart-colors.ts`.
- Every route has `loading.tsx` and `error.tsx`. Every tab has an empty state that explains the bucket, using the workbook definitions in §0.
- The layout must work at phone width: tabs scroll horizontally, and the inbound/outbound columns stack.

---

## 12. Out of scope

Hiring & Promotions, Revenue Bridge, Campaigns, Bonus & Commission, Source Coverage and Traceability stay in the workbooks.

Company rhythm meetings are covered as duties (DUT-8). Hiring may later reuse `ROL-4` vacant seats.

---

## 13. Phasing

| Phase | Scope | Unblocks |
|---|---|---|
| **P0 Foundations** | FND-1…6, LNK (model + API + RolledFromBanner n:m), KRX fields + checkpoints | OKR + milestone + task import; closing and linking FY25/26 |
| **P1 OKR profile + connections** | PRF-1, PRF-3, PRF-5, PRF-7…11, CON-1, CON-2, CON-3, CON-5, CON-6, CON-7, Explorer `?owner=` | People see their imported OKRs with alignment and lineage |
| **P2 Duties + role** | DUT, ROL, PRF-4, PRF-13 | Duties import (166) and role definitions |
| **P3 Dependencies + decisions** | DEP, DEC, PRF-16, PRF-17, CON-4, DEP-6, NTF dependency/decision events | Dependency Map (66 + X-ids) and Decision Log (78) import |
| **P4 KPIs** | KPI-1…8, PRF-14, NTF-KPI | KPI import (96) |
| **P5 Development + package + review** | DEV, PKG, PRF-2 (full summary), PRF-15, IMP-6, KPI-9, DEV-7 | Review sessions replace the workbook yellow columns |
| **P6 Polish** | PRF-12 PDF, KPI splitting, analytics | — |

Each phase updates `docs/MASTER_REFERENCE.md`, `SITEMAP.md`, `FEATURE_STATUS.md`, `COMPONENT_CATALOG.md`, `NOTIFICATIONS.md`, `CRON.md` (where relevant) and `CHANGELOG_AI.md`. Schema changes ship via `prisma db push` on deploy (with `preflight.sql` backfills where needed).

---

## 14. Tests to write

- **Recurrence:** QUARTERLY and SEMIANNUAL month-end clamping; duty pause/resume never backfills; occurrences carry `progressValue = null`.
- **KR direction:** DECREASE progress maths and close-flow outcome suggestion; objective progress with a non-zero start (FND-3).
- **Lock guard:** creating a KR under a locked objective → 423.
- **OkrLink:** the unique constraint; `CONTRIBUTES_TO` across timeframes is rejected; primary `SUCCEEDS` sets `rolledFromId`.
- **Dependencies:** inbound/outbound derivation; late/due-soon boundaries; DONE notifies needers once.
- **KPIs:** RAG for INCREASE/DECREASE/RANGE; period bucketing; sensitive KPI hidden from a peer, visible to the manager chain.
- **Access matrix (§8):** one test per row.
- **Connections:** a private linked item renders redacted.
- **Importer:** dry-run makes no writes; re-running is idempotent; old FY25/26 code matching.

---

## 15. Open questions

1. **Sensitive KPIs:** is quota (e.g. EDN-K01) visible to peers? This spec says no (KPI-7).
2. **HR role:** who holds `package.hr`? Meklit as Head of Operations, plus a future People Lead?
3. **Package approval:** is the approver the direct manager, or the CEO for every package?
4. **Event duties ("per bid"):** is a manual "Log occurrence" enough, or should a duty attach to another module's event (e.g. a new bid in a future bid register)?
5. **Sprints:** should the S1–S5 company sprint calendar become real `Sprint` rows (one per team, or one company-wide), so that imported tasks land on boards?
6. **Development hours:** self-reported, or manager-confirmed?
7. **Decisions:** is the CEO the only decider, or can decisions be delegated (the delegation matrix is company KR4.1)?
8. **Timing:** must P0 + P1 land before importing, or should OKRs be imported now with links stored in descriptions and backfilled later? Recommended: P0 first. It is small, and it makes the import re-runnable.
