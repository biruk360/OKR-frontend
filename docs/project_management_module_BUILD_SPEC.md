# Project Management & Delivery Intelligence Module
## Complete Build Specification & User Story Document

**Eldix IT Technology PLC (360Ground™) | Internal OKR Platform**
**Version 1.0 — BUILD READY | July 2026**

> **Purpose of this document:** This is the authoritative build specification for Claude Code to
> implement the Project Management module inside the existing 360Ground OKR Platform.
>
> **Assumptions (do not rebuild these):**
> - User management, authentication, roles, permissions **already exist** — reuse them
> - `User`, `Department`, `ManagerRelationship`, `Objective`, `KeyResult`, `ActivityLog`,
>   `Notification` models **already exist** — extend, don't duplicate
> - Stack is fixed: **Next.js 14 App Router · TypeScript · Prisma/PostgreSQL · TanStack Query ·
>   Zustand · Tailwind · shadcn/ui · Lucide · NextAuth · Pusher**
> - Existing conventions in `docs/CONVENTIONS.md` are binding (withAuth/withRole,
>   `{success, data, error}` envelope, `components/ui/Modal`, `cn()`, feature barrels)
>
> **Locked decisions:**
> 1. High-level project schedule lives in **our system**. Issue/requirement tracking stays in **Jira**.
> 2. Jira is **read-only** to us. We never write back.
> 3. Client portal is **read-only + comment**.
> 4. Client portal **never exposes individual names or individual-level reports** — enforced at the
>    API serializer layer, not the UI.
> 5. Projects can exist with **no Jira link at all** (non-software/consulting projects).
> 6. Gantt must be a **functional duplicate of Instagantt** (see Epic D).

---

# TABLE OF CONTENTS

- [PART 1 — The 20 Problems This Module Solves](#part-1--the-20-problems-this-module-solves)
- [PART 2 — Architecture & Integration Map](#part-2--architecture--integration-map)
- [PART 3 — Complete Data Model](#part-3--complete-data-model)
- [PART 4 — Epics & User Stories](#part-4--epics--user-stories)
  - [Epic A — Project Setup & Templates](#epic-a--project-setup--templates)
  - [Epic B — Schedule of Record](#epic-b--schedule-of-record)
  - [Epic C — Baselines & The Delay Ledger](#epic-c--baselines--the-delay-ledger)
  - [Epic D — Gantt Chart (Instagantt Parity)](#epic-d--gantt-chart-instagantt-parity)
  - [Epic E — View Toggles](#epic-e--view-toggles)
  - [Epic F — Activity Detail Panel & Comments](#epic-f--activity-detail-panel--comments)
  - [Epic G — Jira Integration](#epic-g--jira-integration)
  - [Epic H — Governance Registers](#epic-h--governance-registers)
  - [Epic I — Client Portal](#epic-i--client-portal)
  - [Epic J — Reports & Charts Engine](#epic-j--reports--charts-engine)
  - [Epic K — OKR Integration & Portfolio Intelligence](#epic-k--okr-integration--portfolio-intelligence)
- [PART 5 — Permissions, Notifications, Cron](#part-5--permissions-notifications-cron)
- [PART 6 — Build Sequence & Definition of Done](#part-6--build-sequence--definition-of-done)

---

# PART 1 — The 20 Problems This Module Solves

> Derived directly and indirectly from the PM Challenges document, the two scorecard files, the
> Master Reference, and our working conversations. **Every requirement in this document traces back
> to one of these.** Each issue carries the Epic that resolves it.

| # | Issue | Evidence / Source | Resolved By |
|---|-------|-------------------|-------------|
| **1** | **Delay is unprovable.** There is no frozen baseline, so "we're late" is an opinion, not a fact. Nobody can demonstrate *who* caused a slip. | Challenge doc: *"Visibility into delayed tasks, the responsible party, and the timeline impacts"* — stated as a need, not a capability | **Epic C** |
| **2** | **Client-caused delay is invisible and unattributed.** Projects sit idle for weeks awaiting client approval, and 360Ground silently absorbs the blame. | Challenge doc: *"Projects remain idle/lost for weeks or months"*, *"Multiple follow-ups required"* | **Epic C** (Approval Clock) |
| **3** | **Manual report consolidation consumes PM time.** Every status report is hand-assembled from scattered sources. | Challenge doc: *"Manual effort required from the PM for project reporting and status consolidation, taking significant time"* | **Epic J** (auto-generation) |
| **4** | **No single source of truth for project status.** Jira, spreadsheets, email, and memory all disagree. | Challenge doc: *"360 PM has a clear source of truth for all projects"* — stated as a desired outcome | **Epic B** |
| **5** | **Root cause of delays is unknown.** Nobody can say whether the systemic problem is planning, requirements, approvals, or implementation. | Challenge doc, verbatim: *"Its not clear what the consistent issues are is it planning, is it implementation, is it requirement, approva etc… these should be tracked"* | **Epic C** (Slip Reason taxonomy) + **C18 Pareto** |
| **6** | **Scope creep is uncontrolled and uncosted.** Requirements evolve and scope is added without formal impact assessment. | Challenge doc: *"evolving requirements, and scope additions"*, *"Unplanned tasks distort velocity"* | **Epic H** (Change Control Board) |
| **7** | **Sprint commitments are disrupted by unplanned client work**, distorting velocity and making performance metrics meaningless. | Challenge doc: *"Planned sprint work gets interrupted"*, *"Unplanned tasks distort velocity and performance metrics"* | **Epic C** + **Epic G** |
| **8** | **Inconsistent Jira usage** across teams makes data unreliable. | Challenge doc: *"Inconsistent Jira usage across teams"* | **Epic G** (Jira Adoption Score) |
| **9** | **No individual performance tracking over time.** There is no way to relate an employee to a KPI and watch the trend. | Challenge doc: *"No means to track the performance of a specific individual across time - there should be a means to create r/ship between the employee and a predefined performance KPI allowing the PM to track performance across time"* | **Epic G** + **Epic K** (→ Performance module) |
| **10** | **Idle time is invisible.** Nobody knows how many days a developer went without an update. | Challenge doc: *"Show idle time of a individual i.e. days with no update"* | **Epic G** (Idle Days) |
| **11** | **Estimates are never validated against reality**, so they never improve. | Challenge doc: *"Provide realistic estiamte for each issue and compre it against actual time it took to execute"* | **Epic G** + **R9 Estimation Learning** |
| **12** | **Scrum attendance is completely untracked** — who attended, when, how often, how many were held. | Challenge doc, flagged as **critical**: *"No means to track daily scrum update, who attended, what time the scrum took place… this is critical and important"* | **Epic G** (Scrum Log) |
| **13** | **No project-level confidence measure.** Progress % alone hides risk. | Challenge doc: *"No means to track project overall progress, good or bad progress, confidence…"* | **Epic B** (Confidence) + **Epic J** |
| **14** | **Every project reinvents the wheel** — no templates, no predefined workflow. | Challenge doc: *"Not having templates and predefined workflows thus reinventing the wheel for each project"* | **Epic A** (Project Templates) |
| **15** | **AI over-generates documents**, producing bloated deliverables that create scope confusion. | Challenge doc: *"Overuse of AI for document preparation i.e. some documents are generated and sent as is, creating an over detailed document, which creates confusion and scope issues"* | **Epic J** (hard-capped AI, mandatory PM edit) |
| **16** | **Resource capacity is unknown.** No view of who is over-allocated, who is idle, or whether a new project can be taken on. | Challenge doc: *"Lack of resource capacity and workload tracking across active projects"* | **Epic E** (Workload) + **R10** |
| **17** | **No phase gates.** Development begins before requirements are formally approved, guaranteeing rework. | Inferred from #6 and the doc's Prep→Review→Approval activity pattern which exists but is not enforced | **Epic H** (Stage-Gates) |
| **18** | **No RAID discipline.** Risks, assumptions, issues, and dependencies are not systematically logged — unacceptable for the government/enterprise/NGO clients 360Ground serves (MoR/INSA accredited; ILO, World Bank, GIZ, USAID clients). | Absent from all source material; standard requirement in the client segment 360Ground operates in | **Epic H** (RAID Log) |
| **19** | **Client has no self-service visibility**, so they must ask, and 360Ground must answer manually — repeatedly. | Challenge doc: *"Clients remain continuously informed about project status, blockers, risks, and schedule impacts"* — stated as desired outcome | **Epic I** (Client Portal) |
| **20** | **Project delivery is disconnected from company strategy.** Project progress does not feed the OKR system, so delivery performance and strategic attainment are tracked in separate universes. | Inferred from the platform architecture — the OKR module and project delivery currently have no relationship | **Epic K** (OKR Integration) |

### Additional systemic issues (bonus — worth noting)

| # | Issue | Resolved By |
|---|-------|-------------|
| 21 | Client approval SLAs are not contractualized or measured | Epic H (Client Obligations Register) |
| 22 | Failures produce blame, not systemic fixes | Epic H (Correction of Errors register) |
| 23 | Delivery is not tied to invoicing/cash | Epic H (Payment Milestones) |
| 24 | No portfolio-level view for the CEO | Epic K (Portfolio Wall) |
| 25 | Team morale erodes from constant re-prioritization, with no visibility into why | Epic C (makes churn visible and attributable) |

---

# PART 2 — Architecture & Integration Map

## 2.1 Three-Layer Model

```
┌──────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — INTELLIGENCE                                                   │
│  Delay Ledger · EVM (SPI/CPI) · AI Reports · Portfolio Health             │
│  Root-Cause Pareto · Dev Performance · Client Health Score                │
├──────────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — EXECUTION  (Jira-owned, mirrored in — OPTIONAL)                │
│  Issues · Sprints · Worklogs · Changelogs · Blockers                      │
│  Pulled read-only via Jira Cloud REST API v3. Mapped up to Layer 1.       │
├──────────────────────────────────────────────────────────────────────────┤
│  LAYER 1 — SCHEDULE OF RECORD  (360Ground-owned — ALWAYS PRESENT)         │
│  Project · Phase · Milestone · Activity · Baseline · Status · Comments    │
│  This is the client-facing truth. Instagantt-parity. Works with no Jira.  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2.2 Integration With Existing OKR Platform

| Existing System | Integration | Direction |
|-----------------|-------------|-----------|
| `User` | Project members, activity assignees, PM, comment authors | Read |
| `Department` | Project owning department; resource pools | Read |
| `ManagerRelationship` | Escalation routing | Read |
| **`Objective` / `KeyResult`** | **Milestones link to KRs. Activity completion drives KR progress.** | **Read + Write** |
| `ActivityLog` (`recordActivity()`) | Every status change, baseline edit, slip reason logged | Write |
| `Notification` dispatcher | New `PROJECT` category (§Part 5) | Write |
| Permission module | New DocTypes; client portal role with hard field suppression | Read |
| Letters module | Client report reuses Draft→Approved→Sent workflow pattern | Pattern reuse |
| Performance module | Jira metrics become auto-pulled Metric criteria in scorecards | Write |
| `lib/api/withAuth.ts` | All routes use `withAuth` / `withRole` | Reuse |
| `components/ui/*` | Modal, ConfirmDialog, EmptyState, StatCard, PageHeader | Reuse |
| `<ActivityLogPanel>` | Activity audit trail | Reuse |

## 2.3 Feature Directory Structure

```
features/projects/
├── components/
│   ├── gantt/
│   │   ├── GanttChart.tsx              # Epic D — the centerpiece
│   │   ├── GanttTaskList.tsx           # Left pane (rows, columns)
│   │   ├── GanttTimeline.tsx           # Right pane (bars, grid)
│   │   ├── GanttBar.tsx                # Single bar + baseline overlay
│   │   ├── GanttDependencyArrow.tsx    # SVG arrows
│   │   ├── GanttMilestoneDiamond.tsx
│   │   ├── GanttTodayMarker.tsx
│   │   ├── GanttToolbar.tsx            # Export/Baselines/Options/Columns/Scale
│   │   └── GanttMinimap.tsx
│   ├── board/KanbanBoard.tsx           # Epic E
│   ├── table/ProjectTable.tsx
│   ├── workload/WorkloadView.tsx
│   ├── overview/ProjectOverview.tsx
│   ├── activity/ActivityDetailPanel.tsx # Epic F
│   ├── registers/ (RAID, CCB, StageGate, Obligations, COE, Payments)
│   ├── reports/ (ReportBuilder, ClientReport, WBRPack, ...)
│   ├── charts/ (C1–C24)
│   └── portal/ (Epic I — client-facing, separate serializers)
├── hooks/
├── services/
│   ├── jira/                            # Epic G
│   ├── evm.ts                           # SPI/CPI/EAC
│   ├── delay-ledger.ts                  # Epic C
│   ├── scheduling.ts                    # Dependency shift, critical path
│   └── rollup.ts                        # % complete rollup
├── types.ts
└── index.ts                             # barrel
```

---

# PART 3 — Complete Data Model

> Prisma schema. All enums stored as `String` for portability (existing convention).

## 3.1 Core Schedule

```prisma
model Project {
  id                String    @id @default(cuid())
  code              String    @unique              // "PRJ-2026-014"
  name              String
  description       String?
  clientName        String                          // free text or Odoo-linked
  clientId          String?                         // optional CRM link
  projectManagerId  String                          // FK -> User
  departmentId      String?                         // FK -> Department
  templateId        String?                         // FK -> ProjectTemplate

  // Dates
  plannedStart      DateTime
  plannedEnd        DateTime
  actualStart       DateTime?
  actualEnd         DateTime?

  // Baseline
  baselineCommittedAt DateTime?                     // NULL = not yet baselined
  baselineVersion     Int      @default(0)

  // Status & health
  status            String    @default("PLANNING")  // PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED
  ragStatus         String    @default("GREEN")     // GREEN|AMBER|RED  (computed)
  confidence        Int       @default(100)         // 0-100
  percentComplete   Float     @default(0)           // weighted rollup
  percentPlanned    Float     @default(0)           // expected % as of today

  // EVM
  spi               Float?                          // Schedule Performance Index
  cpi               Float?                          // Cost Performance Index
  eac               Float?                          // Estimate at Completion
  plannedValue      Float?
  earnedValue       Float?
  actualCost        Float?
  budgetAtCompletion Float?

  // Contract
  contractValue     Float?
  currency          String    @default("ETB")

  // Jira (OPTIONAL)
  jiraLinked        Boolean   @default(false)
  jiraConnectionId  String?

  // Client portal
  portalEnabled     Boolean   @default(false)
  clientEmails      String[]                        // report distribution list

  // OKR link
  objectiveId       String?                         // FK -> Objective

  createdById       String
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  archivedAt        DateTime?

  phases            Phase[]
  members           ProjectMember[]
  delayEvents       DelayEvent[]
  changeRequests    ChangeRequest[]
  raidItems         RaidItem[]
  stageGates        StageGate[]
  clientObligations ClientObligation[]
  coeRecords        CorrectionOfError[]
  paymentMilestones PaymentMilestone[]
  reports           ProjectReport[]
  scrumLogs         ScrumLog[]
  jiraConnection    JiraConnection? @relation(fields: [jiraConnectionId], references: [id])
  objective         Objective?      @relation(fields: [objectiveId], references: [id])

  @@index([status, ragStatus])
  @@index([projectManagerId])
}

model Phase {
  id              String   @id @default(cuid())
  projectId       String
  name            String                            // "Project Initiation"
  position        Int
  weight          Float    @default(0)              // % contribution to project (doc uses 20% blocks)
  percentComplete Float    @default(0)              // rollup from milestones
  status          String   @default("NOT_STARTED")

  plannedStart    DateTime?
  plannedEnd      DateTime?
  baselineStart   DateTime?
  baselineEnd     DateTime?
  currentStart    DateTime?
  currentEnd      DateTime?

  project         Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestones      Milestone[]
  stageGate       StageGate?
  @@index([projectId, position])
}

model Milestone {
  id              String   @id @default(cuid())
  phaseId         String
  name            String                            // "Inception Report"
  position        Int
  weight          Float    @default(0)
  percentComplete Float    @default(0)
  status          String   @default("NOT_STARTED")
  isKeyMilestone  Boolean  @default(false)          // shown as diamond on Gantt

  baselineDate    DateTime?
  currentDate     DateTime?

  // OKR link
  keyResultId     String?                           // FK -> KeyResult

  phase           Phase      @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  activities      Activity[]
  keyResult       KeyResult? @relation(fields: [keyResultId], references: [id])
  @@index([phaseId, position])
}

model Activity {
  id                String   @id @default(cuid())
  milestoneId       String
  parentActivityId  String?                         // ONE level of subtasks (Instagantt parity)
  position          Int

  title             String
  description       String?                          // rich text

  // OWNERSHIP — critical for delay attribution & client anonymization
  assigneeId        String?                          // FK -> User. INTERNAL ONLY. Never sent to client.
  ownerParty        String   @default("360GROUND")   // 360GROUND | CLIENT | SHARED  <- client sees THIS

  // BASELINE (frozen at commit — NEVER edited directly)
  baselineStart     DateTime?
  baselineEnd       DateTime?

  // CURRENT (live, editable)
  currentStart      DateTime?
  currentEnd        DateTime?

  // Status (EXACT enum from Instagantt screenshot Image 8)
  status            String   @default("NOT_STARTED")
  // NOT_STARTED | STARTED | FINISHED | APPROVAL_REQUESTED | APPROVED | REJECTED

  percentComplete   Float    @default(0)
  weight            Float    @default(1)

  // Effort & cost (Image 2 fields)
  estimatedHours    Float?
  actualHours       Float?
  estimatedCost     Float?
  actualCost        Float?

  priority          String?                          // LOW|MEDIUM|HIGH|CRITICAL
  risk              String?                          // LOW|MEDIUM|HIGH

  isMilestone       Boolean  @default(false)         // "Convert to Milestone" (Image 7)

  // DELAY LEDGER
  waitingSince      DateTime?                        // set when status -> APPROVAL_REQUESTED
  slipDays          Int      @default(0)             // computed: currentEnd - baselineEnd
  slipReason        String?                          // enum, see DelayEvent
  slipOwner         String?                          // 360GROUND | CLIENT | SHARED

  // Jira mapping
  jiraIssueKeys     String[]                         // mapped Jira issues
  jiraAutoRollup    Boolean  @default(false)         // if true, % derives from Jira

  milestone         Milestone  @relation(fields: [milestoneId], references: [id], onDelete: Cascade)
  parent            Activity?  @relation("ActivitySubtasks", fields: [parentActivityId], references: [id])
  subtasks          Activity[] @relation("ActivitySubtasks")
  predecessors      ActivityDependency[] @relation("Successor")
  successors        ActivityDependency[] @relation("Predecessor")
  comments          ActivityComment[]
  attachments       ActivityAttachment[]
  tags              ActivityTag[]
  delayEvents       DelayEvent[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([milestoneId, position])
  @@index([status])
  @@index([assigneeId])
}

model ActivityDependency {
  id             String   @id @default(cuid())
  predecessorId  String
  successorId    String
  type           String   @default("FS")   // FS|SS|FF|SF (Finish-to-Start default)
  lagDays        Int      @default(0)
  predecessor    Activity @relation("Predecessor", fields: [predecessorId], references: [id], onDelete: Cascade)
  successor      Activity @relation("Successor",  fields: [successorId],  references: [id], onDelete: Cascade)
  @@unique([predecessorId, successorId])
}

model ActivityComment {
  id              String   @id @default(cuid())
  activityId      String
  authorId        String
  content         String                             // HTML (WYSIWYG)
  parentId        String?                            // threaded
  visibility      String   @default("INTERNAL")      // INTERNAL | CLIENT_VISIBLE  <- CRITICAL
  mentions        String[]                           // userIds @mentioned
  isClientAuthor  Boolean  @default(false)           // written by a client portal user
  createdAt       DateTime @default(now())
  activity        Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  @@index([activityId])
}

model ActivityAttachment {
  id          String   @id @default(cuid())
  activityId  String
  fileName    String
  fileSize    Int
  mimeType    String
  storagePath String
  uploadedById String
  visibility  String   @default("INTERNAL")          // INTERNAL | CLIENT_VISIBLE
  createdAt   DateTime @default(now())
  activity    Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
}

model ActivityTag {
  id         String   @id @default(cuid())
  activityId String
  label      String
  color      String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
}

model ProjectMember {
  id            String  @id @default(cuid())
  projectId     String
  userId        String
  role          String                                // PM | DEVELOPER | QA | DESIGNER | BA | CLIENT_CONTACT
  allocationPct Float   @default(100)                 // capacity planning
  project       Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, userId])
}
```

## 3.2 Delay Ledger (Epic C — the centerpiece)

```prisma
model DelayEvent {
  id            String   @id @default(cuid())
  projectId     String
  activityId    String?

  eventType     String                               // APPROVAL_WAIT | BASELINE_SLIP | BLOCKED
  daysLost      Float

  // ATTRIBUTION
  owner         String                               // CLIENT | 360GROUND | SHARED
  reason        String
  // CLIENT_APPROVAL_DELAY | CLIENT_UNAVAILABILITY | CLIENT_DEPENDENCY_NOT_PROVIDED
  // SCOPE_ADDITION | REQUIREMENT_CHANGE
  // INTERNAL_CAPACITY | TECHNICAL_BLOCKER | ESTIMATION_ERROR | EXTERNAL_DEPENDENCY

  reasonDetail  String?
  phaseAtTime   String?                              // which phase this occurred in (for Pareto)

  startedAt     DateTime
  endedAt       DateTime?
  isAutoDetected Boolean @default(false)             // true = approval clock, false = PM-tagged

  recordedById  String?
  createdAt     DateTime @default(now())

  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  activity      Activity? @relation(fields: [activityId], references: [id])
  @@index([projectId, owner])
  @@index([reason])
}

model BaselineSnapshot {
  id            String   @id @default(cuid())
  projectId     String
  version       Int
  reason        String                               // why re-baselined
  approvedById  String
  snapshotJson  Json                                 // full schedule at time of baseline
  createdAt     DateTime @default(now())
  @@unique([projectId, version])
}
```

## 3.3 Governance Registers (Epic H)

```prisma
model RaidItem {
  id            String   @id @default(cuid())
  projectId     String
  type          String                               // RISK | ASSUMPTION | ISSUE | DEPENDENCY
  refCode       String                               // "R-001", "I-004"
  title         String
  description   String?
  category      String?

  // RISK-specific
  probability   Int?                                 // 1-5
  impact        Int?                                 // 1-5
  score         Int?                                 // computed P x I
  mitigation    String?
  contingency   String?

  // ISSUE-specific
  severity      String?                              // LOW|MEDIUM|HIGH|CRITICAL
  resolution    String?
  daysOpen      Int?                                 // computed

  // DEPENDENCY-specific
  dependsOnParty String?                             // CLIENT | 360GROUND | THIRD_PARTY
  neededByDate  DateTime?

  // ASSUMPTION-specific
  validated     Boolean? @default(false)
  validatedAt   DateTime?
  impactIfFalse String?

  ownerId       String?
  status        String   @default("OPEN")            // OPEN|MITIGATING|CLOSED|REALISED
  clientVisible Boolean  @default(false)             // controls portal exposure
  reviewDate    DateTime?
  createdAt     DateTime @default(now())
  closedAt      DateTime?
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, type, status])
}

model ChangeRequest {
  id              String   @id @default(cuid())
  projectId       String
  crCode          String                             // "CR-001"
  title           String
  description     String
  type            String                             // SCOPE_ADD | REQUIREMENT_CHANGE | DESCOPE
  requestedBy     String                             // free text (client person or internal)
  requestedByParty String                            // CLIENT | 360GROUND
  requestDate     DateTime

  scheduleImpactDays Float  @default(0)
  costImpact         Float  @default(0)
  affectedActivityIds String[]

  status          String   @default("SUBMITTED")     // SUBMITTED|UNDER_REVIEW|APPROVED|REJECTED|IMPLEMENTED
  ccbDecisionDate DateTime?
  approvedById    String?
  clientSignOff   Boolean  @default(false)
  clientSignOffAt DateTime?
  rejectionReason String?

  createdAt       DateTime @default(now())
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, status])
}

model StageGate {
  id              String   @id @default(cuid())
  projectId       String
  phaseId         String   @unique
  name            String                             // "Requirements Gate"
  entryCriteria   String[]
  exitCriteria    String[]
  requiredDeliverables String[]
  requiredApprovals    String[]
  status          String   @default("NOT_REACHED")   // NOT_REACHED|PENDING|PASSED|FAILED|WAIVED
  gateDate        DateTime?
  approvedById    String?
  waiverReason    String?                            // MANDATORY if WAIVED
  waivedById      String?
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  phase           Phase    @relation(fields: [phaseId], references: [id], onDelete: Cascade)
}

model ClientObligation {
  id              String   @id @default(cuid())
  projectId       String
  obligation      String
  type            String                             // APPROVAL|AVAILABILITY|DATA|ACCESS|DECISION|ENVIRONMENT
  responsiblePerson String                           // named client-side person
  responsibleEmail  String?
  slaBusinessDays Int
  isContractual   Boolean  @default(false)
  breachCount     Int      @default(0)
  complianceRate  Float?                             // computed %
  notes           String?
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ApprovalSlaBreach {
  id              String   @id @default(cuid())
  projectId       String
  activityId      String
  obligationId    String?
  sentForApprovalAt DateTime
  slaBusinessDays Int
  approvedAt      DateTime?
  daysOverSla     Float
  clientApprover  String?
  createdAt       DateTime @default(now())
  @@index([projectId])
}

model CorrectionOfError {
  id              String   @id @default(cuid())
  projectId       String
  coeCode         String                             // "COE-001"
  trigger         String                             // what slipped
  daysLost        Float
  costImpact      Float?
  timeline        String                             // factual sequence
  whys            Json                               // 5-Whys chain: [{why, answer}]
  rootCauseClass  String                             // PLANNING|REQUIREMENTS|APPROVAL|IMPLEMENTATION|ESTIMATION|EXTERNAL
  systemicFix     String                             // the mechanism that prevents recurrence
  fixOwnerId      String
  fixDueDate      DateTime
  fixStatus       String   @default("OPEN")          // OPEN|IN_PROGRESS|DONE
  fedIntoTemplate Boolean  @default(false)
  closedAt        DateTime?
  createdAt       DateTime @default(now())
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model PaymentMilestone {
  id              String   @id @default(cuid())
  projectId       String
  name            String
  contractClause  String?
  triggerActivityId String?                          // fires when this activity -> APPROVED
  amount          Float
  currency        String   @default("ETB")
  plannedInvoiceDate DateTime?
  actualInvoiceDate  DateTime?
  invoiceStatus   String   @default("PENDING")       // PENDING|INVOICED|PAID|OVERDUE
  paymentStatus   String   @default("UNPAID")
  daysOutstanding Int?
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

## 3.4 Jira Integration (Epic G)

```prisma
model JiraConnection {
  id              String   @id @default(cuid())
  name            String
  siteUrl         String                             // https://xxx.atlassian.net
  authType        String   @default("API_TOKEN")     // API_TOKEN | OAUTH2
  email           String?                            // for API_TOKEN
  encryptedToken  String                             // AES-256 encrypted at rest
  projectKey      String                             // Jira project key e.g. "MEDA"
  isActive        Boolean  @default(true)
  lastSyncAt      DateTime?
  lastSyncStatus  String?                            // SUCCESS|PARTIAL|FAILED
  createdById     String
  createdAt       DateTime @default(now())
  projects        Project[]
  syncLogs        JiraSyncLog[]
  issues          JiraIssue[]
  sprints         JiraSprint[]
}

model JiraIssue {
  id              String   @id @default(cuid())
  connectionId    String
  jiraKey         String                             // "MEDA-142"
  jiraId          String
  summary         String
  issueType       String                             // Bug|Story|Task|Epic|Sub-task
  status          String
  statusCategory  String                             // TODO|IN_PROGRESS|DONE
  assigneeEmail   String?
  assigneeUserId  String?                            // resolved -> platform User
  epicKey         String?
  sprintId        String?
  storyPoints     Float?
  originalEstimateSeconds Int?
  timeSpentSeconds        Int?
  labels          String[]
  components      String[]
  jiraCreatedAt   DateTime
  jiraUpdatedAt   DateTime
  resolvedAt      DateTime?
  isBlocked       Boolean  @default(false)
  blockedSince    DateTime?
  lastActivityAt  DateTime?                          // for IDLE detection
  connection      JiraConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  worklogs        JiraWorklog[]
  transitions     JiraTransition[]
  @@unique([connectionId, jiraKey])
  @@index([assigneeUserId])
  @@index([sprintId])
}

model JiraSprint {
  id              String   @id @default(cuid())
  connectionId    String
  jiraSprintId    String
  name            String
  state           String                             // future|active|closed
  startDate       DateTime?
  endDate         DateTime?
  completeDate    DateTime?
  committedPoints Float?
  completedPoints Float?
  connection      JiraConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  @@unique([connectionId, jiraSprintId])
}

model JiraWorklog {
  id              String   @id @default(cuid())
  issueId         String
  authorEmail     String
  authorUserId    String?
  timeSpentSeconds Int
  startedAt       DateTime
  issue           JiraIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  @@index([authorUserId, startedAt])
}

model JiraTransition {
  id              String   @id @default(cuid())
  issueId         String
  fromStatus      String?
  toStatus        String
  transitionedAt  DateTime
  authorEmail     String?
  issue           JiraIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  @@index([issueId, transitionedAt])
}

model JiraSyncLog {
  id              String   @id @default(cuid())
  connectionId    String
  trigger         String                             // CRON|MANUAL|WEBHOOK
  status          String                             // SUCCESS|PARTIAL|FAILED
  issuesPulled    Int      @default(0)
  sprintsPulled   Int      @default(0)
  worklogsPulled  Int      @default(0)
  errors          String?
  durationMs      Int
  createdAt       DateTime @default(now())
  connection      JiraConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
}
```

## 3.5 Templates, Scrum, Reports, Portal

```prisma
model ProjectTemplate {
  id            String   @id @default(cuid())
  name          String                               // "Standard Software Delivery"
  description   String?
  version       Int      @default(1)
  isSystem      Boolean  @default(false)
  structureJson Json                                 // phases -> milestones -> activities
  createdById   String
  createdAt     DateTime @default(now())
  projects      Project[]
}

model ScrumLog {
  id            String   @id @default(cuid())
  projectId     String
  scrumDate     DateTime
  timeHeld      String                               // "09:15"
  durationMin   Int
  facilitatorId String
  attendeeIds   String[]
  absenteeIds   String[]
  lateIds       String[]
  blockersRaised String?
  notes         String?
  createdAt     DateTime @default(now())
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, scrumDate])
}

model ProjectReport {
  id              String   @id @default(cuid())
  projectId       String?                            // null = portfolio-level (WBR)
  type            String
  // CLIENT_BIMONTHLY | WBR | INDIVIDUAL | TEAM | SCRUM | STEERING | COE | PORTFOLIO | ESTIMATION | CAPACITY
  periodStart     DateTime
  periodEnd       DateTime
  status          String   @default("DRAFT")         // DRAFT|PM_REVIEW|APPROVED|SENT
  aiSummary       String?                            // AI-generated, PM-EDITABLE
  aiSummaryEdited Boolean  @default(false)
  contentJson     Json                               // full report payload
  generatedAt     DateTime @default(now())
  approvedById    String?
  approvedAt      DateTime?
  sentAt          DateTime?
  sentToEmails    String[]
  project         Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, type])
}

model ClientPortalUser {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  clientName    String
  passwordHash  String
  projectIds    String[]                             // HARD scope — only these projects
  isActive      Boolean  @default(true)
  lastLoginAt   DateTime?
  createdById   String
  createdAt     DateTime @default(now())
}
```

---

# PART 4 — EPICS & USER STORIES

---

# EPIC A — Project Setup & Templates

*Resolves Issue #14 (reinventing the wheel), #4 (no source of truth)*

---

## A1 — Create Project

**User Story**
> As a **Project Manager**, I want to create a new project with client, dates, PM, and budget, so that I have a single container for the entire engagement and a source of truth all reporting draws from.

**UI/UX**
Route: `/dashboard/projects` → "New Project" button (top-right, primary) → full-page wizard (not a modal — too many fields).

```
┌─────────────────────────────────────────────────────────────┐
│  New Project                        Step 1 of 3             │
│  ●━━━━━━━━━━○━━━━━━━━━━○                                    │
│  Basics      Schedule    Template                           │
├─────────────────────────────────────────────────────────────┤
│  Project Name *        [_________________________________]  │
│  Project Code          [PRJ-2026-014]      (auto, editable) │
│  Client Name *         [_________________________________]  │
│  Description           [textarea, 3 rows                  ] │
│                                                             │
│  Project Manager *     [🔍 user picker — defaults to me   ] │
│  Department            [dropdown                          ] │
│                                                             │
│  Contract Value        [__________]  Currency [ETB ▼]       │
│                                                             │
│                                    [Cancel]  [Next →]       │
└─────────────────────────────────────────────────────────────┘
```

**Form Fields**

| Field | Type | Required | Validation | Behavior |
|-------|------|----------|-----------|----------|
| `name` | text | ✅ | 3–200 chars | — |
| `code` | text | auto | unique | Auto-generated `PRJ-{YYYY}-{NNN}`, sequence per year. Editable but must stay unique. |
| `clientName` | text | ✅ | 2–100 chars | Free text |
| `description` | textarea | ❌ | max 2000 | — |
| `projectManagerId` | user picker | ✅ | must be active user | **Defaults to current user.** Searchable typeahead reusing `useUsersForSelection()` |
| `departmentId` | select | ❌ | — | Reuses `useDepartments()` |
| `contractValue` | number | ❌ | ≥ 0 | — |
| `currency` | select | ❌ | ETB/USD/EUR | Default ETB |
| `plannedStart` | date | ✅ | — | Step 2 |
| `plannedEnd` | date | ✅ | > plannedStart | Step 2 |
| `templateId` | select | ❌ | — | Step 3. "Start from template" or "Start blank" |

**Functionality**
- 3-step wizard. Progress persists per step (draft in Zustand until final submit).
- Project created in `PLANNING` status, `baselineCommittedAt = null`, `percentComplete = 0`.
- If a template is selected, the full phase→milestone→activity structure is instantiated (A2).
- PM auto-added as a `ProjectMember` with role `PM`.

**Linking & Dependencies**
- `User` (PM picker), `Department`, `ProjectTemplate`
- Writes `ActivityLog` via `recordActivity({ entityType: 'project', action: 'created' })`
- Creates `ProjectMember` row

**Acceptance Criteria**
- **Given** I'm on `/dashboard/projects`, **when** I click "New Project", **then** the 3-step wizard opens with `projectManagerId` pre-filled with my user.
- **Given** I submit step 1 with a duplicate `code`, **then** an inline error appears and I cannot advance.
- **Given** `plannedEnd ≤ plannedStart`, **when** I advance from step 2, **then** validation blocks with "End date must be after start date."
- **Given** I complete all 3 steps with a template selected, **when** I submit, **then** a project is created with the template's full phase/milestone/activity tree instantiated, status = `PLANNING`, and I land on the project's Gantt view.
- **Given** I select "Start blank", **then** the project is created with zero phases and the Gantt shows an empty state with "Add Phase" CTA.
- **Given** creation succeeds, **then** an `ActivityLog` entry exists with `action = 'created'` and `entityType = 'project'`.

**Definition of Done**
- [ ] `POST /api/projects` implemented with `withAuth`, Zod validation, `{success, data}` envelope
- [ ] Wizard component uses `react-hook-form` (no raw `useState` for form state)
- [ ] Project code sequence is transaction-safe (concurrent creates never collide)
- [ ] Template instantiation is transactional (all-or-nothing)
- [ ] `ActivityLog` entry written
- [ ] Unit tests: code generation, date validation, template instantiation
- [ ] Empty state renders when no template chosen

---

## A2 — Project Templates (Seeded Lifecycle)

**User Story**
> As a **Project Manager**, I want to start a project from a predefined template containing our standard delivery lifecycle, so that I don't rebuild the same phase structure for every engagement and our methodology becomes a reusable asset.

**Seeded Template: "Standard Software Delivery"** *(from the challenge doc's exact structure)*

| Phase | Weight | Milestones → Activities |
|-------|--------|------------------------|
| **1. Project Initiation** | 20% | Kick-off · Team Formation · **Inception Report**: IR Preparation → IR Review & Feedback → **IR Approval** *(ownerParty=CLIENT)* |
| **2. Planning, Requirements & Design** | 20% | **Requirements**: Req Gathering Sessions → Req Doc Preparation → Req Review & Feedback → **Req Approval** *(CLIENT)* |
| **3. Design Phase** | 20% | Share Brand Guide *(CLIENT)* → UI/UX Design → Design Review → **Design Approval** *(CLIENT)* |
| **4. Iterative Development** | 20% | Sprint-linked (rolls up from Jira if connected) |
| **5. Testing & Acceptance** | 20% | Test Case Prep → **Conduct UAT** *(SHARED)* → UAT Resolution → **UAT Sign-off** *(CLIENT)* |
| **6. Training & Documentation** | — | Training Material · Training Delivery · Handover Docs |
| **7. Deployment** | — | Deployment Prep → **Go-Live** → Post-Go-Live Support |

> **Critical:** every `*_Approval` activity is seeded with `ownerParty = CLIENT`. This is what makes the Approval Clock (Epic C) work out of the box.

**Additional seeded templates:**
- "Consulting / Advisory Engagement" (no Jira, no dev phases)
- "Government Tender Delivery" (adds compliance/audit gates)

**UI/UX**
Route: `/dashboard/projects/templates` (Admin/PM only)

Template builder: drag-drop tree editor. Left = tree (Phase → Milestone → Activity). Right = properties panel for selected node.

**Acceptance Criteria**
- **Given** a fresh install, **then** 3 system templates exist (`isSystem = true`), non-deletable.
- **Given** I instantiate "Standard Software Delivery", **then** 7 phases, all milestones, and all activities are created with correct `weight`, `position`, and **`ownerParty` correctly set to CLIENT on all approval activities**.
- **Given** I clone a system template, **then** an editable copy is created with `isSystem = false`.
- **Given** I edit a template, **then** existing projects using it are **unaffected** (templates are copied at instantiation, not referenced live).

**Definition of Done**
- [ ] Seed script creates 3 system templates
- [ ] Template instantiation copies structure (does not reference)
- [ ] `ownerParty = CLIENT` verified on every approval activity in seed
- [ ] Drag-drop builder persists `position` correctly
- [ ] Cloning works

---

# EPIC B — Schedule of Record

*Resolves Issue #4 (source of truth), #13 (confidence)*

---

## B1 — Manage Phases, Milestones, Activities

**User Story**
> As a **Project Manager**, I want to create and organize the project schedule as Phases → Milestones → Activities with weights, so that progress rolls up automatically and the client sees a structured plan rather than a flat task list.

**Hierarchy Rules**
- Project → **Phase** → **Milestone** → **Activity** → **Sub-activity** (exactly ONE level of nesting, matching Instagantt)
- Weights: within a parent, weights should sum to 100 (warn if not, don't block)
- Rollup: `Activity % → Milestone % → Phase % → Project %` (weighted average)

**Form Fields — Activity** *(the primary object)*

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `title` | text | ✅ | — | 3–200 chars |
| `description` | rich text | ❌ | — | WYSIWYG |
| `assigneeId` | user picker | ❌ | — | **INTERNAL ONLY** |
| `ownerParty` | radio | ✅ | `360GROUND` | 360Ground / Client / Shared |
| `currentStart` | date | ❌ | — | |
| `currentEnd` | date | ❌ | — | ≥ currentStart |
| `status` | select | ✅ | `NOT_STARTED` | 6-value enum (Image 8) |
| `percentComplete` | slider/number | ✅ | 0 | 0–100 |
| `weight` | number | ✅ | 1 | contribution to milestone |
| `estimatedHours` | number | ❌ | — | |
| `actualHours` | number | ❌ | — | |
| `estimatedCost` | number | ❌ | — | |
| `actualCost` | number | ❌ | — | |
| `priority` | select | ❌ | — | Low/Medium/High/Critical |
| `risk` | select | ❌ | — | Low/Medium/High |
| `isMilestone` | toggle | ❌ | false | renders as diamond |
| `predecessors` | multi-picker | ❌ | — | dependency links |
| `tags` | tag input | ❌ | — | colored chips |

**Status Enum** *(exact match to Image 8, including colors)*

| Status | Color | Meaning |
|--------|-------|---------|
| `NOT_STARTED` | Grey `#E5E5EA` | Not begun |
| `STARTED` | Light Blue `#A8D0F0` | In progress |
| `FINISHED` | Blue `#4A90D9` | Work complete, not yet submitted |
| `APPROVAL_REQUESTED` | Yellow `#F5D547` | **⏱ Approval clock STARTS** |
| `APPROVED` | Green `#5CB85C` | **⏱ Approval clock STOPS** |
| `REJECTED` | Orange `#F0932B` | Returned; clock stops, rework begins |

**Rollup Logic**
```typescript
// lib/projects/rollup.ts
milestonePercent = Σ(activity.percentComplete × activity.weight) / Σ(activity.weight)
phasePercent     = Σ(milestone.percentComplete × milestone.weight) / Σ(milestone.weight)
projectPercent   = Σ(phase.percentComplete × phase.weight) / Σ(phase.weight)

// Expected (planned) % as of today — from BASELINE
projectPlannedPercent = Σ(
  phase.weight × clamp01((today - baselineStart) / (baselineEnd - baselineStart))
)
```

**Acceptance Criteria**
- **Given** I add an activity with weight 2 and another with weight 1 under a milestone, **when** the first is 100% and second is 0%, **then** milestone % = 66.7%.
- **Given** I update an activity's `percentComplete`, **then** milestone, phase, and project percentages recalculate **within the same transaction**.
- **Given** weights under a parent don't sum to 100, **then** a non-blocking warning badge appears on that parent.
- **Given** an activity has sub-activities, **then** its `percentComplete` is derived from them and becomes read-only.
- **Given** `currentEnd < currentStart`, **then** save is blocked with inline error.

**Definition of Done**
- [ ] Full CRUD for Phase/Milestone/Activity with `withAuth`
- [ ] `lib/projects/rollup.ts` implements `recalcActivityAndAncestors()`
- [ ] Rollup runs in same DB transaction as the mutation
- [ ] All 6 statuses render with exact colors above
- [ ] Weight mismatch warning shown
- [ ] `ActivityLog` written on every status change

---

## B2 — Project Confidence Score

**User Story**
> As a **Project Manager**, I want the system to compute a 0–100 confidence score, so that a project at "80% complete but 40 days late with 6 open high risks" doesn't look healthy.

*Resolves Issue #13 — challenge doc: "No means to track project overall progress, good or bad progress, confidence…"*

**Formula** *(mirrors the existing OKR `lib/confidence-calc.ts` pattern)*

```typescript
confidence = 100 - penalties, clamped 0..100

penalties:
  scheduleVariance:  (percentPlanned - percentComplete) × 1.5      // behind schedule
  slipPenalty:       min(30, totalSlipDays × 0.5)                  // accumulated slip
  riskPenalty:       openHighRisks × 5                             // RAID high risks
  blockedPenalty:    blockedActivities × 3
  approvalPenalty:   min(20, pendingApprovalDays × 0.4)            // client sitting on approvals
  stalenessPenalty:  daysSinceLastUpdate > 7 ? 10 : 0
```

**RAG derivation**
```
GREEN:  confidence ≥ 75  AND  spi ≥ 0.95
AMBER:  confidence 50–74 OR   spi 0.85–0.94
RED:    confidence < 50  OR   spi < 0.85
```

**Acceptance Criteria**
- **Given** a project 60% complete but 75% planned with 20 slip days and 2 high risks, **then** confidence ≈ `100 - (15×1.5) - (20×0.5) - (2×5) = 100 - 22.5 - 10 - 10 = 57.5` → **AMBER**.
- **Given** confidence drops below 50, **then** `ragStatus = RED` and a `PROJECT_RED` notification fires to PM + CEO.
- **Given** a nightly cron, **then** confidence and RAG recompute for all active projects.

**Definition of Done**
- [ ] `lib/projects/confidence.ts` with unit tests covering each penalty
- [ ] Cron `/api/cron/project-health` recomputes nightly
- [ ] RAG change triggers notification
- [ ] Displayed on C24 ring + portfolio cards

---

# EPIC C — Baselines & The Delay Ledger

> ⭐ **THIS IS THE CORE OF THE MODULE.** Everything else is supporting infrastructure.

*Resolves Issues #1, #2, #5, #7, #25*

---

## C1 — Commit Baseline

**User Story**
> As a **Project Manager**, I want to freeze the agreed schedule as a baseline at kickoff, so that every subsequent date change is a measurable variance rather than a silent edit — making delay provable.

**Why this matters:** Without a frozen baseline, "we are 30 days late" is an opinion. With one, it is arithmetic.

**UI/UX**
Prominent banner on the project page while `baselineCommittedAt = null`:

```
┌───────────────────────────────────────────────────────────────┐
│  ⚠  BASELINE NOT COMMITTED                                     │
│  Delay tracking is inactive. Commit the baseline once the      │
│  client has agreed the schedule.        [Commit Baseline →]    │
└───────────────────────────────────────────────────────────────┘
```

Confirmation modal:
```
Commit Baseline — Version 1

This freezes the current schedule as the agreed plan.
• 47 activities will be baselined
• All future date changes will require a slip reason and owner
• This action is logged and cannot be silently undone

Baseline notes (optional): [___________________________]

                          [Cancel]  [Commit Baseline]
```

**Functionality**
- On commit: for **every** Activity/Milestone/Phase, copy `currentStart→baselineStart` and `currentEnd→baselineEnd`.
- Set `project.baselineCommittedAt = now()`, `baselineVersion = 1`.
- Write a `BaselineSnapshot` with the complete schedule as JSON.
- **After commit, `baselineStart`/`baselineEnd` are IMMUTABLE.** No API path permits editing them except a formal Re-baseline (C2).

**Acceptance Criteria**
- **Given** an uncommitted project, **then** the warning banner shows and delay tracking is inactive (`slipDays` always 0).
- **Given** I commit the baseline, **then** every activity's `baselineStart/End` equals its `currentStart/End`, and a `BaselineSnapshot` v1 exists.
- **Given** a committed baseline, **when** any API attempts to write `baselineStart`, **then** it is rejected with 403 (server-side guard, not UI).
- **Given** commit succeeds, **then** `ActivityLog` records `action = 'baseline_committed'` with the actor.

**Definition of Done**
- [ ] `POST /api/projects/[id]/baseline` implemented
- [ ] Baseline fields have a server-side write guard
- [ ] `BaselineSnapshot` stores full JSON
- [ ] Banner shows/hides correctly
- [ ] Transaction-safe across all activities

---

## C2 — Re-Baseline (Formal Schedule Revision)

**User Story**
> As a **Project Manager**, I want re-baselining to be a formal, logged, reason-required event, so that schedules cannot be quietly rewritten to hide slippage.

**UI/UX** — modal requiring:
- **Reason** (required, min 20 chars)
- Approver (defaults to CEO/Executive)
- Diff preview: shows every activity whose dates will change, with old → new

**Acceptance Criteria**
- **Given** I re-baseline, **then** `baselineVersion` increments, a new `BaselineSnapshot` is written, and the **previous baseline is preserved** (never overwritten).
- **Given** I attempt re-baseline without a reason ≥20 chars, **then** it is blocked.
- **Given** re-baseline completes, **then** reports can still show variance against **v1** (original commitment) — this is the honest number for client reporting.

**Definition of Done**
- [ ] Multiple baseline versions retained
- [ ] Reports can select baseline version (default: **v1** for client reports)
- [ ] Diff preview accurate
- [ ] `ActivityLog` + notification to CEO

---

## C3 — The Approval Clock ⭐

**User Story**
> As a **Project Manager**, I want the system to automatically start a clock the moment a deliverable is sent to the client for approval and stop it when they respond, so that client-caused delay accrues as timestamped fact that requires no argument.

**This is the single most important mechanism in the module.**

**Functionality**

```
Activity.status → APPROVAL_REQUESTED
    ├─ waitingSince = now()
    ├─ ownerParty forced to CLIENT (if it was 360GROUND)
    └─ Notification: CLIENT_APPROVAL_PENDING → client portal user + PM

    ... clock runs, visible live in T3 Pending Client Actions ...

Activity.status → APPROVED or REJECTED
    ├─ daysWaited = businessDaysBetween(waitingSince, now())
    ├─ CREATE DelayEvent {
    │      eventType: 'APPROVAL_WAIT',
    │      daysLost: daysWaited,
    │      owner: 'CLIENT',
    │      reason: 'CLIENT_APPROVAL_DELAY',
    │      isAutoDetected: true,
    │      phaseAtTime: <phase name>          // for Pareto analysis
    │  }
    ├─ IF daysWaited > obligation.slaBusinessDays:
    │      CREATE ApprovalSlaBreach { daysOverSla: daysWaited - sla }
    │      obligation.breachCount++
    └─ waitingSince = null
```

**Key rules**
- Use **business days**, not calendar days (configurable weekend/holiday calendar).
- The clock is **automatic**. The PM does not have to remember to log anything.
- If the activity sits in `APPROVAL_REQUESTED` past its SLA, escalation notifications fire at SLA, SLA+3, SLA+7.

**Acceptance Criteria**
- **Given** I set an activity to `APPROVAL_REQUESTED` on Monday, **then** `waitingSince` = Monday and `ownerParty` = `CLIENT`.
- **Given** the client approves the following Monday (5 business days later), **then** a `DelayEvent` is created with `daysLost = 5`, `owner = CLIENT`, `reason = CLIENT_APPROVAL_DELAY`, `isAutoDetected = true`.
- **Given** the client obligation SLA is 3 days and they took 5, **then** an `ApprovalSlaBreach` is created with `daysOverSla = 2` and `obligation.breachCount` increments.
- **Given** an activity sits in `APPROVAL_REQUESTED` for 3 days past SLA, **then** an escalation notification fires to the PM and the client contact.
- **Given** the activity is `REJECTED`, **then** the clock still stops and the delay is still recorded (rejection is not free).
- **Given** a weekend falls in the waiting window, **then** it is **not** counted (business days only).

**Definition of Done**
- [ ] `lib/projects/delay-ledger.ts::onStatusChange()` handles all transitions
- [ ] Business-day calculation with configurable holidays
- [ ] `DelayEvent` auto-created on approval resolution
- [ ] `ApprovalSlaBreach` created when SLA exceeded
- [ ] Escalation notifications at SLA, +3, +7
- [ ] Unit tests: weekend spanning, SLA breach, rejection path
- [ ] Live "days waiting" counter in T3 table

---

## C4 — Slip Reason & Owner Attribution

**User Story**
> As a **Project Manager**, I want to be forced to record *why* and *whose fault* whenever a baselined date moves, so that after two projects we can prove statistically where our delays actually come from.

*Resolves Issue #5 — the challenge doc's explicit unanswered question.*

**UI/UX** — When a PM drags a bar on the Gantt (or edits a date) on a **baselined** project, a modal fires immediately:

```
┌───────────────────────────────────────────────────────┐
│  Schedule Change — Reason Required                     │
├───────────────────────────────────────────────────────┤
│  Activity: Requirements Document Approval              │
│  Baseline End:  15 Aug 2026                            │
│  New End:       29 Aug 2026        (+14 days)          │
│                                                        │
│  Who caused this delay? *                              │
│   ( ) 360Ground    (•) Client    ( ) Shared            │
│                                                        │
│  Reason *                                              │
│  [ Client Approval Delay              ▼ ]              │
│                                                        │
│  Detail (optional)                                     │
│  [ Client legal review took longer than expected  ]    │
│                                                        │
│                          [Cancel]  [Record & Save]     │
└───────────────────────────────────────────────────────┘
```

**Slip Reason Taxonomy** *(reason → owner is auto-suggested but overridable)*

| Reason | Auto-suggests Owner |
|--------|---------------------|
| `CLIENT_APPROVAL_DELAY` | CLIENT |
| `CLIENT_UNAVAILABILITY` | CLIENT |
| `CLIENT_DEPENDENCY_NOT_PROVIDED` | CLIENT |
| `SCOPE_ADDITION` | CLIENT |
| `REQUIREMENT_CHANGE` | CLIENT |
| `INTERNAL_CAPACITY` | 360GROUND |
| `TECHNICAL_BLOCKER` | 360GROUND |
| `ESTIMATION_ERROR` | 360GROUND |
| `EXTERNAL_DEPENDENCY` | SHARED |

**Acceptance Criteria**
- **Given** a baselined project, **when** I move any date, **then** the reason modal appears and **the change is not saved until a reason and owner are provided**.
- **Given** a non-baselined project, **when** I move a date, **then** no modal appears (free editing pre-baseline).
- **Given** I select `SCOPE_ADDITION`, **then** owner auto-selects `CLIENT` but I can override to `SHARED`.
- **Given** I record the slip, **then** a `DelayEvent` is created with `phaseAtTime` captured for later Pareto analysis.
- **Given** I cancel the modal, **then** the Gantt bar **snaps back** to its original position.

**Definition of Done**
- [ ] Modal is a hard gate — no date write without reason
- [ ] Gantt bar reverts on cancel
- [ ] `DelayEvent` created with phase context
- [ ] Reason→owner auto-suggestion works, override permitted
- [ ] `slipDays` recomputed on activity + rolled up to project

---

## C5 — Delay Ledger Table (T1)

**User Story**
> As a **Project Manager**, I want one table showing every delay with its owner, reason, and days, so that I can answer "why are we late?" in one screen — and put that screen in front of the client.

**UI/UX**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  DELAY LEDGER                          Total: 41 days   🔴 Client: 34   🔵 360Ground: 7      │
│  [All Owners ▼] [All Reasons ▼] [All Phases ▼]                    [Export CSV] [Export PDF]  │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Activity            Phase        Original   Current    Slip  Reason                 Owner  SLA│
│ ─────────────────────────────────────────────────────────────────────────────────────────────│
│ Req Doc Approval    Planning     15 Aug     29 Aug     +14   Client Approval Delay  CLIENT 🔴3│
│ Design Approval     Design       02 Sep     09 Sep      +7   Client Approval Delay  CLIENT 🔴2│
│ Brand Guide         Design       20 Aug     01 Sep     +12   Dependency Not Provided CLIENT   │
│ API Integration     Development  10 Sep     15 Sep      +5   Technical Blocker      360G     │
│ UAT Environment     Testing      01 Oct     03 Oct      +2   Internal Capacity      360G     │
│ ─────────────────────────────────────────────────────────────────────────────────────────────│
│                                            TOTAL: 41 days                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Columns:** Activity · Phase · **Original (Baseline) Date** · **Current Date** · **Days Slipped** · **Reason** · **Owner** · SLA Breach flag · Recovery Plan · Recovery Owner · Recovery Date

**Acceptance Criteria**
- **Given** the ledger, **then** the header shows total slip split by owner, and the split is arithmetically correct.
- **Given** I filter by `Owner = CLIENT`, **then** only client-owned delays show and the total updates.
- **Given** an SLA breach exists, **then** a red badge shows the days over SLA.
- **Given** I export to CSV/PDF, **then** the file contains all visible (filtered) rows.
- **Given** a delay has no recovery plan and is > 7 days, **then** a warning icon prompts the PM to add one (Slootman: every red item gets a name and a date).

**Definition of Done**
- [ ] Table with sort, filter, export
- [ ] Totals computed server-side (not client-side sum of a page)
- [ ] SLA breach badges
- [ ] Recovery plan inline editable
- [ ] Rendered in PM view AND client portal (client sees it too — that's the point)

---

# EPIC D — Gantt Chart (Instagantt Parity)

> **This must be a functional duplicate of Instagantt as shown in the provided screenshots.**
> Build it as a custom React component. Do **not** use `dhtmlx-gantt` (already in the platform for
> the OKR Plans page but too rigid for baseline overlays and custom status colors).

*Resolves Issue #4, #19*

---

## D1 — Gantt Layout & Structure

**User Story**
> As a **Project Manager**, I want a Gantt chart identical in behavior to Instagantt, so that I can see the whole schedule, its dependencies, and its slippage at a glance — and so can the client.

**UI/UX — Exact Layout** *(Image 1 parity)*

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Project Name  ⚙▾   [🌡 On Time] [📅 Jul 12, 2026] [👤 Unassigned] [⚡ Priority] [🔥 Risk]      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 📊 Gantt ⭐  │ ▦ Table │ ☰ Board │ 👥 Workload │ 🕸 Mindmap │ ◎ Overview                 │  │  ← view tabs
│  └──────────────────────────────────────────────────────────────────────────────────────────┘  │
│  Export & Share▾  Baselines▾  Options▾  Columns▾  Segments▾  │ ⟲ │ ⑂ │ ⧉ │ ▤ │ 💬 │ 🗺 │ ✨AI │
│                                                        Sort by: Date ▾    Scale: Days ▾        │
├──────────────────────┬─────────────────────────────────────────────────────────────────────────┤
│  ⊞ ⊟ [🔍 Search... ] │        Jul 2026          W30         W31         Aug 2026      W33      │
│  ASSIGNEE EH START DUE STATUS │ 11 (12) 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 │
├──────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ ⊟ Phase: Initiation  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (dark grey summary bar)                  │
│ 1  ○ Kick-off        │     ████████  Kick-off                                                  │
│ 2  ○ Team Formation  │        ██████  Team Formation                                           │
│ 3  ⊟ IR Preparation  │           ▬▬▬▬▬▬▬  (has subtasks)                                       │
│ 4    ○ Draft IR      │            ████  Draft IR                                               │
│ 5    ○ Internal Rev  │              ███  Internal Review                                       │
│ 6  ○ IR Approval  🔶 │                  ◆────► IR Approval (milestone, CLIENT)                 │
│ 7  ○ Req Gathering   │                      ████████──┐                                        │
│ 8  ○ Req Doc Prep    │                              └─► ██████  (dependency arrow)             │
│                      │  ░░░░░ baseline ghost bar under actual bar ░░░░░                        │
│  [+ Add task] [+ Add section]                                                                  │
├──────────────────────┴─────────────────────────────────────────────────────────────────────────┤
│  [Open workload availability ▾]                                            [minimap ▣]  [+][-] │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Structural Requirements**

| Element | Behavior |
|---------|----------|
| **Split pane** | Left = task list (resizable, draggable divider). Right = timeline. Synchronized vertical scroll. |
| **Left columns** | Configurable via `Columns▾`: Assignee · EH (Estimated Hours) · Start · Due · Status · Priority · Risk · % Complete · Owner Party |
| **Row types** | Phase (dark summary bar) · Milestone · Activity · Sub-activity (indented) |
| **Collapse/expand** | `⊞ ⊟` per row + global expand/collapse all |
| **Search** | Filters task list live |
| **Today marker** | Vertical red line + red circle on date header (Image 1: the red `12`) |
| **Timeline header** | Two rows: month/year + day numbers, with week numbers (W30, W31) |
| **Scale** | Days / Weeks / Months / Quarters / Years (`Scale▾` dropdown) |
| **Zoom** | `+` / `-` buttons + percentage indicator (100%) |
| **Minimap** | Bottom-right, shows viewport position over full project (Image 1) |
| **Sort** | By Date / Name / Status / Priority (`Sort by▾`) |

**Acceptance Criteria**
- **Given** the Gantt loads, **then** left and right panes scroll in perfect vertical sync.
- **Given** I drag the divider, **then** the split resizes and the position persists per user.
- **Given** I collapse a phase, **then** all its children hide and the summary bar remains.
- **Given** today's date, **then** a red vertical line renders at the correct x-position and the day number is highlighted red in the header.
- **Given** I change scale to Months, **then** bars resize proportionally and the header re-renders.
- **Given** 200+ activities, **then** the timeline **virtualizes** rows and stays at 60fps while scrolling.

**Definition of Done**
- [ ] Custom React Gantt (no dhtmlx)
- [ ] Virtualized rows (react-window or equivalent)
- [ ] Synced scroll, resizable divider (persisted)
- [ ] All 5 scales working
- [ ] Minimap functional
- [ ] Performance: 500 activities @ 60fps

---

## D2 — Gantt Bars, Baseline Overlay & Colors

**User Story**
> As a **Project Manager**, I want each bar to show both the baseline and the actual, so that slippage is visible without reading a single number.

**Bar Rendering**

```
Baseline (frozen)   ░░░░░░░░░░░░░░              ← light grey ghost, BELOW
Actual (current)    ████████████████████        ← status color, ABOVE
                    ↑                    ↑
                    baselineStart        currentEnd (14 days later = visible slip)
```

- **Actual bar** color = status color (D1 enum).
- **Baseline ghost bar** = `#D1D1D6` at 40% opacity, rendered 4px below the actual bar, only when `baselineCommittedAt != null`.
- **Progress fill**: darker shade filling `percentComplete`% of the actual bar width.
- **Milestone**: renders as a **diamond ◆** instead of a bar (`isMilestone = true`).
- **Phase summary bar**: dark grey, spans min(children start) → max(children end), with bracket ends (Image 1).
- **Label**: task name to the right of the bar.
- **RAG tint**: bars on RED activities get a subtle red glow/border.

**Acceptance Criteria**
- **Given** a baselined activity that slipped 14 days, **then** the grey ghost bar ends 14 days before the actual bar, and the gap is visually obvious.
- **Given** `percentComplete = 60`, **then** 60% of the bar is filled with a darker shade.
- **Given** `isMilestone = true`, **then** a diamond renders at `currentEnd`, not a bar.
- **Given** a phase row, **then** its bar auto-spans its children and cannot be dragged directly.
- **Given** status = `APPROVAL_REQUESTED`, **then** the bar is yellow `#F5D547` and shows a small ⏱ icon with days-waiting count.

**Definition of Done**
- [ ] Baseline ghost bar renders correctly
- [ ] All 6 status colors exact
- [ ] Progress fill accurate
- [ ] Milestone diamonds
- [ ] Phase summary auto-span
- [ ] Approval clock badge on yellow bars

---

## D3 — Drag, Resize & Dependency Auto-Shift

**User Story**
> As a **Project Manager**, I want to drag a task and have its dependent tasks move with it, so that rescheduling reflects real constraints — exactly as Instagantt does (Image 2: *"By moving this task, the successor task will also be moved"*).

**Interactions**

| Interaction | Behavior |
|-------------|----------|
| **Drag bar horizontally** | Moves both start and end (preserves duration) |
| **Drag left edge** | Changes start only (resize) |
| **Drag right edge** | Changes end only (resize) |
| **Drop** | **If baselined → C4 reason modal fires. If cancelled → bar snaps back.** |
| **Successor auto-shift** | All FS successors shift by the same delta, cascading transitively |
| **Draw dependency** | Hover bar → connector handles appear on both ends → drag to another bar |
| **Delete dependency** | Click arrow → confirm |
| **Circular check** | Attempting a cycle is blocked with a clear error |

**Acceptance Criteria**
- **Given** Task A has successor B (FS), **when** I drag A 5 days later, **then** B also shifts 5 days later automatically.
- **Given** a chain A→B→C, **when** I move A, **then** both B and C shift transitively.
- **Given** a baselined project, **when** I drop a drag, **then** the C4 reason modal fires **before** persisting.
- **Given** I cancel the reason modal, **then** the bar and **all auto-shifted successors** revert.
- **Given** I try to make C a predecessor of A (cycle), **then** it is blocked with "This would create a circular dependency."
- **Given** I drag, **then** a live tooltip shows the new start/end dates as I move.

**Definition of Done**
- [ ] `lib/projects/scheduling.ts::shiftSuccessors()` with cycle detection
- [ ] Drag/resize with live tooltip
- [ ] Reason modal gate on baselined projects
- [ ] Full revert on cancel (including cascaded shifts)
- [ ] Dependency draw/delete UI
- [ ] All 4 dependency types (FS/SS/FF/SF), FS default

---

## D4 — Gantt Toolbar

**User Story**
> As a **Project Manager**, I want the full Instagantt toolbar, so that I can export, toggle baselines, configure columns, and control the view.

**Toolbar Items** *(Image 1)*

| Control | Function |
|---------|----------|
| **Export & Share ▾** | Export PDF · Export PNG · Export CSV · Export MS Project XML · **Share to client portal** |
| **Baselines ▾** | Show/hide baseline bars · Select baseline version (v1, v2…) · **Commit baseline** · Re-baseline |
| **Options ▾** | Show dependencies · Show progress fill · Show critical path · Show weekends · Show today marker |
| **Columns ▾** | Toggle: Assignee · EH · Start · Due · Status · Priority · Risk · % · Owner Party · Slip Days |
| **Segments ▾** | Group by: Phase · Assignee · Status · Owner Party |
| **⟲ Undo** | Undo last schedule change |
| **⑂ Critical Path** | Highlight the critical path in red |
| **⧉ Duplicate** | Duplicate selected activity |
| **▤ Legend** | Show status color legend |
| **💬 Comments** | Toggle comment indicators on bars |
| **🗺 Minimap** | Toggle minimap |
| **✨ AI Assistant** | AI schedule suggestions (see J6) |
| **Sort by ▾** | Date · Name · Status · Priority |
| **Scale ▾** | Days · Weeks · Months · Quarters · Years + Today indicator on/off *(Image 5)* |

**Acceptance Criteria**
- **Given** `Baselines▾ → Hide`, **then** ghost bars disappear.
- **Given** `Options▾ → Critical Path`, **then** the longest zero-float path highlights red.
- **Given** `Columns▾`, **then** toggling a column adds/removes it from the left pane and persists per user.
- **Given** `Export & Share → PDF`, **then** a print-ready Gantt PDF downloads with the project header.
- **Given** `Scale▾` (Image 5), **then** I can set Days/Weeks, calendar days vs week numbers, and enable/disable the today indicator.

**Definition of Done**
- [ ] All toolbar dropdowns functional
- [ ] Critical path algorithm (CPM forward/backward pass)
- [ ] PDF/PNG/CSV/MSProject export
- [ ] Column preferences persisted per user
- [ ] Scale panel matches Image 5 exactly

---

# EPIC E — View Toggles

*Resolves Issue #16 (capacity), #4*

---

## E1 — View Switcher

**User Story**
> As a **Project Manager**, I want to switch between Gantt, Table, Board, Workload, Mindmap, and Overview without losing context, so that I can use the right lens for the task at hand.

**Views** *(Image 1 tab bar)*

| View | Purpose | Key Elements |
|------|---------|--------------|
| **Gantt** ⭐ | Default. Schedule + slippage | Epic D |
| **Table** | Bulk edit, spreadsheet-style | Inline edit, multi-select, bulk status/assignee change, column sort/filter |
| **Board** | Kanban by status | 6 columns matching status enum. Drag between columns = status change (fires approval clock). |
| **Workload** | Capacity | People × weeks heatmap. Over-allocated red, idle grey. *(Issue #16)* |
| **Mindmap** | Structure visualization | Radial tree: Project → Phases → Milestones → Activities *(Image 4)* |
| **Overview** | Project dashboard | C24 ring + KPI cards + charts + registers *(Images 3, 9)* |

**Acceptance Criteria**
- **Given** I switch views, **then** the active filter/search persists across views.
- **Given** the Board view, **when** I drag a card from "Finished" to "Approval Requested", **then** the approval clock starts (C3) and the client is notified.
- **Given** the Workload view, **then** anyone over 100% allocation shows red with their total %.
- **Given** the Overview, **then** it renders the C24 completion ring (Image 9 parity) with Expected % vs Actual %.

**Definition of Done**
- [ ] All 6 views implemented
- [ ] Filters persist across view switches (Zustand)
- [ ] Board drag = real status transition with all side effects
- [ ] Workload computed across ALL projects, not just this one
- [ ] Overview matches Image 3 + Image 9

---

# EPIC F — Activity Detail Panel & Comments

*Resolves Issue #3, #19*

---

## F1 — Activity Detail Panel

**User Story**
> As a **Project Manager**, I want a rich side panel for each activity with all its fields, subtasks, and a comment thread, so that all context lives in one place — exactly as Instagantt does.

**UI/UX — Exact Layout** *(Image 2 parity)*

```
┌──────────────────────────────────────────────────────────┐
│  [✓ Mark as done]        [⇤][⇥] [◇] [🎨] [🗑] │ [✕]      │  ← outdent/indent/milestone/color/delete
├──────────────────────────────────────────────────────────┤
│  📁 Phase: Planning, Requirements & Design               │
│                                                          │
│  Requirements Document Approval                    [✏]   │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │ 👤 Assignee          │  │ 📅 Dates                 │ │
│  │    Meklit Haile      │  │    24 — 29 Jul 2026   ✕  │ │
│  └──────────────────────┘  └──────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🏢 Owner Party:  ( )360Ground  (•)Client  ( )Shared│  │  ← ADDED (not in Instagantt)
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ▓▓▓▓▓▓▓░░░░░░░░░  60% complete                          │
│                                                          │
│  ┌────────┬────────┬────────┐                            │
│  │   40   │   35   │ 12,000 │                            │
│  │Estimated│ Actual │Est.Cost│                            │
│  ├────────┼────────┼────────┤                            │
│  │ 10,500 │  High  │ Medium │                            │
│  │Act.Cost│Priority│  Risk  │                            │
│  └────────┴────────┴────────┘                            │
│                                                          │
│  ⏱ AWAITING CLIENT APPROVAL — 7 business days           │  ← ADDED (approval clock)
│     SLA: 3 days  🔴 BREACHED by 4 days                   │
│                                                          │
│  ☑ Subtasks                              [+ Add]         │
│     ☑ Draft requirements doc                             │
│     ☐ Internal review                                    │
│                                                          │
│  📄 Details                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📝 Description                                    │   │
│  │    Full requirements specification for client...  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 🏷  [+ Add tags]   [requirements] [phase-2]      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 📊 Status              [Approval Requested ▼]     │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 🔗 Predecessors        [+ Add]                    │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 📎 Add files                                      │   │
│  │    📄 requirements-v2.pdf   [👁 Client visible]   │   │  ← visibility toggle
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  💬 Comments                                             │
│     ┌────────────────────────────────────────────────┐  │
│     │ Biruk H. · 2 days ago        [🔒 Internal]     │  │
│     │ Client legal is reviewing. Chased Tuesday.     │  │
│     └────────────────────────────────────────────────┘  │
│     ┌────────────────────────────────────────────────┐  │
│     │ Client PM · 1 day ago        [👁 Client]       │  │
│     │ Our legal team needs one more week.            │  │
│     └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  [ Mention people using '@'                        ] [➤] │
│  Visibility: (•) Internal   ( ) Visible to client         │  ← CRITICAL
└──────────────────────────────────────────────────────────┘
```

**Header Actions** *(Images 2, 6, 7)*

| Icon | Action | Tooltip |
|------|--------|---------|
| ✓ | Mark as done | Sets status → FINISHED, % → 100 |
| ⇤ | **Outdent** | Promote sub-activity to activity *(Image 6)* |
| ⇥ | **Indent** | Demote activity to sub-activity of the row above |
| ◇ | **Convert to Milestone** | Sets `isMilestone = true` *(Image 7)* |
| 🎨 | Color | Custom bar color override |
| 🗑 | Delete | Confirm dialog |
| ✕ | Close | Closes panel |

**Acceptance Criteria**
- **Given** I click a Gantt bar, **then** the panel slides in from the right with all fields populated.
- **Given** an activity in `APPROVAL_REQUESTED`, **then** the approval clock banner shows live business-days-waiting and SLA breach status in red.
- **Given** I click ⇥ (Indent), **then** the activity becomes a sub-activity of the row above and the Gantt re-renders.
- **Given** I click ◇, **then** it becomes a milestone diamond on the Gantt.
- **Given** I change status to `APPROVAL_REQUESTED`, **then** the approval clock starts and the client is notified.
- **Given** I edit any field, **then** it saves optimistically with an undo toast.

**Definition of Done**
- [ ] Panel matches Image 2 layout exactly + our 3 additions (Owner Party, approval clock, visibility toggles)
- [ ] All 7 header actions functional
- [ ] Indent/outdent restructures hierarchy correctly
- [ ] Approval clock banner live-updates
- [ ] Optimistic save with undo

---

## F2 — Comments with Internal/Client Visibility ⭐

**User Story**
> As a **Project Manager**, I want to mark each comment as internal or client-visible, so that my team can speak candidly while the client sees only what's intended for them.

> ⚠️ **This is a hard data rule.** An `INTERNAL` comment must be **physically absent** from the client portal API response — not hidden by CSS.

**Acceptance Criteria**
- **Given** I post a comment with visibility `INTERNAL`, **then** the client portal API **never returns it** (verified by inspecting the raw response).
- **Given** I post with `CLIENT_VISIBLE`, **then** the client sees it in the portal.
- **Given** a client posts a comment in the portal, **then** it appears internally with `isClientAuthor = true` and a distinct badge.
- **Given** I @mention a user, **then** they receive a notification.
- **Given** the default visibility selector, **then** it defaults to **`INTERNAL`** (fail-safe).

**Definition of Done**
- [ ] Visibility field on every comment, defaulting to INTERNAL
- [ ] Client portal serializer **filters at the query level** (`WHERE visibility = 'CLIENT_VISIBLE'`)
- [ ] Same rule for attachments
- [ ] @mention notifications
- [ ] Client-authored comments visually distinct internally

---

# EPIC G — Jira Integration (Optional)

*Resolves Issues #8, #9, #10, #11, #12*

---

## G1 — Connect Jira

**User Story**
> As a **Project Manager**, I want to connect a project to a Jira board with an API token, so that execution data flows in automatically without me copying anything.

**UI/UX** — Project Settings → Integrations tab

```
┌──────────────────────────────────────────────────────────┐
│  Jira Integration                        [Not Connected] │
├──────────────────────────────────────────────────────────┤
│  Jira Site URL *    [https://360ground.atlassian.net   ] │
│  Email *            [pm@360ground.com                  ] │
│  API Token *        [••••••••••••••••••]  [How to get?] │
│  Project Key *      [MEDA                              ] │
│                                                          │
│                              [Test Connection]  [Save]   │
├──────────────────────────────────────────────────────────┤
│  ✅ Connection successful — found 142 issues, 8 sprints  │
└──────────────────────────────────────────────────────────┘
```

**Security**
- Token **AES-256 encrypted at rest**. Never returned by any API (write-only field).
- Test Connection calls `GET /rest/api/3/myself` before saving.

**Acceptance Criteria**
- **Given** valid credentials, **when** I click Test Connection, **then** it confirms and shows issue/sprint counts.
- **Given** invalid credentials, **then** a clear error shows (401 → "Invalid token", 404 → "Project key not found").
- **Given** I save, **then** the token is encrypted and `project.jiraLinked = true`.
- **Given** I view the connection later, **then** the token field shows `••••` and is never sent to the client.

**Definition of Done**
- [ ] AES-256 encryption at rest
- [ ] Token never in any API response
- [ ] Test Connection endpoint
- [ ] Clear error mapping (401/403/404/429)

---

## G2 — Sync Engine

**User Story**
> As the **System**, I want to pull issues, sprints, worklogs, and changelogs from Jira on a schedule, so that all execution data is available for rollup and performance reporting.

**What we pull** (Jira Cloud REST API v3)

| Endpoint | Data | Used For |
|----------|------|----------|
| `/rest/api/3/search` (JQL) | Issues + fields | Rollup, performance |
| `/rest/agile/1.0/board/{id}/sprint` | Sprints | Velocity |
| `/rest/api/3/issue/{key}/worklog` | Worklogs | Actual hours, estimate accuracy |
| `/rest/api/3/issue/{key}/changelog` | Transitions | Cycle time, blocked duration, **idle detection** |

**Sync**
- Cron every 30 min: `POST /api/cron/jira-sync`
- Manual "Sync Now" button
- Incremental: `JQL: project = KEY AND updated >= -35m`
- Rate-limit aware (Jira: 10 req/sec) with exponential backoff
- Every sync writes a `JiraSyncLog`

**Acceptance Criteria**
- **Given** the cron runs, **then** all active connections sync and a `JiraSyncLog` is written per connection.
- **Given** Jira returns 429, **then** we back off exponentially and retry, and the log shows `PARTIAL`.
- **Given** a Jira user email matches a platform `User.email`, **then** `assigneeUserId` resolves automatically.
- **Given** a sync fails, **then** the PM sees an error banner on the project with the reason.
- **Given** Jira is unreachable, **then** the project still functions fully on Layer 1 data (graceful degradation).

**Definition of Done**
- [ ] All 4 endpoints consumed
- [ ] Incremental sync (not full re-pull)
- [ ] Rate limiting + backoff
- [ ] Email → User resolution
- [ ] `JiraSyncLog` for every run
- [ ] Failure never breaks the project page

---

## G3 — Map Jira Issues to Activities

**User Story**
> As a **Project Manager**, I want to map Jira epics/labels to my schedule activities, so that Jira progress automatically rolls up into the client-facing plan.

**Mapping Rules**
| Rule Type | Example |
|-----------|---------|
| By **Epic** | Jira Epic `MEDA-1` → Activity "API Integration" |
| By **Label** | Label `auth-module` → Activity "Authentication" |
| By **Component** | Component `Frontend` → Activity "UI Development" |
| By **Sprint** | Sprint → Phase "Iterative Development" |
| **Manual** | Explicit issue-key list |

**Rollup**
```typescript
if (activity.jiraAutoRollup) {
  activity.percentComplete = (doneIssues / totalIssues) × 100
  // OR story-point-weighted if points exist
}
// PM can always override manually — manual wins
```

**Acceptance Criteria**
- **Given** I map Epic `MEDA-1` to an activity with `jiraAutoRollup = true`, **when** 6 of 10 issues are Done, **then** activity % = 60.
- **Given** the PM manually sets %, **then** `jiraAutoRollup` turns off and the manual value persists.
- **Given** no mapping exists, **then** the activity is 100% manual (no Jira influence).

**Definition of Done**
- [ ] All 5 mapping rule types
- [ ] Auto-rollup on sync
- [ ] Manual override wins
- [ ] Mapping UI with live preview of matched issues

---

## G4 — Idle Days & Estimate Accuracy ⭐

**User Story**
> As a **Project Manager**, I want to see which developers had days with no activity and how accurate their estimates were, so that I can coach based on evidence rather than impression.

*Resolves Issue #10 and #11 — both explicitly requested in the challenge doc.*

**Idle Days**
```typescript
// A day is IDLE for a user if, on that working day, they had:
//   - no Jira transition, AND
//   - no worklog, AND
//   - no comment
idleDays = workingDaysInPeriod.filter(day => !hasActivity(user, day))
```

**Estimate Accuracy**
```typescript
estimateAccuracy = actualHours / estimatedHours
// 1.0 = perfect · >1.0 = underestimated · <1.0 = overestimated
estimatorBias = median(estimateAccuracy across all their issues)
```

**Acceptance Criteria**
- **Given** a developer had no Jira activity Mon–Wed, **then** idle days = 3 for that week.
- **Given** an issue estimated 8h took 12h, **then** accuracy = 1.5 (underestimated by 50%).
- **Given** a developer's median accuracy is 1.4 across 20 issues, **then** their estimator bias is flagged as "systematically underestimates."
- **Given** weekends/holidays, **then** they are excluded from idle-day counts.

**Definition of Done**
- [ ] Idle detection uses transitions + worklogs + comments
- [ ] Working-day calendar (excludes weekends + configured holidays)
- [ ] Estimate accuracy per issue and median per person
- [ ] Both surface in R3 and feed the Performance module

---

## G5 — Jira Adoption Score

**User Story**
> As a **Project Manager**, I want a score showing how well the team is actually using Jira, so that I can fix data hygiene before I trust any report built on it.

*Resolves Issue #8.*

```typescript
adoptionScore = weighted average of:
  - % issues with an assignee                 (25%)
  - % issues with an original estimate        (25%)
  - % issues updated within last 3 days       (25%)
  - % issues with story points (if used)      (25%)
```

**Acceptance Criteria**
- **Given** 80% of issues have assignees, 40% have estimates, 90% updated recently, 60% pointed, **then** score = `(80+40+90+60)/4 = 67.5%`.
- **Given** score < 60%, **then** a warning banner appears on reports: *"Jira data quality is low (67%). Metrics may be unreliable."*

**Definition of Done**
- [ ] Score computed per project and per team
- [ ] Warning banner on reports when < 60%
- [ ] Shown in R4 Team Report

---

## G6 — Scrum Attendance Log ⭐

**User Story**
> As a **Project Manager**, I want to log daily standup attendance, so that we can finally track who attends, when, and how often.

*Resolves Issue #12 — the challenge doc calls this **"critical and important."***

**UI/UX** — Quick-log widget on the project page:

```
┌────────────────────────────────────────────────────────┐
│  Daily Scrum — 12 Jul 2026                             │
│  Time held: [09:15]   Duration: [15] min               │
│  Facilitator: [Biruk H. ▼]                             │
│                                                        │
│  Attendance:                                           │
│   ☑ Eyob T.     ☑ Yohannes M.   ☐ Mintesinot A.       │
│   ☑ Meklit H.   ⏰ Dawit K. (late)                     │
│                                                        │
│  Blockers raised: [___________________________]        │
│                              [Cancel]  [Log Scrum]     │
└────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**
- **Given** I log a scrum, **then** attendees/absentees/late are stored with the date and time held.
- **Given** the period report, **then** it shows: total scrums held · days attended per person · attendance rate % per person · team attendance rate.
- **Given** a person's attendance rate < 70%, **then** they are flagged in R5.
- **Given** a scrum is already logged for that date, **then** re-logging edits the existing record (unique on `projectId + scrumDate`).

**Definition of Done**
- [ ] Quick-log widget
- [ ] R5 Scrum Attendance Report with C16 heatmap
- [ ] Attendance % computed per person
- [ ] Feeds Performance module (accountability signal)

---

# EPIC H — Governance Registers

*Resolves Issues #6, #17, #18, #21, #22, #23*

---

## H1 — RAID Log

**User Story**
> As a **Project Manager**, I want a formal RAID register (Risks, Assumptions, Issues, Dependencies), so that our government and enterprise clients see the delivery discipline they expect.

*Resolves Issue #18.*

**UI/UX** — 4 tabs: Risks · Assumptions · Issues · Dependencies

**Risk Matrix** — 5×5 grid (Probability × Impact), items plotted as dots, color by score:
- Score 1–6: Green · 8–12: Amber · 15–25: Red

**Fields per type** — as per §3.3 `RaidItem`.

**Acceptance Criteria**
- **Given** I create a Risk with P=4, I=5, **then** score = 20 and it plots in the red zone of the matrix.
- **Given** an Issue is open 15 days, **then** `daysOpen` auto-computes and shows.
- **Given** a Dependency with `dependsOnParty = CLIENT` and `neededByDate` passed, **then** it flags red and can generate a `DelayEvent`.
- **Given** `clientVisible = true`, **then** the item appears in the client portal; otherwise it does not.
- **Given** high risks exist, **then** they penalize the project confidence score (B2).

**Definition of Done**
- [ ] 4 RAID types with type-specific fields
- [ ] 5×5 risk matrix visualization
- [ ] `daysOpen` auto-computed
- [ ] Client visibility flag respected in portal
- [ ] High risks feed confidence penalty

---

## H2 — Change Control Board

**User Story**
> As a **Project Manager**, I want every scope change formally logged with its schedule and cost impact and approved before work starts, so that scope creep becomes a costed decision rather than a silent drift.

*Resolves Issue #6.*

**Workflow:** `SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED → IMPLEMENTED`

**Acceptance Criteria**
- **Given** a CR is approved with `scheduleImpactDays = 14`, **then** a `DelayEvent` is auto-created with `reason = SCOPE_ADDITION`, `owner = CLIENT`, `daysLost = 14`.
- **Given** a CR is approved, **then** the affected activities' `currentEnd` dates shift accordingly.
- **Given** a CR is pending, **then** it appears in the client report's Change Requests section.
- **Given** cumulative approved CRs, **then** C22 Scope Volatility chart plots the running total.

**Definition of Done**
- [ ] Full CR workflow
- [ ] Approved CR auto-creates DelayEvent and shifts schedule
- [ ] Client sign-off capture
- [ ] Appears in R2 and R6

---

## H3 — Stage-Gates

**User Story**
> As a **Project Manager**, I want each phase to have a formal gate with entry/exit criteria, so that Development cannot start before Requirements are approved.

*Resolves Issue #17.*

**Acceptance Criteria**
- **Given** a phase with an unpassed gate, **when** I try to set any activity in the *next* phase to `STARTED`, **then** a warning fires: *"Requirements Gate has not passed. Proceed anyway?"* — with an optional override requiring a logged reason.
- **Given** all exit criteria are checked and required approvals obtained, **then** the gate can be marked `PASSED`.
- **Given** a gate is `WAIVED`, **then** a `waiverReason` is **mandatory** and logged.
- **Given** the steering pack (R6), **then** gate status shows per phase.

**Definition of Done**
- [ ] Gate criteria checklists
- [ ] Soft block on next-phase start with override + reason
- [ ] Waiver requires reason
- [ ] Gate status in reports

---

## H4 — Client Obligations & SLA Tracking

**User Story**
> As a **Project Manager**, I want to record the client's contractual obligations with named people and SLAs, so that "the client was slow" becomes "the client breached a 5-day SLA nine times."

*Resolves Issue #21.*

**Acceptance Criteria**
- **Given** an obligation "Approve deliverables within 5 business days" with a named approver, **when** an approval takes 9 days, **then** an `ApprovalSlaBreach` is created with `daysOverSla = 4` and `breachCount` increments.
- **Given** breaches accumulate, **then** `complianceRate` = `(approvals within SLA / total approvals) × 100`.
- **Given** compliance < 60%, **then** the Client Health Score (C9) drops and a warning surfaces to the CEO.
- **Given** R6 Steering Pack, **then** the Client Obligations scorecard shows compliance rate and breach count.

**Definition of Done**
- [ ] Obligations register with named people + SLA
- [ ] Automatic breach detection tied to approval clock (C3)
- [ ] Compliance rate computed
- [ ] Feeds Client Health Score
- [ ] Appears in R6

---

## H5 — Correction of Errors (COE)

**User Story**
> As a **CEO**, I want every major slip to produce a written 5-Whys root cause and a systemic fix, so that we learn instead of blame.

*Resolves Issue #22.*

**Trigger:** Auto-prompted when a milestone slips > 10 days OR a project goes RED.

**Acceptance Criteria**
- **Given** a milestone slips 15 days, **then** the PM is prompted to create a COE.
- **Given** a COE, **then** the 5-Whys chain requires 5 entries before it can close.
- **Given** `systemicFix` is filled and `fedIntoTemplate = true`, **then** the fix appears in the Lessons Learned register.
- **Given** the CEO dashboard, **then** open COEs with overdue fixes are surfaced.

**Definition of Done**
- [ ] Auto-trigger on threshold
- [ ] 5-Whys structured input
- [ ] Root cause classification (feeds C18 Pareto)
- [ ] Template feedback loop

---

## H6 — Payment Milestones

**User Story**
> As a **CEO**, I want deliverable approval to trigger the invoice, so that delivery and cash are connected.

*Resolves Issue #23.*

**Acceptance Criteria**
- **Given** a payment milestone linked to activity X, **when** X → `APPROVED`, **then** the milestone flags "Ready to Invoice" and notifies finance.
- **Given** an invoice is > 30 days outstanding, **then** it flags overdue on the CEO dashboard.

**Definition of Done**
- [ ] Trigger on activity approval
- [ ] Notification to finance
- [ ] Overdue tracking

---

# EPIC I — Client Portal

> ⚠️ **ANONYMIZATION IS A DATA-LAYER RULE, NOT A UI TOGGLE.**
> The client portal uses **separate API routes with separate serializers** that are physically
> incapable of returning individual names. This is not a filter on the internal API.

*Resolves Issue #19, #2*

---

## I1 — Client Portal Authentication

**User Story**
> As a **Client PM**, I want to log into a portal scoped only to my projects, so that I can self-serve status without emailing 360Ground.

**Route:** `/portal` (separate from `/dashboard`)
**Auth:** Separate `ClientPortalUser` model. NextAuth with a distinct provider/callback. **Never mixed with internal `User` sessions.**

**Acceptance Criteria**
- **Given** a client user, **then** they can only see projects in their `projectIds` array.
- **Given** a client user attempts to access `/dashboard/*`, **then** they receive 403.
- **Given** an internal user visits `/portal`, **then** they can preview but a banner shows "Viewing as client — this is what they see."

**Definition of Done**
- [ ] Separate auth flow
- [ ] Hard project scoping
- [ ] `/dashboard` blocked for client users
- [ ] "Preview as client" for PMs

---

## I2 — Anonymized Serializer ⭐

**User Story**
> As a **Project Manager**, I want absolute certainty that no employee name ever reaches the client, so that individual performance stays internal.

**Implementation Rule**

```typescript
// features/projects/services/portal-serializer.ts
// THIS IS THE ONLY WAY CLIENT DATA IS SERIALIZED.

export function serializeActivityForClient(a: Activity): ClientActivity {
  return {
    id: a.id,
    title: a.title,
    // ownerParty is what the client sees INSTEAD of assignee
    owner: a.ownerParty === 'CLIENT' ? 'Your Team' : '360Ground Team',
    baselineStart: a.baselineStart,
    baselineEnd: a.baselineEnd,
    currentStart: a.currentStart,
    currentEnd: a.currentEnd,
    status: a.status,
    percentComplete: a.percentComplete,
    slipDays: a.slipDays,
    slipReason: a.slipReason,
    slipOwner: a.slipOwner,
    waitingSince: a.waitingSince,
    // ❌ assigneeId       — NEVER
    // ❌ estimatedHours   — NEVER (internal cost data)
    // ❌ actualHours      — NEVER
    // ❌ estimatedCost    — NEVER
    // ❌ actualCost       — NEVER
    // ❌ jiraIssueKeys    — NEVER
  };
}
```

**Forbidden in ALL client responses:**
- ❌ Any `assigneeId` / user name / avatar
- ❌ Individual performance data of any kind
- ❌ Internal comments (`visibility = INTERNAL`)
- ❌ Internal attachments
- ❌ Cost/margin fields
- ❌ Jira issue keys or links
- ❌ Other clients' projects
- ❌ RAID items with `clientVisible = false`

**Acceptance Criteria**
- **Given** a client requests any portal endpoint, **when** I inspect the **raw JSON response**, **then** **no employee name, userId, or avatar URL appears anywhere.**
- **Given** an internal comment, **then** the client portal query **excludes it at the SQL level** (`WHERE visibility = 'CLIENT_VISIBLE'`), not in the UI.
- **Given** an activity assigned to Meklit, **then** the client sees owner = "360Ground Team".
- **Given** an automated test suite, **then** there is a test asserting no portal response contains any `User.name` from the database.

**Definition of Done**
- [ ] Dedicated serializer file — the ONLY path to client data
- [ ] All portal routes under `/api/portal/*` use it exclusively
- [ ] **Automated test: fetch every portal endpoint, assert zero user names in response**
- [ ] SQL-level filtering for comments/attachments/RAID
- [ ] Code review checklist item

---

## I3 — Client Portal Dashboard

**User Story**
> As a **Client PM**, I want to see my project's status, delays, and — most importantly — what's waiting on *me*, so that I know exactly what to do.

**UI/UX**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  360Ground Client Portal          [Project: Meda Platform ▼]  [Logout]  │
├─────────────────────────────────────────────────────────────────────────┤
│  🟡 AMBER      68.6% Complete      Expected: 78%      14 days behind    │
├─────────────────────────────────────────────────────────────────────────┤
│  ⭐ AWAITING YOUR ACTION (3 items)                                       │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Requirements Document Approval    Waiting 7 days  🔴 SLA: 3 days  │ │
│  │ Brand Guide Delivery              Waiting 12 days 🔴 SLA: 5 days  │ │
│  │ UAT Environment Access            Waiting 2 days  ✓ Within SLA    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│  [C2 GANTT — no individual names, owner shows "360Ground Team"/"Your Team"] │
├─────────────────────────────────────────────────────────────────────────┤
│  SCHEDULE CHANGES                                                       │
│  Activity            Original    Current    Slipped   Reason      Owner │
│  Req Doc Approval    15 Aug      29 Aug      +14   Approval Delay Client│
│  API Integration     10 Sep      15 Sep       +5   Tech Blocker   360G  │
├─────────────────────────────────────────────────────────────────────────┤
│  [C5 Milestones]  [C4 Planned vs Actual]  [Change Requests]  [Reports]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**
- **Given** the portal loads, **then** "Awaiting Your Action" is the **first thing** the client sees, with live days-waiting counters.
- **Given** the Gantt, **then** every assignee column shows "360Ground Team" or "Your Team" — never a person.
- **Given** the delay table, **then** it shows original vs current dates with reason and owner (including client-owned delays — this is deliberate).
- **Given** a client comments, **then** it posts with `isClientAuthor = true` and notifies the PM.
- **Given** a published report, **then** the client can view/download it.

**Definition of Done**
- [ ] "Awaiting Your Action" is prominent and first
- [ ] Gantt renders with anonymized owners
- [ ] Delay table shows client-owned delays honestly
- [ ] Comment capability (read + write)
- [ ] Report viewing

---

# EPIC J — Reports & Charts Engine

*Resolves Issues #3, #5, #15*

---

## J1 — Chart Library (C1–C24)

All charts use `recharts` (already in the platform) via a `<ChartWrapper>` component.

| ID | Chart | Type | Key Detail |
|----|-------|------|-----------|
| C1 | Portfolio RAG Wall | Card grid | RAG, %, SPI, slip days |
| C2 | Project Gantt | Custom (Epic D) | — |
| C3 | SPI/CPI Trend | Dual line | **1.00 reference line**, below = red shade |
| C4 | Planned vs Actual S-Curve | Area | Cumulative planned (baseline) vs actual, today marker |
| C5 | Milestone Completion | H-stacked bar | Weighted % per phase |
| C6 | Delay Days by Owner | Stacked bar/donut | Client vs 360G vs Shared |
| C7 | Delay Reason Breakdown | Donut | 9-reason taxonomy |
| C8 | Individual Performance Trend | Multi-line | Completion %, accuracy, idle |
| C9 | Client Health Score | Gauge + trend | 0–100 composite |
| C10 | Sprint Velocity | Bar + line | Committed vs completed |
| C11 | Resource Capacity Heatmap | Heatmap | People × weeks, red >100% |
| C12 | Estimate Accuracy Scatter | Scatter | **45° perfect line** |
| C13 | Idle Days Heatmap | Heatmap | People × days |
| C14 | Sprint Burndown | Line | vs ideal |
| C15 | Team Completion Distribution | H-bar | Ranked |
| C16 | Scrum Attendance Heatmap | Heatmap | People × dates |
| C17 | Portfolio Bubble | Bubble | X=SPI, Y=CPI, size=value, color=RAG |
| C18 | **Root Cause Pareto** ⭐ | Pareto | Delay reasons ranked + cumulative % |
| C19 | Estimator Bias | Box plot | Per-person variance |
| C20 | Bench Forecast | Stacked area | 12-week capacity |
| C21 | Approval Latency Trend | Line | Per client, over time |
| C22 | Scope Volatility | Cumulative line | CR count + impact |
| C23 | Cycle Time Distribution | Histogram | Long tail |
| C24 | **Project Completion Ring** | Donut + KPIs | **Image 9 parity exactly** |

**C24 Spec (Image 9 exact)**
```
┌──────────────────┐  ┌──────────┐ ┌──────────┐ ┌──────────┐
│ PROJECT          │  │ TO-DO  ○ │ │IN-PROG ⏱ │ │ DONE   ✓ │
│ COMPLETION       │  │   15     │ │    1     │ │   35     │
│    ╭─────╮       │  │ Backlog  │ │  Active  │ │Completed │
│   ╱ 68.6% ╲      │  └──────────┘ └──────────┘ └──────────┘
│  │         │     │  ┌──────────┐ ┌──────────┐ ┌──────────┐
│   ╲       ╱      │  │DELAYED ! │ │BLOCKED ⊘ │ │CONFID  ◎ │
│    ╰─────╯       │  │    0     │ │    0     │ │   92     │
│    AT RISK       │  │ Monitor  │ │ Critical │ │High Conf │
│ ▲ 0% ahead       │  └──────────┘ └──────────┘ └──────────┘
│ — Expected 68.6% │
└──────────────────┘
```

**Definition of Done**
- [ ] All 24 charts implemented
- [ ] C24 pixel-matches Image 9
- [ ] C18 Pareto with cumulative line
- [ ] All charts export to PNG
- [ ] Responsive + dark mode

---

## J2 — Bi-Monthly Client Report (R2)

**User Story**
> As a **Project Manager**, I want the system to draft the client report so I only review and send, so that I stop losing hours to manual consolidation.

*Resolves Issue #3.*

**Workflow:** `AI DRAFT → PM_REVIEW → APPROVED → SENT` *(reuses the Letters module pattern)*

**Report Sections** (per the challenge doc's exact format)

| Section | Content |
|---------|---------|
| Header | Project · Client · **Eldix IT Technology PLC** · Reporting Date · Period · **PM Name** · Version |
| **AI Executive Summary** | **MAX 5 BULLETS. From real data only. PM-EDITABLE. Never auto-sent.** |
| Overall Health | % Complete · **Planned % vs Actual %** · SPI · RAG · Confidence · Days behind |
| Completed This Period | Activity · **Owner Party** · Planned Date · Actual Date · Variance |
| At-Risk / Delayed | Activity · **Delay Owner** · **Original Date** · **Current Date** · **Days Slipped** · **Reason** |
| ⭐ Pending YOUR Action | Deliverable · Sent on · **Days waiting** · SLA · Breach? |
| Upcoming Milestones | Next period + what we need from you |
| Change Requests | CR · Impact (days/cost) · Status |
| Risks (client-visible) | Risk · Probability · Impact · Mitigation |

**AI Constraint (Issue #15)**

```typescript
// HARD CONSTRAINTS — enforced in code, not prompt
const AI_SUMMARY_MAX_BULLETS = 5;
const AI_SUMMARY_MAX_CHARS = 800;

// Input to the model is ONLY structured facts:
{ percentComplete, percentPlanned, spi, slipDays, delaysByOwner,
  pendingApprovals, completedThisPeriod, upcomingMilestones, openRisks }

// Model MUST NOT invent. Post-generation validation:
// - reject if > 5 bullets
// - reject if > 800 chars
// - PM must explicitly click "Approve Summary" before send
```

**Acceptance Criteria**
- **Given** a bi-weekly cron, **then** a `DRAFT` report is generated for every active project and the PM is notified.
- **Given** the AI summary, **then** it is **≤ 5 bullets and ≤ 800 chars**, generated only from structured data.
- **Given** the PM has not edited/approved, **then** the report **cannot be sent** (hard gate).
- **Given** the PM edits the summary, **then** `aiSummaryEdited = true`.
- **Given** the report is sent, **then** it goes to `project.clientEmails` and appears in the client portal.
- **Given** the report, **then** **no individual employee name appears anywhere** (anonymization).

**Definition of Done**
- [ ] Bi-weekly cron generates drafts
- [ ] AI summary hard-capped (5 bullets / 800 chars) with post-validation
- [ ] PM approval is a hard gate before send
- [ ] Anonymization enforced
- [ ] PDF export + email send
- [ ] Appears in client portal

---

## J3 — Weekly Business Review Pack (R1)

**User Story**
> As a **CEO**, I want an auto-generated WBR pack every Monday, so that our review meeting interrogates variance instead of assembling data.

**Sections:** Portfolio headline · **Portfolio SPI (the one number)** · **Red items with owner + committed recovery date** · Week-over-week deltas · Delay ledger summary · Pending client actions · Resource heat · Escalations

**Acceptance Criteria**
- **Given** Monday 6am, **then** the WBR pack generates automatically and notifies CEO + all PMs.
- **Given** a red item, **then** it shows an **owner name and a committed recovery date** — and it **carries forward** every week until green (Slootman's rule).
- **Given** a red item with no recovery date, **then** it is flagged "NO RECOVERY PLAN" in red.

**Definition of Done**
- [ ] Monday cron
- [ ] Every red item has owner + date, or is flagged
- [ ] Carry-forward tracking
- [ ] PDF export

---

## J4 — Individual & Team Performance Reports (R3, R4)

**User Story**
> As a **Project Manager**, I want per-developer and per-team reports on the exact fields we specified, so that performance conversations are evidence-based.

*Resolves Issue #9.*

**R3 Individual fields** (per the challenge doc, exactly):
Developer Name · PM · Sprint Date (From–To) · **Assigned Tasks** · **Original Estimate (hrs)** · **Buffer (hrs)** · **Completed** · **Blocked** · **Performance %** · ⭐**Idle Days** · ⭐**Estimate Accuracy** · Cycle Time · Blocked Duration · Scrum Attendance % · **AI Insight (PM-editable)**

**R4 Team fields:**
Team · PM · Sprint Date · Assigned · Completed · Blocked · **Team Performance %** · Velocity · Velocity Trend · **Individual Completion % breakdown** · **Jira Adoption Score** · **AI Insight (PM-editable)**

**Cadences:** Daily · Weekly · Sprint · Monthly

**Acceptance Criteria**
- **Given** a Jira-linked project, **then** R3/R4 generate for the selected cadence.
- **Given** a NON-Jira project, **then** R3/R4 are **hidden entirely** (not shown empty).
- **Given** the AI insight, **then** it is PM-editable before any sharing.
- **Given** these metrics, **then** they are exposed to the **Performance module** as auto-pullable Metric criteria (Issue #9 fully resolved).

**Definition of Done**
- [ ] All fields from the challenge doc present
- [ ] 4 cadences
- [ ] Hidden when no Jira
- [ ] AI insight PM-editable
- [ ] API exposes metrics to Performance module

---

## J5 — Steering Pack, COE Report, Estimation Report, Capacity Report (R6, R7, R9, R10)

Per §PART B of the Executive Practices doc. Each is a generated `ProjectReport` with its own template.

**Definition of Done**
- [ ] R6 Steering Pack (monthly/quarterly)
- [ ] R7 COE Report
- [ ] R9 Estimation Learning Report
- [ ] R10 Capacity/Bench Report
- [ ] All export to PDF

---

## J6 — AI Assistant (Constrained)

**User Story**
> As a **Project Manager**, I want AI help with schedule risks and summaries, but I never want it inventing content.

*Resolves Issue #15.*

**Allowed AI uses**
- Executive summaries (hard-capped, data-grounded)
- Risk detection: *"3 activities on the critical path have no assignee"*
- Delay pattern insights: *"Client approval delays cluster in the Requirements phase"*
- Estimate suggestions from historical actuals

**Forbidden**
- ❌ Generating requirements or specifications
- ❌ Writing client-facing prose without PM review
- ❌ Any output > the configured cap
- ❌ Auto-sending anything

**Definition of Done**
- [ ] All AI outputs capped and validated post-generation
- [ ] All AI outputs require PM approval before external use
- [ ] Reuses existing `AiGenerationLog` model for cost/audit tracking

---

# EPIC K — OKR Integration & Portfolio Intelligence

*Resolves Issues #20, #24, #9*

---

## K1 — Link Milestones to Key Results

**User Story**
> As a **CEO**, I want project milestones to drive Key Result progress, so that delivery execution and company strategy are the same conversation.

*Resolves Issue #20.*

**Functionality**
- A `Milestone` can link to a `KeyResult` (`milestone.keyResultId`).
- When the milestone's `percentComplete` changes, it **contributes to the linked KR's progress**.
- A `Project` can link to an `Objective` (`project.objectiveId`).

```typescript
// On milestone rollup:
if (milestone.keyResultId) {
  // Recompute KR currentValue from all linked milestones
  const linked = await getMilestonesForKR(keyResultId);
  const weighted = Σ(m.percentComplete × m.weight) / Σ(m.weight);
  await updateKeyResult(keyResultId, { currentValue: weighted });
  await recalcNodeAndAncestors(objectiveId);  // existing OKR function
}
```

**Acceptance Criteria**
- **Given** a milestone linked to a KR, **when** the milestone reaches 100%, **then** the KR's `currentValue` updates and the parent Objective's progress recalculates via the **existing** `recalcNodeAndAncestors()`.
- **Given** an objective linked to a project, **then** the objective detail page shows a "Delivery" panel with project RAG, SPI, and slip days.
- **Given** the OKR alignment map, **then** projects appear as delivery nodes.

**Definition of Done**
- [ ] Milestone → KR link
- [ ] Project → Objective link
- [ ] Milestone completion drives KR progress via existing OKR functions
- [ ] Delivery panel on objective detail page
- [ ] No duplication of OKR progress logic — reuse `lib/objectiveProgress.ts`

---

## K2 — Portfolio Dashboard (CEO)

**User Story**
> As the **CEO**, I want one screen showing every project's health and whether delays are ours or the client's, so that I know where to intervene.

*Resolves Issue #24.*

**Route:** `/dashboard/projects/portfolio`

```
┌───────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO HEALTH                        [This Week ▼] [All Clients ▼]│
├───────────────────────────────────────────────────────────────────────┤
│  🟢 4 Green   🟡 3 Amber   🔴 2 Red        Portfolio SPI: 0.87 ▼      │
│  Client-owned delay: 184 days    360Ground-owned delay: 41 days       │
│  ⚠️ 81.7% of all delay days are CLIENT-OWNED                          │
├───────────────────────────────────────────────────────────────────────┤
│  [C1 Portfolio RAG Wall]                                              │
│  [C17 Bubble: SPI × CPI × value]   [C18 Root Cause PARETO] ⭐         │
│  [C6 Delay by Owner]  [C9 Client Health]  [C20 Bench Forecast]        │
├───────────────────────────────────────────────────────────────────────┤
│  🔴 ESCALATIONS REQUIRING YOU (3)                                     │
│  • Meda Platform — RED — 34 days behind — client approval x5          │
│  • ILO Hub — Requirements gate not passed, dev started anyway         │
│  • Abay Remit — Payment milestone 45 days overdue                     │
└───────────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**
- **Given** the portfolio page, **then** it shows all active projects with RAG, SPI, % planned vs actual, and slip split by owner.
- **Given** C18 Pareto, **then** it ranks all delay reasons across **all projects** by total days with a cumulative % line — **answering Issue #5 definitively**.
- **Given** the delay split, **then** the headline states the % of delay that is client-owned.
- **Given** escalations, **then** RED projects, failed gates, and overdue payments surface.

**Definition of Done**
- [ ] Portfolio page with all charts
- [ ] C18 Pareto across all projects
- [ ] Escalation logic
- [ ] Filters by client, PM, date range
- [ ] Export to PDF for board packs

---

## K3 — Cross-Project Performance Report

**User Story**
> As a **CEO**, I want an overall performance report across all projects — progress, delays, delivery predictability — so that I can see trends, not just snapshots.

**Metrics**
- Portfolio SPI/CPI trend over time
- **Delay attribution trend** — is client-owned delay rising or falling?
- On-time delivery rate (milestones delivered by baseline date)
- Average approval latency per client (C21)
- Scope volatility across projects (C22)
- Estimation accuracy trend (are we getting better?)
- Resource utilization
- **Root cause distribution** (C18) — the systemic answer

**Acceptance Criteria**
- **Given** ≥2 completed projects, **then** trend charts render.
- **Given** the report, **then** it answers: *"What is our #1 systemic delivery problem?"* with a ranked, quantified answer.

**Definition of Done**
- [ ] Cross-project aggregation
- [ ] All trend charts
- [ ] Exportable board pack

---

# PART 5 — Permissions, Notifications, Cron

## 5.1 New DocTypes (register in Permission module)

| DocType Key | Module | Sensitive Fields (Level) |
|-------------|--------|--------------------------|
| `project` | projects | `contractValue`, `budgetAtCompletion`, `cpi` (L2) |
| `phase` | projects | — |
| `milestone` | projects | — |
| `activity` | projects | `assigneeId` (L1), `estimatedCost`, `actualCost` (L2) |
| `delay_event` | projects | — |
| `change_request` | projects | `costImpact` (L2) |
| `raid_item` | projects | — |
| `stage_gate` | projects | — |
| `client_obligation` | projects | — |
| `correction_of_error` | projects | all (L1) |
| `payment_milestone` | projects | `amount` (L2) |
| `jira_connection` | projects | `encryptedToken` (L2 — never readable) |
| `scrum_log` | projects | — |
| `project_report` | projects | — |
| `client_portal_user` | projects | `passwordHash` (L2) |

**Default permissions**

| DocType | ADMIN | EXECUTIVE | DEPARTMENT_LEAD (PM) | EMPLOYEE |
|---------|-------|-----------|---------------------|----------|
| `project` | All | R W E P | R W C (own projects) | R (assigned) |
| `activity` | All | R | R W C D (own projects) | R W (assigned only) |
| `delay_event` | All | R E | R W C (own projects) | R |
| `change_request` | All | R W | R W C (own projects) | R |
| `raid_item` | All | R | R W C D (own projects) | R |
| `stage_gate` | All | R W (waive) | R W (own projects) | R |
| `jira_connection` | All | — | R W C (own projects) | — |
| `payment_milestone` | All | R W | R | — |
| `project_report` | All | R E | R W C (own projects) | R (own perf only) |

## 5.2 Notification Events (new `PROJECT` category)

| Event Key | Recipient | Cadence |
|-----------|-----------|---------|
| `PROJECT_CREATED` | PM, CEO | Immediate |
| `PROJECT_BASELINE_COMMITTED` | PM, CEO | Immediate |
| `PROJECT_REBASELINED` | CEO | Immediate |
| `PROJECT_RAG_CHANGED` | PM, CEO | Immediate |
| `PROJECT_WENT_RED` | PM, CEO | Immediate |
| ⭐`CLIENT_APPROVAL_PENDING` | Client contact, PM | Immediate |
| ⭐`CLIENT_APPROVAL_SLA_BREACH` | PM, CEO, Client | At SLA, +3, +7 |
| `ACTIVITY_BLOCKED` | PM | Immediate |
| `ACTIVITY_OVERDUE` | Assignee, PM | Daily digest |
| `BASELINE_SLIPPED` | PM | Immediate |
| `STAGE_GATE_PENDING` | PM | Immediate |
| `STAGE_GATE_BYPASSED` | CEO | Immediate |
| `CHANGE_REQUEST_SUBMITTED` | PM | Immediate |
| `CHANGE_REQUEST_APPROVED` | PM, team | Immediate |
| `RAID_HIGH_RISK_ADDED` | PM, CEO | Immediate |
| `CLIENT_REPORT_READY` | PM | Immediate |
| `CLIENT_COMMENT_POSTED` | PM | Immediate |
| `JIRA_SYNC_FAILED` | PM | Immediate |
| `PAYMENT_MILESTONE_READY` | Finance, CEO | Immediate |
| `COE_REQUIRED` | PM, CEO | Immediate |
| `WBR_PACK_READY` | CEO, all PMs | Weekly (Mon) |
| `SCRUM_NOT_LOGGED` | PM | Daily |

## 5.3 Cron Jobs

| Route | Schedule | Purpose |
|-------|----------|---------|
| `POST /api/cron/jira-sync` | Every 30 min | Pull Jira data for all active connections |
| `POST /api/cron/project-health` | Daily 02:00 | Recompute confidence, RAG, SPI, CPI, EAC, % planned |
| `POST /api/cron/approval-clock` | Daily 08:00 | Check overdue approvals, fire SLA escalations |
| `POST /api/cron/client-report` | Bi-weekly Mon 06:00 | Generate client report drafts |
| `POST /api/cron/wbr-pack` | Weekly Mon 06:00 | Generate WBR pack |
| `POST /api/cron/project-digest` | Daily 07:00 | Overdue/blocked digest to PMs |

All secured by `Bearer CRON_SECRET` (existing pattern).

---

# PART 6 — Build Sequence & Definition of Done

## 6.1 Build Phases

| Phase | Epics | Deliverable | Issues Resolved |
|-------|-------|-------------|-----------------|
| **P1 — Foundation** | A, B | Projects, templates, schedule hierarchy, rollup, confidence | #4, #13, #14 |
| **P2 — The Core** ⭐ | C | **Baselines + Delay Ledger + Approval Clock + Slip Attribution** | **#1, #2, #5, #7, #25** |
| **P3 — Gantt** | D, E, F | Instagantt-parity Gantt + all views + activity panel + comments | #4, #19 |
| **P4 — Governance** | H | RAID, CCB, Stage-Gates, Obligations, COE, Payments | #6, #17, #18, #21, #22, #23 |
| **P5 — Client Portal** | I | Anonymized portal + pending approvals | #19, #2 |
| **P6 — Jira** | G | Sync, mapping, idle, estimates, adoption, scrum | #8, #9, #10, #11, #12 |
| **P7 — Reports** | J | All 24 charts + 10 reports + constrained AI | #3, #15 |
| **P8 — Intelligence** | K | OKR link + Portfolio + Pareto | #9, #20, #24 |

> **P2 is non-negotiable and must ship before P3.** Without baselines, the Gantt is decoration.

## 6.2 Global Definition of Done

Every feature must satisfy:

- [ ] **API**: uses `withAuth`/`withRole`, returns `{success, data?, error?}`, Zod-validated input
- [ ] **Permissions**: DocType registered, default permissions seeded, record scoping applied
- [ ] **Audit**: `recordActivity()` called on every mutation
- [ ] **Types**: shared types in `types/index.ts` — no re-declaration
- [ ] **Forms**: `react-hook-form` — no raw `useState` for forms
- [ ] **Modals**: `components/ui/Modal` — no custom wrappers
- [ ] **Confirms**: `components/ui/ConfirmDialog` — never `window.confirm()`
- [ ] **Empty states**: `components/ui/EmptyState`
- [ ] **Styles**: `cn()` from `lib/utils` — no string concat, no hardcoded hex
- [ ] **Feature barrel**: exported from `features/projects/index.ts`
- [ ] **Tests**: unit tests for all business logic (rollup, EVM, delay ledger, scheduling)
- [ ] **Docs**: `docs/MASTER_REFERENCE.md` + `docs/CHANGELOG_AI.md` updated

## 6.3 Critical Invariants (must never break)

1. ⭐ **`baselineStart` / `baselineEnd` are immutable after commit.** Server-side guard, not UI.
2. ⭐ **No date change on a baselined project without a slip reason + owner.** Hard gate.
3. ⭐ **The approval clock is automatic.** No PM action required to accrue client delay.
4. ⭐ **No employee name ever reaches the client portal.** Enforced by the serializer + an automated test.
5. ⭐ **Internal comments are filtered at the SQL level**, never by CSS.
6. ⭐ **AI output is capped and requires PM approval before any external use.**
7. **Jira is read-only.** We never write to Jira.
8. **Projects work fully without Jira.** Layer 1 is always sufficient.
9. **Rollup runs in the same transaction as the mutation.** No stale percentages.
10. **Every mutation writes to `ActivityLog`.**

---

*Prepared by: 360Ground Internal Platform Team | Build Spec v1.0 | July 2026*
*Sources: PM Challenges document · Instagantt reference screenshots (9) · Engineering & Sales scorecards · OKR Platform Master Reference · Executive Practices consolidation*
