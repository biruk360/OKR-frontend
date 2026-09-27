# Project Management & Delivery Intelligence Module — Requirements Traceability

**Verified:** 2026-09-27 (agent T1, read-only code review; three sub-agents traced Epics G/J, Epics H/K/§5.1/§5.2 and the workspace/consolidated specs; their high-impact claims were re-checked by hand before inclusion)
**Authoritative spec:** `docs/project_management_module_BUILD_SPEC.md` (v1.0, 2,594 lines)
**Also traced:** `docs/PM_TOOL_CONSOLIDATED_IMPLEMENTATION_TRACKER.md`, `docs/project_workspace_optimization_requirements.md`, `../docs/DELIVERY_VIEWS_CLONE_SPEC.md` (§16, §19, §21), `../docs/PM_Tool_Consolidated_Requirements.md` (§1–§20), `CLAUDE.md` "10 Critical Invariants"
**Code surface:** `features/projects/**`, `lib/projects/**`, `app/api/projects/**`, `app/api/portal/**`, `app/api/cron/{approval-clock,project-health,project-digest,client-report,wbr-pack,jira-sync}`, `app/dashboard/projects/**`, `app/projects/**`, `app/portal/**`, `lib/notifications/{dispatcher,events}.ts`, `middleware.ts`, `scripts/install-crontab.sh`, `scripts/seed-project-permissions.ts`, `prisma/schema.prisma` (lines 2640–3510), `prisma/seed-project-templates.ts`, `tailwind.config.js`
**Test run:** `npx tsx --test lib/projects/*.test.ts` → **431 / 431 pass** (34 suites). CI runs it (`.github/workflows/ci.yml:53-55`, `npm run test:projects`). TypeScript and `next build` were not run, because both write artifacts.

No tracker status was taken on trust. `docs/PM_TOOL_CONSOLIDATED_IMPLEMENTATION_TRACKER.md` claims Done for several items the code does not support (see §C.1, the rows marked ⚠).

**Status key:**
- **DONE**: met in code. Small caveats are still listed in the note.
- **PARTIAL**: at least one part of the requirement is unmet, or it works only server-side or only in one view.
- **DEVIATES**: built to a different design that changes the requirement's behaviour or meaning.
- **MISSING**: not built.

Evidence is `file:line`, relative to `OKR-frontend/` unless stated otherwise.

---

## 0. Summary

| Source | DONE | PARTIAL | DEVIATES | MISSING | Total |
|---|---|---|---|---|---|
| BUILD_SPEC Part 2–3 (architecture, locked decisions, data model) | 41 | 4 | 3 | 3 | 51 |
| BUILD_SPEC Epics A–F (setup, schedule, baseline/delay ledger, Gantt, views, panel) | 177 | 56 | 19 | 15 | 267 |
| BUILD_SPEC Epic G (Jira) | 28 | 10 | 4 | 3 | 45 |
| BUILD_SPEC Epic H (governance) | 25 | 15 | 4 | 2 | 46 |
| BUILD_SPEC Epic I (client portal) | 31 | 3 | 1 | 1 | 36 |
| BUILD_SPEC Epic J (reports & charts) | 24 | 18 | 4 | 17 | 63 |
| BUILD_SPEC Epic K (OKR & portfolio) | 8 | 15 | 2 | 11 | 36 |
| BUILD_SPEC Part 5 (permissions, notifications, cron) | 26 | 3 | 21 | 11 | 61 |
| BUILD_SPEC Part 6 (global DoD, 10 invariants) | 11 | 10 | 1 | 0 | 22 |
| **BUILD_SPEC subtotal** | **371** | **134** | **59** | **63** | **627** |
| Consolidated tracker, workspace optimisation, clone spec, consolidated requirements | 78 | 76 | 7 | 22 | 183 |
| **Grand total** | **449** | **210** | **66** | **85** | **810** |

Counts are the rows in the tables below, one row per acceptance criterion, DoD item, field or behaviour. A few rows group identical items, for example `D2-DoD1..6`. The Part 1 problem table is derived and not counted. DONE is concentrated in data model, CRUD and API plumbing. The ⭐ mechanisms and Epics J and K carry most of the PARTIAL and MISSING rows.

**The 10 Critical Invariants (§6.3):** 5 are DONE (#1, #2, #4, #8, #9) and 5 are PARTIAL (#3, #5, #6, #7, #10). See §6.3.

**The headline problems** (full list in §Gaps):
1. **Six project notifications reach nobody**, including the approval-clock escalations. This covers `CLIENT_APPROVAL_PENDING`, `CLIENT_APPROVAL_SLA_BREACH`, `PROJECT_WENT_RED`, `PROJECT_RAG_CHANGED`, `PROJECT_BASELINE_COMMITTED` and `PROJECT_REBASELINED`. The dispatcher has no PROJECT routing, so an emit without `explicitRecipients` is dropped.
2. **Internal content leaks to the client portal through reports.** An APPROVED STEERING report exposes non-client-visible risks and INTERNAL change requests. R2 also includes INTERNAL change requests.
3. **Schedule health numbers are structurally dead.** `percentPlanned` is 0 whenever phases have no dates, which is the case for every template, UI or manual project. SPI, CPI and EAC are always null because `budgetAtCompletion` and project `actualCost` have no writer anywhere.
4. **Delay Ledger totals are inflated.** A dragged bar writes one DelayEvent per cascaded successor.
5. **Variance against v1 is unrecoverable after a re-baseline.** `BaselineSnapshot` is written but never read, and the Gantt "baseline version" selector does nothing.

---

## 1. Problem coverage (Part 1)

This table is derived from the rows below. It is **not counted** in the summary totals.

| # | Problem | Derived status | Why |
|---|---|---|---|
| 1 | Delay is unprovable | Derived: PARTIAL | The baseline, write guard and ledger work. But v1 variance is lost after a re-baseline (C2-AC3), and cascades double-count days (C4-X1). |
| 2 | Client delay invisible | Derived: PARTIAL | The approval clock accrues automatically, but its notifications are dropped (P5.2-X1). |
| 3 | Manual report consolidation | Derived: PARTIAL | R1, R2, R6, R7, R9 and R10 are generated. R5 is missing. The "AI" summaries are deterministic templates. |
| 4 | No single source of truth | Derived: DONE | Schedule of record: Project → Phase → Milestone → Activity. |
| 5 | Root cause unknown | Derived: PARTIAL | The C18 Pareto exists, but it is fed by double-counted slip events (C4-X1). |
| 6 | Scope creep | Derived: PARTIAL | The change control board and auto DelayEvent exist. There is no C22 chart, and approval shifts only `currentEnd`. |
| 7 | Sprint disruption | Derived: PARTIAL | Only the underlying Epic C and G gaps apply. |
| 8 | Inconsistent Jira usage | Derived: PARTIAL | The adoption score exists. There is no report banner and no per-team view. |
| 9 | No individual performance tracking | Derived: MISSING | Nothing feeds the Performance module (G4-DoD4b, J4-AC4). |
| 10 | Idle time invisible | Derived: PARTIAL | Idle days are computed, but the "comment" activity signal is faked. |
| 11 | Estimates never validated | Derived: PARTIAL | Accuracy and bias are computed. There is no C12 45° line and no C19. |
| 12 | Scrum attendance untracked | Derived: PARTIAL | The log and widget exist. R5 is missing and there is no period filter. |
| 13 | No confidence measure | Derived: PARTIAL | Confidence is computed, but planned % and SPI are dead inputs (B2-PLANNED, B2-EVM). |
| 14 | Reinventing the wheel | Derived: DONE | 10 system templates plus clone and builder. |
| 15 | AI over-generation | Derived: DONE | Output is hard-capped and approval-gated for R2. No LLM is actually called. |
| 16 | Resource capacity unknown | Derived: PARTIAL | R10 exists. There is no workload heatmap, and the C20 data is fabricated. |
| 17 | No phase gates | Derived: PARTIAL | Soft block with a reason. Criteria are not checkable and bypasses are not surfaced. |
| 18 | No RAID discipline | Derived: DONE | 4 types, 5×5 matrix, feeds confidence. |
| 19 | No client self-service | Derived: PARTIAL | The portal works, but internal content leaks via reports (I2-F8). |
| 20 | Delivery disconnected from strategy | Derived: PARTIAL | Milestone → KR links work. Projects are absent from the alignment map. |
| 21 | SLAs not measured | Derived: PARTIAL | Breaches are detected. Portfolio C9 ignores obligations. |
| 22 | Blame, not fixes | Derived: PARTIAL | The COE register exists. The trigger is pull-only and there is no template loop. |
| 23 | Delivery not tied to cash | Derived: PARTIAL | "Ready to invoice" on approval works. Overdue is not shown on the CEO dashboard. |
| 24 | No portfolio view | Derived: PARTIAL | The portfolio page exists. Escalations and K3 are thin. |
| 25 | Churn invisible | Derived: PARTIAL | Only the underlying Epic C gaps apply. |

---

## 2. Architecture, locked decisions & integration (Part 2, header)

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| LD-1 | Schedule lives here; issues stay in Jira | DONE | prisma/schema.prisma:2647-2915 | |
| LD-2 | Jira is read-only | DONE | features/projects/services/jira/sync.ts:309; jira/connection.ts:134 (GET only) | No test asserts GET-only. |
| LD-3 | Portal is read-only + comment | DONE | app/api/portal/** (the only write is the comment POST; invite is token-scoped) | |
| LD-4 | No individual names; enforced at the serializer | DONE | features/projects/services/portal-serializer.ts; lib/projects/portal-routes-invariant.test.ts:302 | See INV-4. Internal *content* does leak; see I2-F8. |
| LD-5 | Projects can exist without Jira | DONE | app/projects/[id]/page.tsx (no Jira in the page load) | |
| LD-6 | Gantt is a functional duplicate of Instagantt | PARTIAL | Epic D and §C.4 | Columns menu, grouping, sort set, undo history and multi-select are missing. |
| ARCH-2.1 | Layer 1 is always sufficient | DONE | ProjectDeliveryControlCenter.tsx:155,162 (Jira isolated to its own tab) | |
| ARCH-2.2-User | Read User for PM, members, assignees, authors | DONE | lib/projects/access.ts:22-55 | |
| ARCH-2.2-Dept | Owning department and resource pools | DONE | app/api/projects/route.ts:35-47; access.ts | |
| ARCH-2.2-MgrRel | ManagerRelationship used for escalation routing | MISSING | No reference in lib/projects, features/projects or app/api/projects | Escalations have no recipient routing at all (P5.2-X1). |
| ARCH-2.2-OKR | Milestone→KR read and write; activity completion drives KR | DONE | lib/projects/rollup.ts:230-231,266-268; lib/projects/okr-bridge.ts | See K1. |
| ARCH-2.2-Audit | ActivityLog for every status, baseline and slip change | PARTIAL | See INV-10 | |
| ARCH-2.2-Notif | New `PROJECT` notification category | PARTIAL | lib/notifications/events.ts:238-260 | All 22 keys are defined, but the dispatcher has no PROJECT routing (dispatcher.ts:75,361). |
| ARCH-2.2-Perm | New DocTypes; portal role with hard field suppression | PARTIAL | scripts/seed-project-permissions.ts:25-60,96-209 | Seeded but not enforced (P5.1-X2). The portal suppression is serializer-level and works. |
| ARCH-2.2-Letters | Draft→Approved→Sent pattern reused | DONE | lib/projects/client-report.ts:327-365 | |
| ARCH-2.2-Perf | Jira metrics become Performance Metric criteria | MISSING | lib/performance/project-jira-metrics.ts (re-export shim, no importers) | The metric resolver supports only KEY_RESULT and SCRUM. |
| ARCH-2.2-Auth | All routes use withAuth/withRole | DONE | Every route under app/api/projects/** and app/api/portal/** is wrapped | The exemptions are portal/invite (token and rate-limited) and portal/auth (NextAuth). |
| ARCH-2.2-UI | Reuse Modal, ConfirmDialog, EmptyState, StatCard | DONE | lib/projects/project-remediation-guards.test.ts:22 | That test bans window.prompt/confirm/alert. |
| ARCH-2.2-LogPanel | `<ActivityLogPanel>` audit trail reused | MISSING | No usage in features/projects or app/projects | The project module has no audit-trail UI. |
| ARCH-2.3-Gantt | 9 separate Gantt component files | DEVIATES | features/projects/components/gantt/GanttChart.tsx (1,927 lines) + schedule-grid.tsx | Minimap and dependency layer are in-file (:1568, :1636). |
| ARCH-2.3-Views | board/, table/, workload/, overview/ components | DEVIATES | views/ProjectViewSwitcher.tsx (948 lines, all 5 non-Gantt views) | |
| ARCH-2.3-Svc | evm, delay-ledger, scheduling and rollup under features/projects/services | DEVIATES | lib/projects/{evm,delay-ledger,scheduling,rollup}.ts | This is mandated by CLAUDE.md guardrail 4; the deviation is accepted. |
| ARCH-2.3-Portal | portal/ serializers separate | DONE | features/projects/services/portal-serializer.ts | |

## 3. Data model (Part 3)

All 28 spec models exist with the spec's fields. The table lists additions and data-level caveats.

| ID | Model | Status | Evidence | Gap / note |
|---|---|---|---|---|
| DM-Project | Project | DONE | schema.prisma:2647-2723 | Adds a `template` relation. `budgetAtCompletion` and `actualCost` exist but **nothing writes them** (B2-EVM). |
| DM-Phase | Phase | DONE | :2725-2747 | `currentStart/End` are never derived from children (B2-PLANNED). |
| DM-Milestone | Milestone | DONE | :2749-2772 | Adds `@@index([keyResultId])`. |
| DM-Activity | Activity | DONE | :2774-2845 | Adds `isBlocked`, `blockedSince`, `approvalEscalationLevel` and `color`. |
| DM-Dep | ActivityDependency | DONE | :2847-2859 | |
| DM-Comment | ActivityComment | DONE | :2861-2875 | Visibility defaults to INTERNAL. |
| DM-Attach | ActivityAttachment | DONE | :2877-2890 | |
| DM-Tag | ActivityTag | DONE | :2892-2900 | The model exists but has no write path anywhere (B1-F3). |
| DM-Member | ProjectMember | DONE | :2902-2913 | |
| DM-Delay | DelayEvent | DONE | :2917-2949 | Adds `recoveryPlan`, `recoveryOwner` and `recoveryDate` (C5). |
| DM-Snap | BaselineSnapshot | DONE | :2951-2962 | Written, but never read by any module (C2-AC3). |
| DM-RAID | RaidItem | DONE | :2966-3006 | |
| DM-CR | ChangeRequest | DONE | :3008-3039 | Adds `visibility` (INTERNAL by default), which supports invariant 5. |
| DM-Gate | StageGate | DONE | :3041-3059 | Criteria are `String[]` with no checked state (H3-AC2). |
| DM-Oblig | ClientObligation | DONE | :3061-3076 | |
| DM-Breach | ApprovalSlaBreach | DONE | :3078-3092 | `clientApprover` is never set. |
| DM-COE | CorrectionOfError | DONE | :3094-3114 | |
| DM-Pay | PaymentMilestone | DONE | :3116-3134 | |
| DM-JiraConn | JiraConnection | DONE | :3136-3155 | |
| DM-JiraIssue | JiraIssue | DONE | :3157-3189 | |
| DM-JiraSprint | JiraSprint | DONE | :3191-3206 | |
| DM-JiraWorklog | JiraWorklog | DONE | :3208-3219 | |
| DM-JiraTrans | JiraTransition | DONE | :3221-3232 | |
| DM-JiraLog | JiraSyncLog | DONE | :3234-3250 | |
| DM-Template | ProjectTemplate | DONE | :3252-3265 | Adds `projectType`. |
| DM-Scrum | ScrumLog | DONE | :3267-3284 | Unique on `projectId, scrumDate`. |
| DM-Report | ProjectReport | DONE | :3477-3496 | Also stores `PUBLIC_SNAPSHOT` rows (a type the spec doesn't define). |
| DM-Portal | ClientPortalUser | DONE | :3498-3510 | |

---

## 4. Epic A — Project Setup & Templates

### A1 — Create Project
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| A1-UI | Full-page 3-step wizard from "New Project" | DEVIATES | features/projects/components/ProjectsListClient.tsx:227-235 (`<Modal size="xl">`); CreateProjectWizard.tsx:52 | It is a modal, not a page. It has 4 steps (Basics, Dates, Template, Review), behind a 3-way method chooser (manual, import, AI). |
| A1-F-name | name, 3–200 characters | DONE | app/api/projects/route.ts:69; wizard register | |
| A1-F-code | `PRJ-{YYYY}-{NNN}` auto, editable, unique | PARTIAL | lib/projects/service.ts:24-40; lib/projects/creation-validate.ts:240 | Uniqueness is only checked at the Review step or on commit (creation-drafts/[id]/commit/route.ts:59-60), not inline at step 1. |
| A1-F-client | clientName, 2–100 characters | DONE | route.ts:71 | |
| A1-F-desc | description, max 2000 | DONE | route.ts:72 | |
| A1-F-pm | PM defaults to me, useUsersForSelection, must be active | DONE | CreateProjectWizard.tsx:63,87 | The legacy `POST /api/projects` does not check the PM is active (route.ts:73). |
| A1-F-dept | Department via useDepartments | DONE | CreateProjectWizard.tsx:64 | |
| A1-F-money | contractValue ≥ 0; currency ETB/USD/EUR, default ETB | DONE | route.ts:75-76; service.ts:104 | |
| A1-F-dates | End after start | DONE | CreateProjectWizard.tsx:163,318; route.ts:100-102 | |
| A1-F-tpl | Template or "Start blank" | DONE | CreateProjectWizard.tsx:369-395 | |
| A1-FN1 | Per-step draft kept in Zustand | DEVIATES | lib/projects/creation-draft.ts (server-side `ProjectCreationDraft` with version) | Stronger than the spec: the draft survives a reload. |
| A1-FN2 | Created in PLANNING, unbaselined, 0% | DONE | service.ts:95-110 | |
| A1-FN3 | Template tree instantiated | DONE | lib/projects/creation-commit.ts:217-296 | The draft path writes `templateId: null` (:215), so the template link is lost. |
| A1-FN4 | PM added as ProjectMember role PM | DONE | service.ts:115-117 | |
| A1-AC1 | Wizard opens with PM pre-filled | DONE | CreateProjectWizard.tsx:87 | |
| A1-AC2 | Duplicate code gives an inline error at step 1 | DEVIATES | creation-validate.ts:240 | It is a blocking issue at Review or commit instead. |
| A1-AC3 | End ≤ start is blocked with the spec message | DONE | CreateProjectWizard.tsx:318 | |
| A1-AC4 | Template project lands on the Gantt | PARTIAL | ProjectsListClient.tsx:130 | Goes to `/projects/{id}?created=1` in the user's persisted view, not necessarily the Gantt. |
| A1-AC5 | Blank project shows an empty Gantt with an "Add Phase" call to action | PARTIAL | GanttChart.tsx (no `EmptyState`) | The grid shows add rows and the toolbar has "New section". No EmptyState is rendered. |
| A1-AC6 | ActivityLog `created` / `project` written | DONE | creation-commit.ts:316-322 (in the transaction, `required:true`); route.ts:132-138 | Written as `PROJECT` / `CREATED` in upper case. |
| A1-DoD1 | POST with withAuth, Zod and the envelope | DONE | route.ts:68-141 | |
| A1-DoD2 | react-hook-form | DONE | CreateProjectWizard.tsx:5,81 | |
| A1-DoD3 | Code sequence is transaction-safe | PARTIAL | service.ts:24-40 | It reads max+1 inside a READ COMMITTED transaction, so concurrent creates can pick the same code. The unique index then fails one with a 400 instead of retrying. The `orderBy code desc` sort is lexical, so it breaks after 999 codes in a year. |
| A1-DoD4 | Template instantiation is all-or-nothing | DONE | service.ts:73-131; creation-commit.ts (one transaction) | |
| A1-DoD5 | ActivityLog written | DONE | as AC6 | |
| A1-DoD6 | Unit tests for code generation, date validation and instantiation | PARTIAL | lib/projects/templates.test.ts; project-creation-validation.test.ts | Nothing tests `generateProjectCode` or `instantiateTemplateStructure`. |
| A1-DoD7 | Empty state when there is no template | PARTIAL | as AC5 | |

### A2 — Project Templates
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| A2-SEED1 | "Standard Software Delivery": 7 phases and weights | DONE | lib/projects/templates.ts:64-155 | |
| A2-SEED2 | Every approval activity has ownerParty CLIENT | DONE | templates.ts:58-60,75,91,105,129 | Brand Guide is CLIENT and UAT is SHARED, as specified. |
| A2-SEED3 | Consulting and Government Tender templates | DONE | templates.ts:160-240,304-326 | |
| A2-UI1 | `/dashboard/projects/templates`, Admin/PM only | PARTIAL | app/dashboard/projects/templates/page.tsx:7-10 | The page only checks for a session. PATCH and DELETE are role-gated (templates/[id]/route.ts:33,71). |
| A2-UI2 | Drag-drop tree plus properties panel | DONE | TemplateBuilderClient.tsx:399-404,472,602,720 | Uses native HTML5 drag and drop. |
| A2-AC1 | Fresh install has exactly 3 non-deletable system templates | DEVIATES | templates.ts:304-370; prisma/seed-project-templates.ts:24 | Seeds **10** system templates. Seeding is a manual npm script (package.json:37), not part of install. Edit and delete are blocked for system templates (templates/[id]/route.ts:36,74). |
| A2-AC2 | Instantiation has correct weight, position and ownerParty | DONE | templates.ts:385-420 | |
| A2-AC3 | Clone gives an editable copy with isSystem false | DONE | templates/[id]/clone/route.ts; templates.ts:115-165 | |
| A2-AC4 | Editing a template doesn't affect existing projects | DONE | Copy semantics (creation-commit.ts) | |
| A2-DoD1 | Seed script | DONE | prisma/seed-project-templates.ts | |
| A2-DoD2 | Copy, not reference | DONE | | |
| A2-DoD3 | CLIENT on approvals verified | PARTIAL | scripts/verify-p1.ts (manual script) | No unit test in lib/projects/*.test.ts. |
| A2-DoD4 | Builder persists position | DONE | Array order becomes position (templates.ts:388-420) | |
| A2-DoD5 | Cloning works | DONE | | |

## 5. Epic B — Schedule of Record

### B1 — Phases, Milestones, Activities
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| B1-H1 | Exactly one sub-activity level | DONE | app/api/projects/[id]/activities/[activityId]/route.ts:107-121 | |
| B1-H2 | Weight mismatch warns but doesn't block | MISSING | lib/projects/rollup.ts:78 (`weightsMismatch`) | Only `ScheduleTree.tsx:44` uses it. That component is exported (features/projects/index.ts:26) but never rendered. |
| B1-H3 | Weighted rollup Activity→Milestone→Phase→Project | DONE | rollup.ts:137-271 | |
| B1-F1 | Core activity fields: title, assignee (internal), ownerParty, dates, status, %, hours/cost, priority, risk, isMilestone, predecessors | DONE | activities/[activityId]/route.ts:26-57; ActivityDetailPanel.tsx | |
| B1-F2 | Rich-text (WYSIWYG) description | DEVIATES | ActivityDetailPanel.tsx | Plain text. |
| B1-F3 | Coloured tag chips | MISSING | No write path to `ActivityTag`; schedule-grid.tsx:543,582,612 hard-code `tags: []` | |
| B1-F4 | Editable weight | MISSING | Not editable in any live view. New tasks and sections are created with weight 1 (GanttChart.tsx:584-589; ProjectViewSwitcher.tsx:345-352) | Template phases use weight 20, so manual phases get a mismatched scale. |
| B1-S | 6 statuses with exact colours | DONE | tailwind.config.js:158-165 (`project-status-*` tokens) | Overdue bars are overridden to a red fill (GanttChart.tsx:1448). |
| B1-R | Planned % formula | DONE | rollup.ts:99-127 | Normalised by Σweight. The inputs are broken; see B2-PLANNED. |
| B1-AC1 | Weights 2/1 at 100%/0% give 66.7% | DONE | rollup.test.ts:17 | |
| B1-AC2 | Recalculated in the same transaction | DONE | activities/[activityId]/route.ts:155-183 | |
| B1-AC3 | Weight warning badge | MISSING | as B1-H2 | |
| B1-AC4 | Parent % derived from subtasks and read-only | DONE | route.ts:101-105; rollup.ts:201-208 | |
| B1-AC5 | Inverted dates blocked | DONE | route.ts:89-90 (400) | |
| B1-DoD1 | Full CRUD for Phase, Milestone and Activity | PARTIAL | phases/*, milestones/*, activities/* routes | The API is complete. The workspace UI can't rename or delete phases and milestones, or create a named milestone. |
| B1-DoD2 | `recalcActivityAndAncestors()` | DONE | rollup.ts:279-291 | |
| B1-DoD3 | Rollup in the same transaction | DONE | See INV-9 | |
| B1-DoD4 | Exact status colours | DONE | as B1-S | |
| B1-DoD5 | Weight mismatch warning | MISSING | as B1-H2 | |
| B1-DoD6 | ActivityLog on every status change | PARTIAL | route.ts:220-242 | User changes are logged. Status changes the rollup derives for parents, milestones and phases (rollup.ts:184,245-247) are not. |
| B1-X1 | (Not in spec) Parent status derived from subtasks | DEVIATES | rollup.ts:61-75,179-186 | A parent's status is overwritten from its children inside the same transaction. A PATCH to a parent's status is reverted after the approval clock has already run for it, which leaves an orphaned `waitingSince`. Derived APPROVAL_REQUESTED/APPROVED transitions never run the clock. |

### B2 — Confidence Score
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| B2-F | 6-penalty formula | PARTIAL | lib/projects/confidence.ts; lib/projects/health.ts:55-89 | "Blocked activities" counts open BLOCKED DelayEvents (health.ts:59). Those are created only from RAID/scrum paths (raid.ts:142; raid/[raidId]/delay/route.ts:33), never from `Activity.isBlocked`. |
| B2-RAG | RAG derivation | DONE | confidence.ts `deriveRag`; confidence.test.ts:62-78 | In practice this is confidence-only, because SPI is always null. |
| B2-PLANNED | (§B1 formula input) Correct expected % | DEVIATES | rollup.ts:104; baseline.ts:111; templates.ts:390; phases/route.ts:25; schedule-import/route.ts:77; manual-creation.ts:66-67 | **Phase dates are never derived from children.** Template, UI, import and manual phases have null dates, so the baseline copies nulls, `phasePlannedPercent` returns 0 and `percentPlanned` stays 0. The schedule-variance penalty never fires and "Expected %" shows 0 (Overview, portal, R2). Only AI or file-import drafts with phase dates escape this (creation-commit.ts:227-230). |
| B2-EVM | SPI, CPI and EAC computed | MISSING | lib/projects/evm.ts:38-40; health.ts:90 | `budgetAtCompletion` and project `actualCost` have **no writer**: the PATCH schema at app/api/projects/[id]/route.ts:52-67 omits them, and no UI sets them. So `computeEvm` returns nulls for every project, and C3, C17, portfolio SPI, WBR "the one number" and K3 are all empty. |
| B2-AC1 | Worked example ≈ 57.5 → AMBER | DONE | confidence.test.ts:8,62 | |
| B2-AC2 | Confidence below 50 → RED, notify PM + CEO | PARTIAL | health.ts:106-118 | RAG is set. `PROJECT_WENT_RED` is emitted with no recipients, so it is dropped (P5.2-X1). |
| B2-AC3 | Nightly recompute of active projects | DONE | app/api/cron/project-health; scripts/install-crontab.sh:113 (`0 2 * * *`) | Between runs, health is recomputed only after RAID and CR mutations. Schedule or status edits don't refresh confidence. |
| B2-DoD1 | Unit test per penalty | DONE | confidence.test.ts:8-60 | |
| B2-DoD2 | project-health cron | DONE | as AC3 | |
| B2-DoD3 | RAG change notifies | PARTIAL | health.ts:106-111 | Dropped (no recipients). |
| B2-DoD4 | Shown on the C24 ring and portfolio cards | PARTIAL | ProjectsListClient.tsx:221; PortfolioChartsLibrary.tsx:66-85 | C24 is missing (J1-C24). |
| B2-X1 | (Not in spec) `ragStatus` is "computed" | DEVIATES | app/api/projects/[id]/route.ts:57 | It can be PATCHed manually; the next nightly run overwrites it. |

## 6. Epic C — Baselines & the Delay Ledger

### C1 — Commit Baseline
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| C1-UI1 | "Baseline not committed" banner | DONE | ProjectWorkspaceClient.tsx:192-194 | |
| C1-UI2 | Confirmation modal with count, notes and warnings | DONE | baseline/CommitBaselineDialog.tsx:51-59 | |
| C1-FN1 | Copy current→baseline for every Phase, Milestone and Activity | DONE | lib/projects/baseline.ts:106-126 | |
| C1-FN2 | `baselineCommittedAt` set, version = 1 | DONE | baseline.ts:190-193 | |
| C1-FN3 | Full-schedule `BaselineSnapshot` | DONE | baseline.ts:130-166,195-204 | |
| C1-AC1 | Uncommitted: banner shown, `slipDays` = 0 | DONE | rollup.test.ts:63 | |
| C1-AC2 | baseline = current; snapshot v1 exists | DONE | baseline.ts:178-213 | |
| C1-AC3 | Any API write to `baselineStart` returns 403 | PARTIAL | 403 on project, phase, milestone and activity PATCH (app/api/projects/[id]/route.ts:75; phases/[phaseId]:27; milestones/[milestoneId]:30; activities/[activityId]:70) | The bulk schedule PATCH (activities/schedule/route.ts:12-22) and activity POST strip the key through Zod instead of returning 403. Nothing is written, but the 403 contract isn't uniform. |
| C1-AC4 | ActivityLog `baseline_committed` with actor | DONE | baseline/route.ts:40-53 | |
| C1-DoD1 | `POST /api/projects/[id]/baseline` | DONE | baseline/route.ts:25-68 | |
| C1-DoD2 | Server-side write guard | DONE | See INV-1 | |
| C1-DoD3 | Snapshot stores full JSON | DONE | | |
| C1-DoD4 | Banner shows and hides | DONE | | |
| C1-DoD5 | Transaction-safe | DONE | baseline/route.ts:35-37 | The "already committed" check (:28) runs outside the transaction. A concurrent double commit fails on the snapshot unique key and returns a 500. |

### C2 — Re-Baseline
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| C2-UI | Reason ≥20 chars, approver defaults to CEO, diff preview | DONE | baseline/RebaselineDialog.tsx:10-50; baseline/rebaseline/route.ts:20-67 | |
| C2-X1 | (Implied) The approver approves | DEVIATES | rebaseline/route.ts:59-71 | The approver is recorded only. The PM re-baselines immediately, with no approval step. |
| C2-AC1 | Version increments, new snapshot, old one kept | DONE | baseline.ts:215-257 | Activity baseline fields are overwritten; only the snapshots keep history. |
| C2-AC2 | Reason under 20 chars blocked | DONE | rebaseline/route.ts:21; project-remediation-guards.test.ts:33 | |
| C2-AC3 | Reports can still show variance vs v1 | MISSING | `BaselineSnapshot` has no reader (grep `baselineSnapshot` outside baseline.ts = 0) | After a re-baseline, the ledger's "Original" date, portal Planned-vs-Actual, Gantt ghost bars and R2 all use the new baseline. |
| C2-DoD1 | Multiple versions kept | DONE | Snapshot `@@unique([projectId, version])` | |
| C2-DoD2 | Reports select a baseline version (default v1) | MISSING | GanttChart.tsx:226,847-848; gantt/export/route.ts:32,172 | The Gantt version select is cosmetic. Export ignores the `baselineVersion` param and only prints it in the header. |
| C2-DoD3 | Accurate diff preview | DONE | baseline.ts:84-99; baseline.test.ts:13-44 | |
| C2-DoD4 | ActivityLog plus CEO notification | PARTIAL | rebaseline/route.ts:74-98 | Logged. `PROJECT_REBASELINED` has no recipients, so it is dropped. |

### C3 — The Approval Clock ⭐
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| C3-FN1 | →APPROVAL_REQUESTED sets `waitingSince` and forces ownerParty CLIENT | DONE | lib/projects/delay-ledger.ts:232-236 | |
| C3-FN2 | CLIENT_APPROVAL_PENDING sent to client portal user + PM | DEVIATES | delay-ledger.ts:237-251; activities/[activityId]/route.ts:187-189 | Emitted with no recipients, so it is dropped. Portal users are not notification principals. |
| C3-FN3 | On resolve: business-day APPROVAL_WAIT DelayEvent (CLIENT, auto, phaseAtTime) | DONE | delay-ledger.ts:255-270 | |
| C3-FN4 | SLA breach row plus `breachCount++` | DONE | delay-ledger.ts:272-291 | Uses the lowest-SLA APPROVAL obligation of the project, not a per-approver one. |
| C3-FN5 | `waitingSince` reset | DONE | delay-ledger.ts:315-318 | |
| C3-R1 | Business days with configurable holidays | PARTIAL | lib/projects/business-days.ts:33 | Weekends are excluded. The holiday parameter exists, but there is no project holiday calendar and the route passes none (activities/[activityId]/route.ts:161). |
| C3-R2 | Clock is automatic | DONE | activities/[activityId]/route.ts:160-162 | Every status write from the panel, Table, Board or Gantt goes through this PATCH. Exception: B1-X1. |
| C3-R3 | Escalations at SLA, +3 and +7 | PARTIAL | lib/projects/approval-escalations.ts:37-91; cron route; install-crontab.sh:111 | Thresholds and dedupe are correct (delay-ledger.test.ts:12-17). The notifications have no recipients, so they are dropped. |
| C3-AC1 | Monday request → `waitingSince` Monday, owner CLIENT | DONE | delay-ledger.test.ts:98 | |
| C3-AC2 | 5 business days → daysLost 5 | DONE | delay-ledger.test.ts:105 | |
| C3-AC3 | SLA 3, took 5 → breach of 2, count++ | DONE | delay-ledger.test.ts:117 | |
| C3-AC4 | SLA+3 escalation to PM + client contact | PARTIAL | as R3 | Dropped; the client contact is not addressable. |
| C3-AC5 | Rejection still records the delay | DONE | delay-ledger.test.ts:138 | |
| C3-AC6 | Weekends excluded | DONE | business-days.test.ts:12,25 | |
| C3-DoD1 | `onStatusChange()` handles all transitions | DONE | delay-ledger.ts:150-166,191-322 | Named `decideApprovalClockTransition` and `applyApprovalClock`. |
| C3-DoD2 | Business days with holidays | PARTIAL | as R1 | |
| C3-DoD3 | DelayEvent auto-created | DONE | | |
| C3-DoD4 | ApprovalSlaBreach created | DONE | | |
| C3-DoD5 | Escalations at SLA, +3 and +7 | PARTIAL | as R3 | |
| C3-DoD6 | Unit tests: weekend, SLA and rejection paths | DONE | delay-ledger.test.ts:98-170; business-days.test.ts | These test the pure decision function, not the DB path. |
| C3-DoD7 | Live "days waiting" in T3 Pending Client Actions | PARTIAL | ActivityDetailPanel.tsx:520-523; GanttChart.tsx:1545-1552; app/portal/projects/[id]/page.tsx:96-117 | There is no internal T3 table. Counters are computed at render time, with no live tick. The panel and portal use a **hard-coded 3-day SLA** (ActivityDetailPanel.tsx:86; features/projects/services/portal-dashboard.ts:44) instead of the obligation SLA. |

### C4 — Slip Reason & Owner Attribution
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| C4-UI | Reason modal showing baseline end, new end and +days | PARTIAL | GanttChart.tsx:1124-1174 | Has reason, owner and detail. It doesn't show baseline end, new end or +days. Owner is pre-set to CLIENT before a reason is picked (:464-466). |
| C4-TAX | 9 reasons; owner auto-suggested and overridable | DONE | GanttChart.tsx:1147-1150 (`SLIP_REASON_OWNER`); features/projects/types.ts | |
| C4-AC1 | Baselined date moves aren't saved without reason + owner | DONE | activities/[activityId]/route.ts:96-99; activities/schedule/route.ts:47-49 | Enforced on the server. **The Table view** sends date edits with no slip, so on a baselined project they always get a 403 and no dialog is shown (ProjectViewSwitcher.tsx:380-387). |
| C4-AC2 | No modal before baseline | DONE | GanttChart.tsx:462-470 | |
| C4-AC3 | SCOPE_ADDITION → CLIENT, overridable to SHARED | DONE | | |
| C4-AC4 | DelayEvent carries phaseAtTime | DONE | delay-ledger.ts:76-106 | |
| C4-AC5 | Cancel snaps the bar back | DONE | GanttChart.tsx:1126-1129 | Nothing is persisted before confirm. |
| C4-DoD1 | Hard gate | DONE | as AC1 | |
| C4-DoD2 | Revert on cancel | DONE | | |
| C4-DoD3 | DelayEvent with phase context | DONE | | |
| C4-DoD4 | Reason→owner suggestion with override | DONE | | |
| C4-DoD5 | `slipDays` recomputed and rolled up to project | PARTIAL | rollup.ts:209-213; health.ts:56 | Only top-level activities get `slipDays`; sub-activities never do. There is no project slip field; health sums it at runtime. |
| C4-X1 | (Ledger integrity) One slip = one delay | DEVIATES | activities/schedule/route.ts:74-100 | Each auto-shifted successor gets its own BASELINE_SLIP event with the same reason and owner. A 5-day slip on A→B→C records 15 ledger days. Calendar-day slips are also mixed with business-day approval waits, and an approval wait plus the resulting date move are both counted. **This inflates T1 totals, C6, C18 and the client-owned %.** |

### C5 — Delay Ledger Table (T1)
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| C5-UI | Header totals by owner, 3 filters, CSV/PDF export | DONE | features/projects/components/DelayLedgerTable.tsx:187-206 | |
| C5-COLS | 11 columns including recovery fields | DONE | delay-ledger.ts `CSV_HEADERS`; DelayLedgerTable.tsx:40-138 | |
| C5-AC1 | Owner split adds up | DONE | delay-ledger.test.ts:28 | |
| C5-AC2 | Owner filter updates the total | DONE | app/api/projects/[id]/delays/route.ts:22-33 | Computed on the server over the filtered set. |
| C5-AC3 | Red SLA breach badge | DONE | DelayLedgerTable.tsx:74 | |
| C5-AC4 | Export contains the filtered rows | DONE | DelayLedgerTable.tsx:146-180; delays/pdf | |
| C5-AC5 | Over 7 days with no recovery plan shows a warning | DONE | DelayLedgerTable.tsx:56-57 | |
| C5-DoD1 | Sort, filter and export | PARTIAL | DelayLedgerTable.tsx (no `getSortedRowModel`) | No sorting. |
| C5-DoD2 | Totals computed on the server | DONE | | |
| C5-DoD3 | SLA badges | DONE | | |
| C5-DoD4 | Recovery plan editable inline | DONE | DelayLedgerTable.tsx:83-138; delays PATCH | |
| C5-DoD5 | Shown in the PM view and the portal | DONE | features/projects/services/portal-pages.server.ts:158; app/api/portal/projects/[id]/route.ts:39 | |

## 7. Epic D — Gantt (Instagantt parity)

### D1 — Layout & Structure
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| D1-S1 | Split pane, resizable divider, synced scroll | DONE | GanttChart.tsx:253-283,960-1104 | |
| D1-S2 | Left columns configurable through Columns▾ | MISSING | GanttChart.tsx:182 (fixed `GANTT_COLUMNS`: assignee, start, due, status, %) | No EH, Priority, Risk, Owner or Slip columns in the Gantt. |
| D1-S3 | Row types Phase, Milestone, Activity, Sub-activity | DONE | schedule-grid.tsx:515-664 | |
| D1-S4 | Per-row and global collapse | DONE | GanttChart.tsx:800-805 | |
| D1-S5 | Live search | DONE | lib/stores/project-view-store.ts | |
| D1-S6 | Red today line with red day number | PARTIAL | GanttChart.tsx:998-1010 | Shows a line and a "Today" tag; the day number isn't highlighted. |
| D1-S7 | Two-row header with week numbers | PARTIAL | GanttChart.tsx:1741-1916 | Week numbers appear only on the Weeks scale. |
| D1-S8 | 5 scales | DONE | GanttChart.tsx:121,891-897 | The scale isn't persisted. |
| D1-S9 | +/- zoom with % | DONE | GanttChart.tsx:919-927 | |
| D1-S10 | Minimap shows the viewport | PARTIAL | GanttChart.tsx:1636-1700 | Read-only; you can't click it to navigate. |
| D1-S11 | Sort by Date, Name, Status or Priority | PARTIAL | GanttChart.tsx:887-890 | Only "Manual" and "Section, then start date". |
| D1-AC1 | Synced scroll | DONE | | |
| D1-AC2 | Divider position persisted per user | PARTIAL | GanttChart.tsx:253,278 | Saved per browser in localStorage, not per user account. |
| D1-AC3 | Collapsing a phase keeps its summary bar | DONE | | |
| D1-AC4 | Today line at the right x | DONE | GanttChart.tsx:341 | |
| D1-AC5 | Months scale re-renders | DONE | | |
| D1-AC6 | 200+ rows virtualized at 60fps | PARTIAL | GanttChart.tsx:4,333-338 (`@tanstack/react-virtual`) | Never measured. |
| D1-DoD1 | Custom Gantt, no dhtmlx | DONE | | |
| D1-DoD2 | Virtualized rows | DONE | | |
| D1-DoD3 | Synced scroll and persisted divider | DONE | Uses localStorage | |
| D1-DoD4 | All 5 scales | DONE | | |
| D1-DoD5 | Working minimap | PARTIAL | as S10 | |
| D1-DoD6 | 500 activities at 60fps | PARTIAL | Unmeasured | |

### D2 — Bars, Baseline Overlay, Colours
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| D2-B1 | Bar colour = status | DONE | GanttChart.tsx:1448 (`statusClass`) | Overdue replaces it with a red fill. |
| D2-B2 | Ghost bar `#D1D1D6` 40%, below, only when baselined | DONE | GanttChart.tsx:1417-1428 | 60% opacity. Uses the `project-baseline` token. |
| D2-B3 | Progress fill | DONE | GanttChart.tsx:1492 | |
| D2-B4 | Milestone diamond | DONE | GanttChart.tsx:1430-1444 | |
| D2-B5 | Phase summary spans children and can't be dragged | DONE | GanttChart.tsx:1373,1445-1449 | |
| D2-B6 | Label to the right of the bar | DONE | `showLabelInside` when width ≥150 | |
| D2-B7 | Subtle red tint on RED activities | DEVIATES | GanttChart.tsx:1446-1450 | Activities have no RAG. It uses risk=HIGH, critical path and overdue as proxies. |
| D2-AC1 | 14-day slip gap is visible | DONE | | |
| D2-AC2 | 60% fill | DONE | | |
| D2-AC3 | Diamond at `currentEnd` | PARTIAL | GanttChart.tsx:1440 (`actual.left - 7`) | Placed at `currentStart`. |
| D2-AC4 | Phase bar auto-spans, can't be dragged | DONE | | |
| D2-AC5 | Yellow bar with ⏱ days waiting | DONE | GanttChart.tsx:1545-1552 | |
| D2-DoD1..6 | Ghost, colours, fill, diamonds, phase span, clock badge | DONE | as above | |

### D3 — Drag, Resize, Dependency Auto-Shift
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| D3-I1 | Drag the bar to move both ends | DONE | GanttChart.tsx:672-738 | |
| D3-I2 | Drag the left edge to resize the start | DONE | | |
| D3-I3 | Drag the right edge to resize the end | DONE | | |
| D3-I4 | Drop → C4 modal; cancel → snap back | DONE | GanttChart.tsx:462-470 | |
| D3-I5 | FS successors shift by the same delta, transitively | DEVIATES | lib/projects/scheduling.ts:98-164; activities/schedule/route.ts:56-66 | Successors are *re-aligned* to the predecessor (pred end + lag + 1), so slack is consumed and moving earlier pulls successors earlier. Resizes and panel date edits never cascade. |
| D3-I6 | Draw a dependency with hover handles | DONE | GanttChart.tsx:762-774 | |
| D3-I7 | Click an arrow to delete, with confirm | DONE | GanttChart.tsx:1175-1187 | |
| D3-I8 | Cycle blocked | DONE | scheduling.ts:54; dependencies/route.ts:49 | |
| D3-AC1 | A +5 → B +5 | PARTIAL | as I5 | True only when B has no slack. |
| D3-AC2 | A→B→C cascade | DONE | scheduling.test.ts:39 | |
| D3-AC3 | Modal before persisting | DONE | | |
| D3-AC4 | Cancel reverts the bar and its successors | DONE | The cascade is computed on the server only at confirm | |
| D3-AC5 | "This would create a circular dependency." | DONE | scheduling.test.ts:73 | |
| D3-AC6 | Live date tooltip | DONE | GanttChart.tsx:1116-1123 | |
| D3-DoD1 | `shiftSuccessors()` with cycle detection | DONE | scheduling.ts:82-96 | |
| D3-DoD2 | Drag and resize with tooltip | DONE | | |
| D3-DoD3 | Reason gate | DONE | | |
| D3-DoD4 | Full revert including cascade | DONE | | |
| D3-DoD5 | Draw and delete UI | DONE | | |
| D3-DoD6 | FS, SS, FF and SF; FS default | DONE | scheduling.ts:150-170; scheduling.test.ts:50 | |

### D4 — Toolbar
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| D4-T1 | Export & Share: PDF, PNG, CSV, MS Project XML, share to portal | DONE | GanttChart.tsx:806-832; gantt/export/route.ts:7-68 | Also offers "Publish public snapshot". |
| D4-T2 | Baselines: show/hide, version, commit, re-baseline | PARTIAL | GanttChart.tsx:836-860 | The version select is a no-op (C2-DoD2). |
| D4-T3 | Options: dependencies, progress, critical path, weekends, today | DONE | GanttChart.tsx:862-876 | |
| D4-T4 | Columns▾ including Slip Days, persisted | MISSING | as D1-S2 | |
| D4-T5 | Segments: group by Phase, Assignee, Status or Owner | DEVIATES | GanttChart.tsx:879-884; schedule-grid.tsx:775-788 | Only re-sorts inside each milestone. No group headers. |
| D4-T6 | Undo | PARTIAL | GanttChart.tsx:648-658,750-755 | Single step, dates only, replayed as `move`. |
| D4-T7 | Critical path highlight | DONE | GanttChart.tsx:321-331,931-935 | See D4-DoD2. |
| D4-T8 | Duplicate | DONE | GanttChart.tsx:523-538 | |
| D4-T9 | Status colour legend | DEVIATES | GanttChart.tsx:938-946 | The legend shows Baseline, Current, Milestone, Today and Critical, not the 6 statuses. |
| D4-T10 | Comment indicators toggle | DONE | GanttChart.tsx:1553-1558 | |
| D4-T11 | Minimap toggle | DONE | | |
| D4-T12 | AI Assistant | DONE | GanttChart.tsx:914-916 | See J6. |
| D4-T13 | Sort by | PARTIAL | as D1-S11 | |
| D4-T14 | Scale with today on/off | PARTIAL | | No "calendar days vs week numbers" option. |
| D4-AC1 | Hide ghost bars | DONE | | |
| D4-AC2 | Longest zero-float path highlighted | DEVIATES | scheduling.ts:176-208 | Longest chain of task durations over the edges. Ignores lag, dependency type, date gaps and float. |
| D4-AC3 | Column toggles persisted per user | MISSING | | |
| D4-AC4 | Print-ready PDF with header | DONE | gantt/export/route.ts:150-175 | |
| D4-AC5 | Scale panel matches Image 5 | PARTIAL | | |
| D4-DoD1 | Every dropdown works | PARTIAL | | Columns missing, Segments doesn't group, version select is a no-op. |
| D4-DoD2 | CPM forward/backward pass | DEVIATES | as AC2 | |
| D4-DoD3 | PDF, PNG, CSV and MS Project export | DONE | | |
| D4-DoD4 | Column preferences per user | MISSING | | |
| D4-DoD5 | Scale panel = Image 5 | PARTIAL | | |

## 8. Epic E — View Toggles

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| E1-V1 | Gantt is the default | DONE | lib/stores/project-view-store.ts:30 | |
| E1-V2 | Table: inline edit, multi-select, bulk status/assignee, sort and filter | PARTIAL | ProjectViewSwitcher.tsx:299-451 | Inline status and % edits only. **No multi-select or bulk** (no code). No sortable headers. Date edits on a baselined project return 403 (C4-AC1). |
| E1-V3 | Board: 6 status columns; drag = status change | DEVIATES | ProjectViewSwitcher.tsx:534-547 | Columns are **Phases**. A drop PATCHes `milestoneId`. |
| E1-V4 | Workload: people × weeks heatmap, over-allocated red | PARTIAL | app/api/projects/workload/route.ts:22-107; ProjectViewSwitcher.tsx:610-689 | The API computes weekly cross-project cells. The view draws dated task bars per assignee with a "max allocation %" label. No heatmap, no red. |
| E1-V5 | Mindmap: radial tree | DEVIATES | mindmap/ProjectHierarchyMap.tsx:265-284 | Layered top-down tree. |
| E1-V6 | Overview: C24 ring, KPIs, charts, registers | PARTIAL | ProjectViewSwitcher.tsx:691-793 | No C24 ring. |
| E1-AC1 | Filters persist across views | DONE | project-view-store.ts (persist `projects.schedule-view`) | A status filter set in Table silently filters the Gantt, which has no status control to clear it. |
| E1-AC2 | Board drag Finished→Approval Requested starts the clock | MISSING | as V3 | |
| E1-AC3 | Workload over 100% shows red with % | MISSING | as V4 | |
| E1-AC4 | Overview C24, Expected vs Actual | PARTIAL | ProjectViewSwitcher.tsx:691-760 | A progress bar shows actual vs planned. Planned is usually 0 (B2-PLANNED). |
| E1-DoD1 | All 6 views | DONE | ProjectViewSwitcher.tsx:120-127 | |
| E1-DoD2 | Filters persist in Zustand | DONE | | |
| E1-DoD3 | Board drag is a real status transition | MISSING | | |
| E1-DoD4 | Workload covers ALL projects | DONE | workload/route.ts:26-60 | Scoped to the requester's visible projects. |
| E1-DoD5 | Overview matches Images 3 and 9 | PARTIAL | | |

## 9. Epic F — Activity Detail Panel & Comments

### F1 — Activity Detail Panel
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| F1-UI | Image 2 layout plus Owner Party, clock banner, visibility toggles | PARTIAL | ActivityDetailPanel.tsx:357-361,520-523,576-586,634-637 | All 3 additions are present. Tags are missing and the description is plain text. |
| F1-H1 | ✓ Mark done sets FINISHED and 100% | DONE | ActivityDetailPanel.tsx:246 | |
| F1-H2 | ⇤ Outdent | DONE | :254 | |
| F1-H3 | ⇥ Indent | DONE | :262,919 | |
| F1-H4 | ◇ Convert to milestone | DONE | :269-272 | |
| F1-H5 | 🎨 Custom bar colour | PARTIAL | :277-281; schema `Activity.color` | Saved, but **never rendered** in the Gantt (no `row.color` use). |
| F1-H6 | 🗑 Delete with confirm | DONE | :91,97 (ConfirmDialog) | |
| F1-H7 | ✕ Close | DONE | | |
| F1-AC1 | Clicking a bar opens the panel | DONE | ProjectViewSwitcher.tsx:169-172 (`?activity`) | |
| F1-AC2 | Clock banner with live business days and SLA breach | PARTIAL | :223-224,520-523 | Uses a hard-coded 3-day SLA (:86) and computes at render time. |
| F1-AC3 | Indent makes it a sub-activity of the row above | DONE | | |
| F1-AC4 | ◇ renders a diamond | DONE | | |
| F1-AC5 | →APPROVAL_REQUESTED starts the clock and notifies the client | PARTIAL | | The clock runs; the notification is dropped. |
| F1-AC6 | Optimistic save with an undo toast | PARTIAL | :152-175; features/projects/hooks/useProject.ts:902 (no `onMutate`) | There is an undo toast, but the save isn't optimistic. |
| F1-DoD1 | Matches Image 2 plus 3 additions | PARTIAL | as UI | |
| F1-DoD2 | All 7 header actions work | PARTIAL | as H5 | |
| F1-DoD3 | Indent/outdent restructures correctly | DONE | activities/[activityId]/route.ts:107-121 | |
| F1-DoD4 | Clock banner live-updates | PARTIAL | as AC2 | |
| F1-DoD5 | Optimistic with undo | PARTIAL | as AC6 | |

### F2 — Comments with Internal/Client Visibility ⭐
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| F2-AC1 | INTERNAL is never returned by the portal (raw response) | DONE | lib/projects/activity-comments.ts; portal-routes-invariant.test.ts:302-390 | The route-level test evaluates the visibility filters. |
| F2-AC2 | CLIENT_VISIBLE appears in the portal | DONE | | |
| F2-AC3 | Client comment is `isClientAuthor` with a badge | DONE | portal …/comments/route.ts:67; ActivityDetailPanel.tsx:792 | |
| F2-AC4 | @mention notifies | DONE | app/api/projects/[id]/activities/[activityId]/comments/route.ts:98-104 | Uses explicit recipients, so it is delivered. |
| F2-AC5 | Defaults to INTERNAL | DONE | comments/route.ts:17; ActivityDetailPanel.tsx:100,139,206 | |
| F2-DoD1 | Visibility on every comment | DONE | | |
| F2-DoD2 | Filtered at the query level | DONE | | |
| F2-DoD3 | Same rule for attachments | DONE | portal-serializer.test.ts:421 | |
| F2-DoD4 | @mention notifications | DONE | | |
| F2-DoD5 | Client comments distinct | DONE | | |

---

## 10. Epic G — Jira Integration (sub-agent trace; spot-checked)

The sub-agent verified these rows. I re-checked G1-DoD2 and G2-EP.

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| G1-UI | Integrations tab form | DONE | features/projects/components/integrations/JiraIntegrationPanel.tsx:114-116,164-177; ProjectDeliveryControlCenter.tsx:162 | |
| G1-SEC1 | Test calls `GET /myself` | DONE | features/projects/services/jira/connection.ts:109 | |
| G1-AC1 | Valid credentials show issue and sprint counts | DONE | connection.ts:110-121,139-157 | |
| G1-AC2 | 401 "Invalid token" and 404 "Project key not found" | PARTIAL | connection.ts:93-99 | Jira returns 400 for an unknown key in JQL, so the 404 message can't be reached. |
| G1-AC3 | Save encrypts and sets `jiraLinked` | DONE | app/api/projects/[id]/jira/route.ts:71-72,110 | |
| G1-AC4 | Token masked, never sent to the client | DONE | jira/route.ts:30-50; connection.ts:65-91 | |
| G1-DoD1 | AES-256 at rest | DONE | lib/projects/jira-crypto.ts:3,11-26,58 | AES-256-GCM with AAD. |
| G1-DoD2 | Token never exposed | PARTIAL | app/api/projects/[id]/jira/test/route.ts:33-44 | With a blank token, Test Connection **decrypts the stored token and sends it to a caller-supplied `siteUrl`**. Any project writer can exfiltrate it. Only `https` is checked. |
| G1-DoD3 | Test endpoint | DONE | jira/test/route.ts:21-52 | |
| G1-DoD4 | Error mapping for 401, 403, 404 and 429 | DONE | connection.ts:93-99; jira-connection.test.ts:43 | |
| G2-EP | Search, sprints, worklog and changelog endpoints | DONE | sync.ts:269,286,296,301 | Uses `GET /rest/api/3/search`, which Atlassian deprecated in favour of `/search/jql`. **Check this against live Jira Cloud.** Worklog and changelog responses are not paginated. |
| G2-CRON | Every 30 min with Bearer CRON_SECRET | DONE | app/api/cron/jira-sync/route.ts:9-14; install-crontab.sh:121 | |
| G2-SYNCNOW | Manual Sync Now | DONE | app/api/projects/[id]/jira/sync/route.ts; JiraIntegrationPanel.tsx:205 | Writes no ActivityLog entry. |
| G2-INC | Incremental `updated >= -35m` | PARTIAL | sync.ts:90-92,167 | **There is no initial or backfill sync.** The first sync and Sync Now also use the 35-minute window, so a missed cron run loses data for good. |
| G2-RL | Rate limit with exponential backoff | PARTIAL | sync.ts:232-233,305-326 | Only 2 retries (250 ms and 500 ms). `Retry-After` is ignored. |
| G2-AC1 | Every active connection syncs and writes a log | DONE | sync.ts:134-150,194-206 | |
| G2-AC2 | 429 → back off and log PARTIAL | DEVIATES | sync.ts:181-189,311-317 | A 429 on search gives FAILED. A successful retry gives SUCCESS. |
| G2-AC3 | Email → User resolution | PARTIAL | sync.ts:117,399-414 | Worklog authors resolve only if they are also an assignee. |
| G2-AC4 | Error banner on the project | PARTIAL | JiraIntegrationPanel.tsx:123-134 | The banner shows only inside the Integrations tab. `JIRA_SYNC_FAILED` is never emitted. |
| G2-AC5 | Graceful degradation | DONE | sync.ts:187-190 | |
| G2-DoD5 | JiraSyncLog for every run | DONE | sync.ts:194-214 | |
| G3-DoD1 | 5 mapping rule types | DEVIATES | features/projects/services/jira/rollup.ts:6,27-82 | Sprint maps to an Activity, not a Phase, and needs the raw sprint id. |
| G3-AC1 | 6 of 10 done → 60% | DONE | rollup.ts:48-67; jira-rollup.test.ts | Points-weighted when points exist. |
| G3-DoD2 | Auto-rollup on sync | DONE | sync.ts:186 (inside a transaction) | Not audited. Auto-rollup with no matches forces 0%. |
| G3-AC2 | Manual % turns auto-rollup off | DONE | activities/[activityId]/route.ts:146 | |
| G3-AC3 | No mapping = fully manual | DONE | schema.prisma:2826 | |
| G3-DoD4 | Mapping UI with live preview | DONE | ActivityDetailPanel.tsx:403-451; jira/mapping-preview/route.ts | |
| G4-DoD1 | Idle uses transitions + worklogs + comments | DEVIATES | features/projects/services/jira/metrics.ts:143-171,198-234 | Jira comments are never fetched. The "comment" signal is faked from `lastActivityAt`. |
| G4-AC1 | No activity Mon–Wed → 3 idle days | DONE | metrics.ts:65-121 | |
| G4-AC4 | Weekends and holidays excluded | PARTIAL | metrics.ts:72; jira/metrics/route.ts:15-20 | Holidays only via a query param. R3 passes none. |
| G4-AC2 | Accuracy 12/8 = 1.5 | DONE | metrics.ts:261-274 | |
| G4-AC3 | Median bias flag | DONE | metrics.ts:246-259 | No minimum sample size. The flag is not shown in R3. |
| G4-DoD4a | Shown in R3 | DONE | lib/projects/performance-reports.ts:210-211 | |
| G4-DoD4b | Feeds the Performance module | MISSING | lib/performance/project-jira-metrics.ts (shim, no importers) | |
| G5-AC1 | Adoption formula 67.5% | DONE | features/projects/services/jira/adoption.ts:37-71; jira-adoption.test.ts | |
| G5-AC2 | Banner on reports when < 60% | PARTIAL | JiraIntegrationPanel.tsx:242-245 | Integrations panel only; reports get one sentence. |
| G5-DoD1 | Score per project and per team | DEVIATES | adoption.ts:73-96 | The "team" is per assignee and is never shown. |
| G5-DoD3 | Shown in R4 | DONE | performance-reports.ts:246,360 | |
| G6-DoD1 | Quick-log widget | DONE | ScrumLogWidget.tsx:123-164 | No Cancel button. |
| G6-AC1 | Attendance stored with date and time | DONE | app/api/projects/[id]/scrum-log/route.ts:34-62 | |
| G6-AC4 | Re-logging edits the existing record | DONE | schema.prisma:3282; scrum-log/route.ts:49-62 | |
| G6-AC2 | Period totals and per-person % | PARTIAL | features/projects/services/scrum-attendance.ts:57-123 | All-time only; no period filter. |
| G6-AC3 | Below 70% flagged in R5 | PARTIAL | scrum-attendance.ts:94; ScrumLogWidget.tsx:191-204 | Flagged in the widget; R5 doesn't exist. |
| G6-DoD2 | R5 report with C16 heatmap | MISSING | ScrumLogWidget.tsx:207-240 (last 10 logs only) | No SCRUM ProjectReport and no PDF. |
| G6-DoD4 | Feeds the Performance module | MISSING | lib/performance/project-scrum-attendance.ts (shim) | |

## 11. Epic H — Governance Registers (sub-agent trace; spot-checked)

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| H1-UI | 4 RAID tabs | DONE | features/projects/components/registers/RaidRegister.tsx:27-30,69 | |
| H1-AC1 | P4×I5 = 20, red zone | DONE | lib/projects/raid.ts:34-37; RaidRegister.tsx:163-178,358-361 | |
| H1-AC2 | `daysOpen` auto-computed | DONE | raid.ts:39-42,84 | |
| H1-AC3 | Overdue CLIENT dependency flags red and can create a DelayEvent | DONE | raid.ts:51-62; raid/[raidId]/delay/route.ts:25-58 | Only the age cell turns red. Generation is manual. |
| H1-AC4 | `clientVisible` respected in portal | DONE | portal-serializer.ts:238-240; app/api/portal/projects/[id]/route.ts:28-29 | The RAID *list* respects it. Report content does not (I2-F8). |
| H1-AC5 | High risks penalise confidence | DONE | lib/projects/health.ts:58,85 | |
| H1-DoD1..5 | Types, matrix, daysOpen, portal, penalty | DONE | as above | |
| H2-WF | CR workflow enforced | DEVIATES | lib/projects/change-requests.ts:19-29 | SUBMITTED can go straight to APPROVED, skipping UNDER_REVIEW. Approval isn't gated on client sign-off. |
| H2-AC1 | Approval creates a DelayEvent (SCOPE_ADDITION, CLIENT, days) | DONE | change-requests.ts:86-104 | Owner is always CLIENT, even for 360GROUND requests. |
| H2-AC2 | Affected activities' `currentEnd` shifts | PARTIAL | change-requests.ts:61-84 | End only: no start shift, no successor cascade, no slipReason. |
| H2-AC3 | Pending CR appears in R2 | DONE | lib/projects/client-report.ts:211,303-308 | Includes **INTERNAL** CRs (I2-F8). |
| H2-AC4 | C22 cumulative chart | PARTIAL | ChangeControlBoard.tsx:66 | A single number, no chart. |
| H2-DoD1 | Full workflow | PARTIAL | | `CHANGE_REQUEST_SUBMITTED` is never emitted. |
| H2-DoD2 | Auto DelayEvent and schedule shift | PARTIAL | as AC1/AC2 | |
| H2-DoD3 | Client sign-off captured | PARTIAL | change-requests/[crId]/route.ts:55-58 | A PM checkbox. No signer identity and no portal sign-off. |
| H2-DoD4 | In R2 and R6 | DONE | client-report.ts:303; management-reports.ts:321,367 | |
| H3-AC1 | Soft block on next-phase start; override reason logged | PARTIAL | lib/projects/stage-gates.ts:36-68; activities/[activityId]/route.ts:123-128,238-240 | 409 plus a required reason. The reason goes only into ActivityLog metadata. `STAGE_GATE_BYPASSED` is not emitted, and only the immediately preceding gate is checked. |
| H3-AC2 | PASSED needs all criteria checked and approvals obtained | DEVIATES | stage-gates.ts:22-34 | Criteria have no checked state; ≥1 exit criterion is enough. |
| H3-AC3 | WAIVED requires a reason | DONE | stage-gates.ts:27-29; stage-gates/[gateId]/route.ts:47-50 | DEPARTMENT_LEAD can waive; the spec reserves waiving for EXECUTIVE. |
| H3-AC4 | Gate status in R6 | DONE | management-reports.ts:319,352 | |
| H3-DoD1 | Criteria checklists | PARTIAL | StageGateRegister.tsx:68-70 | Text lists. |
| H3-DoD2 | Soft block with override | PARTIAL | as AC1 | |
| H3-DoD3 | Waiver reason | DONE | | |
| H3-DoD4 | Gate status in reports | DONE | | |
| H4-AC1 | 9 days on a 5-day SLA → breach of 4, count++ | DONE | delay-ledger.ts:150-160,278-291 | |
| H4-AC2 | `complianceRate` formula | DONE | lib/projects/client-obligations.ts:5-9,30-45 | |
| H4-AC3 | Below 60% lowers C9 and warns the CEO | PARTIAL | client-obligations/route.ts:30-35; lib/projects/portfolio-dashboard.ts:229-247 | Project banner only. Portfolio C9 ignores obligations (hard-coded 3-day SLA). No CEO notification. |
| H4-AC4 | R6 obligations scorecard | DONE | management-reports.ts:320,328-366 | |
| H4-DoD1 | Register with named person and SLA | DONE | | |
| H4-DoD2 | Breach tied to the approval clock | DONE | | The breach notification is dropped. |
| H4-DoD3 | Compliance computed | DONE | | |
| H4-DoD4 | Feeds the Client Health Score | DEVIATES | portfolio-dashboard.ts:229-247 | Project level only. |
| H4-DoD5 | In R6 | DONE | | |
| H5-AC1 | Milestone slip over 10 days or RED prompts a COE | PARTIAL | lib/projects/coe.ts:62-79; coes/route.ts:59-70 | Detection runs only when the COE tab is opened. `COE_REQUIRED` is never emitted. |
| H5-AC2 | 5 whys required to close | DONE | coe.ts:39-52 | |
| H5-AC3 | `fedIntoTemplate` → Lessons Learned register | PARTIAL | coe.ts:126-128 | Per-project list; no cross-project register. |
| H5-AC4 | CEO dashboard shows overdue COE fixes | MISSING | portfolio-dashboard.ts:271-281 | |
| H5-DoD1 | Auto-trigger | PARTIAL | as AC1 | |
| H5-DoD2 | Structured 5 whys | DONE | | |
| H5-DoD3 | Root cause feeds C18 | DEVIATES | coe.ts:92-103 | Per-project COE Pareto only. |
| H5-DoD4 | Template feedback loop | MISSING | | A flag only. |
| H6-AC1 | APPROVED → Ready to Invoice, notify finance | DONE | lib/projects/payment-milestones.ts:18-20,63-99; activities/[activityId]/route.ts:179-210 | Finance recipients are guessed from email or designation. |
| H6-AC2 | Over 30 days outstanding flagged on the CEO dashboard | PARTIAL | payment-milestones.ts:30-39 | Shown in the project register only. |
| H6-DoD1 | Trigger on approval | DONE | | |
| H6-DoD2 | Finance notification | PARTIAL | | Heuristic recipients. |
| H6-DoD3 | Overdue tracking | PARTIAL | | Project, R6 and digest only. |

## 12. Epic I — Client Portal

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| I1-R | `/portal` separate from `/dashboard` | DONE | app/portal/** | |
| I1-AUTH | Separate ClientPortalUser with a distinct NextAuth provider | DONE | app/api/portal/auth/[...nextauth]/route.ts | |
| I1-AC1 | Scoped to `projectIds` | DONE | portal-serializer.ts `portalProjectWhere`; portal-routes-invariant.test.ts:393-406 | Scope is re-read from the DB, not the JWT. |
| I1-AC2 | `/dashboard/*` → 403 for client users | DONE | middleware.ts:40 | |
| I1-AC3 | Internal preview banner | DONE | app/portal/page.tsx:20-22; app/portal/projects/[id]/page.tsx:69 | |
| I1-DoD1..4 | Separate flow, hard scope, dashboard blocked, preview | DONE | PortalAccessPanel.tsx:136 | |
| I2-S1 | One dedicated serializer is the only path | DONE | portal-serializer.ts; portal-route-guards.test.ts:51-66 | |
| I2-S2 | Owner shows "Your Team" / "360Ground Team" | DONE | portal-serializer.ts `ownerLabelForClient` | The label is "360Ground", not "360Ground Team". |
| I2-F1 | No assigneeId, name or avatar | DONE | portal-routes-invariant.test.ts:381-390 | |
| I2-F2 | No individual performance | DONE | `portalReportWhere` types (portal-serializer.ts:250-256) | Excludes INDIVIDUAL and TEAM. |
| I2-F3 | No internal comments | DONE | | |
| I2-F4 | No internal attachments | DONE | | |
| I2-F5 | No cost or margin fields | DONE | portal-serializer.ts:190-205 (scrub keys) | |
| I2-F6 | No Jira keys | DONE | scrub | |
| I2-F7 | No other clients' projects | DONE | | |
| I2-F8 | No RAID items with `clientVisible=false` | PARTIAL | The RAID list is filtered in SQL. **But** portal-serializer.ts:250-256 publishes APPROVED/SENT `STEERING` reports, and serializeReportForClient (:536-559) passes `contentJson` through with only name and key scrubbing | STEERING `topRisks` includes non-client-visible risks (lib/projects/management-reports.ts:321,375-377). STEERING and R2 include INTERNAL change requests (management-reports.ts:320; client-report.ts:211). |
| I2-AC1 | Raw JSON has no name, userId or avatar | DONE | portal-routes-invariant.test.ts:302 | |
| I2-AC2 | SQL-level exclusion | DONE | | Except report content (I2-F8). |
| I2-AC3 | Meklit's activity → "360Ground Team" | DONE | portal-routes-invariant.test.ts:319 | |
| I2-AC4 | Automated test: no `User.name` | DONE | portal-routes-invariant.test.ts:302-390 | See INV-4 for its limits. |
| I2-DoD1 | Dedicated serializer | DONE | | |
| I2-DoD2 | All `/api/portal/*` use it | DONE | | |
| I2-DoD3 | Endpoint sweep test | DONE | | |
| I2-DoD4 | SQL-level filtering for comments, attachments and RAID | DONE | | |
| I2-DoD5 | Code review checklist item | MISSING | `.github/` has only workflows | |
| I3-AC1 | "Awaiting Your Action" first, with live counters | DONE | app/portal/projects/[id]/page.tsx:96-117 | |
| I3-X1 | (C3/H4) Awaiting-action SLA from the obligation | DEVIATES | features/projects/services/portal-dashboard.ts:44 | Hard-coded `slaBusinessDays = 3`. Clients see "within SLA" or "breached" based on 3 days. |
| I3-AC2 | Gantt shows only team labels | PARTIAL | page.tsx:62-78 | Labels are correct, but it's a simplified bar list, not the C2 Gantt. |
| I3-AC3 | Delay table includes client-owned delays | DONE | page.tsx "Schedule Changes"; portal-pages.server.ts:158 | |
| I3-AC4 | Client comment → `isClientAuthor`, notifies the PM | DONE | app/api/portal/projects/[id]/activities/[activityId]/comments/route.ts:67,91-103 | |
| I3-AC5 | Reports can be viewed and downloaded | DONE | page.tsx:256-280 | The R2 email's PDF link points to the internal, login-required API (client-report.ts:369). |
| I3-DoD1 | Awaiting first | DONE | | |
| I3-DoD2 | Anonymised Gantt | PARTIAL | as AC2 | |
| I3-DoD3 | Honest delay table | DONE | | |
| I3-DoD4 | Comments read and write | DONE | | |
| I3-DoD5 | Report viewing | DONE | | |

## 13. Epic J — Reports & Charts (sub-agent trace; spot-checked)

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| J1-C01 | Portfolio RAG wall (RAG, %, SPI, slip) | PARTIAL | features/projects/components/charts/PortfolioChartsLibrary.tsx:66-85 | No SPI. Slip prop unused. |
| J1-C02 | Project Gantt | DONE | Epic D | |
| J1-C03 | SPI/CPI trend with 1.00 line | MISSING | | Also no data (B2-EVM). |
| J1-C04 | Planned vs actual S-curve | MISSING | | The portal PvA is a table. |
| J1-C05 | Milestone completion (stacked) | PARTIAL | ProjectChartsLibrary.tsx:56-58 | Plain bar. |
| J1-C06 | Delay by owner | PARTIAL | PortfolioChartsLibrary.tsx:87-101 | Not stacked or a donut. |
| J1-C07 | Delay reason donut | MISSING | | |
| J1-C08 | Individual performance trend | MISSING | | |
| J1-C09 | Client health gauge and trend | PARTIAL | PortfolioChartsLibrary.tsx:103-119 | No trend. Not a composite (3-day SLA). |
| J1-C10 | Sprint velocity | MISSING | | KPI number only. |
| J1-C11 | Capacity heatmap | MISSING | ChartWrapper.tsx:66-107 | `HeatmapGrid` is unused. |
| J1-C12 | Estimate scatter with 45° line | PARTIAL | ProjectChartsLibrary.tsx:97-109 | No 45° line. |
| J1-C13 | Idle days heatmap | MISSING | | |
| J1-C14 | Sprint burndown | MISSING | | |
| J1-C15 | Team completion distribution | MISSING | | |
| J1-C16 | Scrum attendance heatmap | PARTIAL | ScrumLogWidget.tsx:213-240 | |
| J1-C17 | Portfolio bubble | DONE | PortfolioChartsLibrary.tsx:121-140 | Null SPI is plotted as 0 outside the axes. |
| J1-C18 | Root-cause Pareto with cumulative % | DONE | PortfolioChartsLibrary.tsx:142-158; portfolio-dashboard.ts:204-227 | Input is inflated (C4-X1). |
| J1-C19 | Estimator bias box plot | MISSING | | |
| J1-C20 | Bench forecast | DEVIATES | portfolio-dashboard.ts:249-268 | **Made-up data:** a `Math.sin` wobble around 40h × activity count. |
| J1-C21 | Approval latency trend | MISSING | | |
| J1-C22 | Scope volatility | MISSING | | |
| J1-C23 | Cycle time histogram | MISSING | | |
| J1-C24 | Project completion ring (Image 9) | MISSING | features/projects/components/ProjectProgress.tsx:38-60 (`ring` variant unused) | |
| J1-DoD1 | All 24 charts | MISSING | | 3 done, 6 partial, 1 made-up, 14 missing. |
| J1-DoD2 | C24 matches Image 9 | MISSING | | |
| J1-DoD3 | C18 cumulative line | DONE | | |
| J1-DoD4 | PNG export | PARTIAL | ChartWrapper.tsx:30-38,109-143 | CSS-variable fills likely don't resolve in the exported SVG. |
| J1-DoD5 | Responsive and dark mode | PARTIAL | | C20 hard-codes `rgba` fills. |
| J2-SEC | 9 R2 sections | PARTIAL | lib/projects/client-report.ts:280-315 | PM name is hard-coded. "Days behind" is actually percentage points (:297). CRs are not visibility-filtered (:211). |
| J2-AC1 | Bi-weekly draft plus PM notified | DEVIATES | app/api/cron/client-report/route.ts; install-crontab.sh:117 | Weekly, over a semi-monthly period. The dedupe ignores SENT reports (client-report.ts:139), so the same period gets a duplicate draft. |
| J2-AC2 | ≤ 5 bullets and ≤ 800 chars, post-validated | DONE | client-report.ts:77-113,149-153; client-report.test.ts:11-32 | Deterministic template; no LLM. |
| J2-AC3 | Can't be sent without approval | PARTIAL | client-report.ts:327-350 | Send requires APPROVED. **But the summary can be edited after approval and even after SENT** (:318-325) without re-approval. |
| J2-AC4 | Edits set `aiSummaryEdited` | DONE | client-report.ts:323 | |
| J2-AC5 | Sent to `clientEmails` and shown in the portal | PARTIAL | client-report.ts:359-377 | The PDF link needs an internal login. The portal also shows APPROVED-but-unsent reports. Status is set to SENT before mail succeeds. |
| J2-AC6 | No employee names | PARTIAL | | The portal DTO is scrubbed; the internal PDF route renders the raw row. |
| J2-DoD5 | PDF and email | DONE | reports/[reportId]/pdf/route.ts; client-report.ts:410-448 | |
| J2-DoD6 | Shown in the portal | DONE | | |
| J3-SEC | 8 WBR sections | DONE | lib/projects/wbr-report.ts:19-51,208-227 | |
| J3-AC1 | Monday 06:00, CEO + PMs notified | DONE | app/api/cron/wbr-pack/route.ts; install-crontab.sh:119; wbr-report.ts:230-244 | EMPLOYEE-role PMs are notified but get a 403 on the page. |
| J3-AC2 | Red items have owner + recovery date, or are flagged | DONE | wbr-report.ts:169-184 | |
| J3-AC3 | "NO RECOVERY PLAN" in red | DONE | wbr-report.ts:248,260 | PDF only. |
| J3-DoD3 | Carry-forward | DONE | wbr-report.ts:80-93,187 | |
| J3-DoD4 | PDF | DONE | | |
| J4-DoD1a | R3 has all 15 fields | PARTIAL | lib/projects/performance-reports.ts:13-31,189-219 | Synthetic sprint window. Buffer is hard-coded at 20%. Counts are effectively all-time. |
| J4-DoD1b | R4 has all 12 fields | PARTIAL | performance-reports.ts:33-48,221-249 | "Team" is the project name. Velocity is an issue count. |
| J4-DoD2 | 4 cadences | PARTIAL | performance-reports.ts:66-85 | Cadence barely changes the numbers. |
| J4-AC2 | Hidden without Jira | DONE | performance-reports.ts:108-110 | |
| J4-AC3 | AI insight editable by the PM | DONE | performance-reports.ts:256-288 | Rule-based. Capped at 1000 chars. No approval step. |
| J4-AC4 | Exposed to the Performance module | PARTIAL | api/projects/[id]/performance-reports; lib/performance/project-performance-reports.ts (shim) | No metric-criterion source uses it. |
| J4-LOG | AiGenerationLog provider is accurate | DEVIATES | performance-reports.ts:149-160 | Logged as `openai` for deterministic output. |
| J5-R6 | Steering pack | DONE | lib/projects/management-reports.ts:25-64,315-402 | Leaks to the portal (I2-F8). |
| J5-R7 | COE report | DONE | management-reports.ts:66-84 | |
| J5-R9 | Estimation learning | DONE | management-reports.ts:86-102 | |
| J5-R10 | Capacity/bench | DONE | management-reports.ts:104-118,516-612 | |
| J5-DoD5 | PDF export | DONE | management-reports/[reportId]/pdf | |
| J5-LOG | AiGenerationLog provider is accurate | DEVIATES | management-reports.ts:207-218 | `openai` for deterministic output. |
| J6-USES | 4 allowed uses | DONE | lib/projects/ai-assistant.ts:26-31,341+ | Deterministic. |
| J6-FORBID | Forbidden uses blocked | DONE | ai-assistant.ts:34-38,145-147 | A thrown Error likely surfaces as a 500. |
| J6-DoD1 | All outputs capped | PARTIAL | ai-assistant.ts:112-137 | R3/R4 insights use a 1000-char cap. |
| J6-DoD2 | PM approval before external use | PARTIAL | AiAssistantPanel.tsx:31-33,112 | A label only. Copy works without approval. |
| J6-DoD3 | Reuses AiGenerationLog | DONE | ai-assistant.ts:164-176 | Provider is mislabelled (J4-LOG, J5-LOG). |
| J-R5 | R5 scrum attendance report | MISSING | | |

## 14. Epic K — OKR Integration & Portfolio (sub-agent trace; spot-checked)

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| K1-AC1 | Milestone 100% → KR updates → `recalcNodeAndAncestors` | DONE | rollup.ts:230-231,266-268; lib/projects/okr-bridge.ts:27-107 | Same transaction. KRs with target below start never progress (:61). Deleting a milestone doesn't recalculate its KR. |
| K1-AC2 | Delivery panel on the objective page (RAG, SPI, slip) | PARTIAL | app/dashboard/objectives/[id]/page.tsx:180; ObjectiveDeliveryPanel.tsx:57-77 | No slip days. SPI is always null (B2-EVM). |
| K1-AC3 | Projects as nodes on the alignment map | MISSING | lib/okr/alignment-map-data.ts; features/strategy-map/* | |
| K1-DoD1 | Milestone → KR link | PARTIAL | milestones/[milestoneId]/route.ts:19,34-43 | No KR existence or ownership check; any project writer can drive any KR. |
| K1-DoD2 | Project → Objective link | DONE | app/api/projects/[id]/route.ts:66,83-84 | |
| K1-DoD3 | Driven via existing functions | DONE | | |
| K1-DoD4 | Delivery panel | PARTIAL | as AC2 | |
| K1-DoD5 | No duplicated OKR logic | PARTIAL | okr-bridge.ts:54-74 | The KR value formula is re-implemented. |
| K2-Route | `/dashboard/projects/portfolio`, CEO-gated | DONE | app/dashboard/projects/portfolio/page.tsx:11-16; lib/projects/portfolio-access.ts:9-13 | DEPARTMENT_LEAD also sees the whole portfolio. |
| K2-AC1 | Every project with RAG, SPI, planned vs actual, owner split | PARTIAL | portfolio-dashboard.ts:128-157; PortfolioDashboard.tsx:64-104 | Owner split and RAG counts are computed but not rendered. |
| K2-AC2 | C18 across all projects | DONE | portfolio-dashboard.ts:204-227 | Unfiltered: includes archived and completed projects and ignores filters. |
| K2-AC3 | Client-owned % headline | DONE | portfolio-dashboard.ts:168; PortfolioDashboard.tsx:56-60 | Same unfiltered data. |
| K2-AC4 | Escalations: RED, failed gates, overdue payments | PARTIAL | portfolio-dashboard.ts:271-281 | RED (and AMBER over 10 days) only. |
| K2-C1 | RAG wall | PARTIAL | | No SPI. |
| K2-C17 | Bubble | PARTIAL | | Null SPI/CPI. |
| K2-C6 | Delay by owner | DONE | | |
| K2-C9 | Client health | DEVIATES | portfolio-dashboard.ts:229-247 | 3-day SLA, not obligation-based. |
| K2-C20 | Bench forecast | DEVIATES | portfolio-dashboard.ts:265 | Made-up data. |
| K2-DoD1 | Page with all charts | PARTIAL | | |
| K2-DoD2 | C18 across all projects | DONE | | |
| K2-DoD3 | Escalation logic | PARTIAL | | |
| K2-DoD4 | Filters by client, PM and date range | PARTIAL | PortfolioFilters.tsx:22-63 | No date-range UI. Filters don't scope the delay data. |
| K2-DoD5 | PDF board pack | PARTIAL | api/projects/portfolio/report/[reportId]/pdf | KPIs and tables; no charts. |
| K3-M1 | SPI/CPI trend | MISSING | lib/projects/portfolio-report.ts:20-54 | |
| K3-M2 | Delay attribution trend | MISSING | | `clientOwnedPct` is stored but never plotted. |
| K3-M3 | On-time delivery rate | MISSING | | |
| K3-M4 | Approval latency per client (C21) | MISSING | | |
| K3-M5 | Scope volatility (C22) | MISSING | | |
| K3-M6 | Estimation accuracy trend | MISSING | | |
| K3-M7 | Resource utilisation | MISSING | | |
| K3-M8 | Root-cause distribution | PARTIAL | portfolio-report.ts:35 | Stored, not rendered. |
| K3-AC1 | ≥ 2 completed projects → trends | MISSING | portfolio-dashboard.ts:74 | Completed projects are excluded. |
| K3-AC2 | "#1 systemic problem" answered | MISSING | | |
| K3-DoD1 | Cross-project aggregation | PARTIAL | | |
| K3-DoD2 | Trend charts | MISSING | | |
| K3-DoD3 | Exportable board pack | PARTIAL | | |

## 15. Part 5 — Permissions, Notifications, Cron

### 5.1 DocTypes & permission matrix (sub-agent trace; spot-checked)

**P5.1-X2:** `scripts/seed-project-permissions.ts` seeds the matrix, but no `/api/projects/**` route reads it. The only import from `lib/permissions` is `canCreateProject`. All enforcement is in `lib/projects/access.ts:22-55`:
- **Read:** ADMIN, EXECUTIVE, the PM, any project member, or any member of the project's department.
- **Write:** ADMIN, EXECUTIVE, the PM, or any DEPARTMENT_LEAD who can read the project.

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| P5.1-registry | 15 doctypes registered | DONE | scripts/seed-project-permissions.ts:25-42,217-223 | Adds `project_template`. |
| P5.1-sens-reg | Sensitive fields registered | DONE | seed:46-60 | |
| P5.1-sens-enf | Sensitive fields (L1/L2) enforced | MISSING | app/api/projects/[id]/route.ts:22-40 | Every reader, including EMPLOYEE, gets contractValue, activity costs and assigneeId. CR `costImpact`, payment `amount` and COE fields are readable too. The Jira token is correctly omitted. |
| P5.1-matrix | The matrix drives route guards | MISSING | | |
| P5.1-ADMIN | All | DONE | access.ts:30,50 | |
| P5.1-project-EXEC | R W E P | DEVIATES | | Can also create and archive. |
| P5.1-project-DL | R W C (own) | DEVIATES | access.ts:31-53 | Department-wide. |
| P5.1-project-EMP | R (assigned) | DEVIATES | access.ts:33-42 | Any department or project member can read. |
| P5.1-activity-EXEC | R | DEVIATES | | Has write access. |
| P5.1-activity-DL | R W C D (own) | DONE | | Broader scope. |
| P5.1-activity-EMP | R W (assigned only) | PARTIAL | activities/[activityId]/route.ts:60 | **An assignee cannot update their own activity.** |
| P5.1-delay-EXEC | R E | DEVIATES | delays/route.ts:35-37 | Can PATCH. |
| P5.1-delay-DL | R W C (own) | DONE | | |
| P5.1-delay-EMP | R | DONE | | |
| P5.1-cr-EXEC | R W | DONE | | |
| P5.1-cr-DL | R W C (own) | DONE | | Plus delete. |
| P5.1-cr-EMP | R | DONE | | `costImpact` not redacted. |
| P5.1-raid-EXEC | R | DEVIATES | | Has write access. |
| P5.1-raid-DL | R W C D (own) | DONE | | |
| P5.1-raid-EMP | R | DONE | | |
| P5.1-gate-EXEC | R W (waive) | DONE | | |
| P5.1-gate-DL | R W (own) | DEVIATES | stage-gates/[gateId]/route.ts:47-50 | Can also waive, create and delete. |
| P5.1-gate-EMP | R | DONE | | |
| P5.1-jira-EXEC | — | DEVIATES | jira/route.ts:24-26,59-61 | Has read and write. |
| P5.1-jira-DL | R W C (own) | DONE | | |
| P5.1-jira-EMP | — | DEVIATES | jira/route.ts:25 | Can read metadata (not the token). |
| P5.1-pay-EXEC | R W | DONE | | |
| P5.1-pay-DL | R | DEVIATES | payment-milestones/route.ts:41-43 | Has write access. |
| P5.1-pay-EMP | — | DEVIATES | payment-milestones/route.ts:18-20 | Can read, including `amount`. |
| P5.1-report-EXEC | R E | DEVIATES | | Can generate. |
| P5.1-report-DL | R W C (own) | DONE | | |
| P5.1-report-EMP | R (own performance only) | DEVIATES | reports/route.ts:16-26; performance-reports/route.ts:16-21 | Sees every report, including other people's R3 and R7. |

### 5.2 Notification events (22 keys defined: lib/notifications/events.ts:238-260)

**P5.2-X1** (I verified this by hand): `resolveRecipients` (lib/notifications/dispatcher.ts:66-76) adds `explicitRecipients` and then switches on the event key. There is **no case for any PROJECT-category event**, and `planEmit` returns early when the recipient set is empty (:361). So any project event emitted without `explicitRecipients` is silently dropped.

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| P5.2-PROJECT_CREATED | PM, CEO | MISSING | | Never emitted. |
| P5.2-BASELINE_COMMITTED | PM, CEO | DEVIATES | baseline/route.ts:54-59 | Emitted with no recipients, so dropped. |
| P5.2-REBASELINED | CEO | DEVIATES | rebaseline/route.ts:87-98 | Dropped. |
| P5.2-RAG_CHANGED | PM, CEO | DEVIATES | health.ts:107-111 | Dropped. |
| P5.2-WENT_RED | PM, CEO | DEVIATES | health.ts:112-117 | Dropped. |
| P5.2-APPROVAL_PENDING ⭐ | Client contact, PM | DEVIATES | delay-ledger.ts:237-251 | Dropped. |
| P5.2-APPROVAL_SLA_BREACH ⭐ | PM, CEO, Client at SLA, +3, +7 | DEVIATES | approval-escalations.ts:72-87; delay-ledger.ts:291-306 | Levels are correct; dropped. |
| P5.2-ACTIVITY_BLOCKED | PM | MISSING | activities/[activityId]/route.ts:142-144 | |
| P5.2-ACTIVITY_OVERDUE | Assignee + PM, daily | DEVIATES | lib/projects/project-digest.ts:291-298 | A count in the PM digest only. |
| P5.2-BASELINE_SLIPPED | PM | MISSING | | |
| P5.2-GATE_PENDING | PM | MISSING | | |
| P5.2-GATE_BYPASSED | CEO | MISSING | | |
| P5.2-CR_SUBMITTED | PM | MISSING | change-requests/route.ts:40-89 | |
| P5.2-CR_APPROVED | PM, team | PARTIAL | change-requests/[crId]/route.ts:114-121 | PM only. |
| P5.2-RAID_HIGH_RISK | PM, CEO | PARTIAL | raid/route.ts:103-112 | PM only. |
| P5.2-CLIENT_REPORT_READY | PM | DONE | reports/route.ts:52-59; cron/client-report | |
| P5.2-CLIENT_COMMENT_POSTED | PM | DONE | portal comments route:91-103 | |
| P5.2-JIRA_SYNC_FAILED | PM | MISSING | | |
| P5.2-PAYMENT_READY | Finance, CEO | DONE | activities/[activityId]/route.ts:190-210 | Finance recipients are guessed. |
| P5.2-COE_REQUIRED | PM, CEO | MISSING | | |
| P5.2-WBR_PACK_READY | CEO, PMs, weekly | DONE | wbr-report.ts:230-244 | |
| P5.2-SCRUM_NOT_LOGGED | PM, daily | MISSING | | |

### 5.3 Cron jobs
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| CRON-1 | jira-sync every 30 min | DONE | install-crontab.sh:121; app/api/cron/jira-sync/route.ts | |
| CRON-2 | project-health daily 02:00 | DONE | install-crontab.sh:113 (`0 2 * * *`) | The crontab is UTC, so this runs at 05:00 EAT. |
| CRON-3 | approval-clock daily 08:00 | DONE | install-crontab.sh:111 (`0 8 * * *`) | 11:00 EAT. Its notifications are dropped (P5.2-X1). |
| CRON-4 | client-report bi-weekly Mon 06:00 | DEVIATES | install-crontab.sh:117-118 (`0 3 * * 1`) | Weekly over a semi-monthly period. Duplicate-draft bug (J2-AC1). |
| CRON-5 | wbr-pack weekly Mon 06:00 | DONE | install-crontab.sh:119 | `0 3` UTC = 06:00 EAT. |
| CRON-6 | project-digest daily 07:00 | DONE | install-crontab.sh:115 (`0 7 * * *`) | 10:00 EAT. Times are converted to EAT for some jobs but not others. |
| CRON-7 | Bearer CRON_SECRET | DONE | `withCronAuth` in all 6 routes; lib/cron-auth.ts (fail-closed) | |

## 16. Part 6 — Global Definition of Done & Critical Invariants

### 6.2 Global Definition of Done
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| GD-API | withAuth, `{success, data, error}` envelope, Zod | DONE | All project and portal routes | |
| GD-PERM | DocType registered, permissions seeded, record scoping | PARTIAL | seed-project-permissions.ts; access.ts | Seeded but not enforced (P5.1-X2). |
| GD-AUDIT | `recordActivity()` on every mutation | PARTIAL | See INV-10 | |
| GD-TYPES | Shared types in `types/index.ts` | DEVIATES | features/projects/types.ts | lib/projects/{confidence,health,client-report,management-reports,performance-reports,portfolio-dashboard,ai-assistant,…}.ts import from `features/projects`, inverting the lib→feature layering. |
| GD-FORMS | react-hook-form | PARTIAL | CreateProjectWizard.tsx:5 | Dialogs use raw `useState`: RebaselineDialog.tsx:30, CommitBaselineDialog.tsx:26, GanttChart.tsx:232-235 (slip dialog), DelayLedgerTable edit state. |
| GD-MODAL | components/ui/Modal | DONE | | |
| GD-CONFIRM | ConfirmDialog, never `window.confirm` | DONE | project-remediation-guards.test.ts:22 | |
| GD-EMPTY | EmptyState | PARTIAL | DelayLedgerTable.tsx:212 | Not used for the blank Gantt (A1-AC5). |
| GD-STYLE | `cn()`, no hard-coded hex | PARTIAL | ActivityDetailPanel.tsx:280 (`'#007AFF'` colour-input default); PortfolioChartsLibrary.tsx:169-170 (`rgba`) | |
| GD-BARREL | `features/projects/index.ts` | DONE | | |
| GD-TESTS | Unit tests for rollup, EVM, delay ledger, scheduling | DONE | rollup/evm/delay-ledger/scheduling .test.ts | 431/431 pass. |
| GD-DOCS | MASTER_REFERENCE and CHANGELOG updated | DONE | docs/MASTER_REFERENCE.md:7 (2026-09-25) | The consolidated tracker is stale: it says 201 tests, and several Done claims are false (§C.1). |

### 6.3 The 10 Critical Invariants (spec §6.3 + CLAUDE.md)
Tests are classified as follows:
- **Behavioural:** executes code and asserts on its output.
- **Unit-behavioural:** a pure function only.
- **Source-regex:** reads source text and pattern-matches it.

| ID | Invariant | Status | Enforcement evidence | Enforcing test (kind) and gaps |
|---|---|---|---|---|
| INV-1 | Baseline dates immutable after commit; server 403 | DONE | `hasBaselineFieldWrite` → 403 at app/api/projects/[id]/route.ts:75, phases/[phaseId]:27, milestones/[milestoneId]:30, activities/[activityId]:70. The only writers are baseline.ts:106-126 (commit and re-baseline). Other schedule writers strip the fields through Zod (activities/schedule/route.ts:12-22). Schedule import is refused once baselined (schedule-import/route.ts:18). | baseline.test.ts:54-79. **Unit-behavioural, on the predicate only.** No test drives a route with a baseline key; the wiring is untested. The "403 everywhere" contract is not uniform (C1-AC3). |
| INV-2 | No baselined date change without reason + owner; bar reverts | DONE | activities/[activityId]/route.ts:96-99; activities/schedule/route.ts:47-49 (403); GanttChart.tsx:462-470,1124-1174 | portal-route-guards.test.ts:83-94. **Source-regex:** both routes declare `z.enum(SLIP_REASONS)`, plus a unit check that blanks are rejected. No behavioural test of the 403. The UI gap: Table date edits have no dialog and always 403 (C4-AC1). Cascades double-count (C4-X1). |
| INV-3 | Approval clock automatic; business days; DelayEvent | PARTIAL | applyApprovalClock is called on every status PATCH (activities/[activityId]/route.ts:160-162); delay-ledger.ts:191-322 | delay-ledger.test.ts:98-170 and business-days.test.ts. **Unit-behavioural** on `decideApprovalClockTransition`; the DB path of `applyApprovalClock` is untested. Gaps: statuses derived by rollup bypass the clock (B1-X1); no holiday calendar (C3-R1); pending and escalation notifications reach nobody (P5.2-X1); the UI and portal use a hard-coded 3-day SLA. |
| INV-4 | No employee name, id or avatar reaches the portal; single serializer; automated test | DONE | features/projects/services/portal-serializer.ts (`serialize*ForClient`, `scrubPortalPayload`, `loadPortalForbiddenNames`) | portal-routes-invariant.test.ts:302-390. **Behavioural, route-level:** runs all 9 `/api/portal/*` route modules against a poisoned in-memory Prisma and sweeps bodies and headers for every name token, email, id and cost key. Plus portal-serializer.test.ts (unit) and portal-route-guards.test.ts:51-81 (source-regex for pages and serializer calls). Limits: `app/portal/*` server pages are only regex-checked. The R2 PDF branch isn't executed. Report `contentJson` is hand-seeded, so real generator output isn't swept. |
| INV-5 | Internal comments and attachments filtered in SQL; INTERNAL is the default | PARTIAL | activityCommentWhere, portalActivityAttachmentWhere, portalRaidItemWhere, portalChangeRequestWhere (all in the query) | activity-comments.test.ts:5-13 (unit, on helper output); portal-routes-invariant.test.ts (behavioural; the fake Prisma evaluates `visibility`/`clientVisible`); :408 (source-regex for CR reads). **Gap:** report `contentJson` bypasses row-level filtering. STEERING exposes non-client-visible risks and INTERNAL CRs, and R2 exposes INTERNAL CRs (I2-F8). |
| INV-6 | AI capped (≤ 5 bullets, ≤ 800 chars), post-validated, PM-approved, never auto-sent, AiGenerationLog | PARTIAL | validateAiSummary / enforceSummaryCaps (client-report.ts:77-113); validateAssistantOutput (ai-assistant.ts:112-137); send requires APPROVED (client-report.ts:350) | client-report.test.ts:11-32 and ai-assistant.test.ts:82-161. **Unit-behavioural** on the caps; **the send gate is untested.** Gaps: the summary is editable after approval and after SENT (J2-AC3); R3/R4 use a 1000-char cap with no approval; the assistant's "approval" is a label only; AiGenerationLog says `openai` for deterministic output. No LLM is called anywhere in the module's "AI" paths. |
| INV-7 | Jira read-only; token AES-256 at rest and never returned | PARTIAL | GET only (sync.ts:309; connection.ts:134); jira-crypto.ts (AES-256-GCM); `serializeJiraConnection` omits the token | jira-crypto.test.ts:13-51 and jira-connection.test.ts:24 (unit-behavioural). There is no GET-only test. **Gap:** Test Connection with a blank token sends the decrypted stored token to a caller-supplied host (G1-DoD2). |
| INV-8 | Works fully without Jira | DONE | No Jira in the project page load; Jira UI isolated (ProjectDeliveryControlCenter.tsx:155,162); R3/R4 hidden without Jira | **No dedicated test.** |
| INV-9 | Rollup in the same transaction as the mutation | DONE | recalcProjectRollup(tx) in activities, activities/schedule, phases, milestones, reorder, schedule-import, change-requests.ts:106, jira sync.ts:186 and creation-commit.ts | **No test** of the transactional coupling (rollup.test.ts is pure math). The rollup never derives phase dates (B2-PLANNED). |
| INV-10 | Every mutation writes ActivityLog | PARTIAL | Most routes call `recordActivity` after commit (best-effort unless `required:true`) | portal-route-guards.test.ts:96-106. **Source-regex over 4 files only;** there's no audit-coverage test like the one the Performance module has. **Unaudited mutations:** POST jira/sync, management-reports, performance-reports, portfolio/report and portfolio/wbr; the cron writers (client-report drafts, WBR, project-health RAG/confidence, approval escalation level, Jira auto-rollup %); and the parent, milestone and phase status changes the rollup derives. |

---

## 17. Supplementary sources (sub-agent trace; spot-checked)

### C.1 Consolidated implementation tracker (`docs/PM_TOOL_CONSOLIDATED_IMPLEMENTATION_TRACKER.md`)
⚠ marks a row where the tracker's claimed status is wrong.

| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| CT-ARCH-1 | Full-screen workspace; legacy redirect | DONE | app/projects/[id]/page.tsx:7-11; app/dashboard/projects/[id]/page.tsx:9 | The redirect drops the query string. |
| CT-ARCH-2 | Compact header and rail | PARTIAL | ProjectWorkspaceClient.tsx:101-190 | |
| CT-ARCH-3 | Keep governance and integration modules | DONE | ProjectDeliveryControlCenter.tsx:29-31,96-190 | |
| CT-ARCH-4 | Six views | DONE | ProjectViewSwitcher.tsx:120-127 | |
| CT-ARCH-5 | Persist view and favourites | PARTIAL | project-view-store.ts:26-55 | No options menu. |
| CT-ARCH-6 | Trial and upgrade | MISSING | | |
| CT-HDR-1 | Inline name editing | DONE | ProjectWorkspaceClient.tsx:93-141 | |
| CT-HDR-2 | Control center | DONE | | |
| CT-HDR-3 | Health and filter chips | PARTIAL | ProjectWorkspaceClient.tsx:156-183 | The reference date is cosmetic. |
| CT-HDR-4 ⚠ | Invite and member management (tracker: Done) | PARTIAL | app/api/projects/[id]/members/route.ts:14-39 | No email invite. Membership doesn't give edit rights. |
| CT-HDR-5 | Read-only enforcement | PARTIAL | access.ts:46-54; schedule-grid.tsx:224-229 | Disabled create rows are still visible. |
| CT-SV-1 | Gantt split and hierarchy (tracker: Partial) | DONE | GanttChart.tsx:333-338,960-1104 | |
| CT-SV-2 | Drag, resize, reorder, zoom, dependencies | PARTIAL | | |
| CT-SV-3 ⚠ | Critical path, baseline, minimap and sync | PARTIAL | ProjectWorkspaceClient.tsx:186 | "In sync" is static text. The version select is a no-op. |
| CT-SV-4 | Table fills the content area | DONE | | |
| CT-SV-5 ⚠ | Table columns, sort, inline edit (tracker claims bulk selection) | PARTIAL | ProjectViewSwitcher.tsx:129-147 | No bulk, no sorting. Baselined dates 403. |
| CT-SV-6 | Board | PARTIAL | ProjectViewSwitcher.tsx:500-608 | Cards show a literal "Assigned". No keyboard drag. |
| CT-SV-7 | Workload | PARTIAL | :610-689 | |
| CT-SV-8 | Mindmap | PARTIAL | ProjectHierarchyMap.tsx | |
| CT-SV-9 | Overview | PARTIAL | :691-793 | |
| CT-TM-1 | Task detail panel | DONE | ActivityDetailPanel.tsx:239-468 | No tags. |
| CT-TM-2 ⚠ | Subtasks, tags, comments, files (tracker: tags exist) | PARTIAL | | Tags have no write path. |
| CT-TM-3 ⚠ | Blockers, predecessors, successors, type, lag (tracker: Done) | PARTIAL | ActivityDetailPanel.tsx:497-515 | Lag can't be entered. No successor add. |
| CT-TM-4 ⚠ | Multi-select and bulk status (tracker: Done) | MISSING | No bulk or selection code exists | |
| CT-TM-5 | Duplicate; free-edit mode | PARTIAL | GanttChart.tsx:523-538 | |
| CT-TM-6 | Undo history (20 actions) | MISSING | | Single-step date undo only. |
| CT-IE-1 | CSV/XLSX import and templates | DONE | ScheduleImportModal.tsx:79-98 | |
| CT-IE-2 | CSV/PNG/PDF/XML export | DONE | gantt/export/route.ts | No XLSX. |
| CT-IE-3 | Baseline commit, re-baseline, diff and overlay | PARTIAL | | Snapshots are never read; the version select is cosmetic. |
| CT-IE-4 | Public snapshots | PARTIAL | snapshots/route.ts | No config modal and no `noindex`. The id is a cuid. Exposes the project name, client name, phase and activity titles and % only; no names or comments. |
| CT-IE-5 | Custom fields and status configuration | MISSING | | |
| CT-NFR-1 | 500-task rendering | PARTIAL | | Gantt only; unmeasured. |
| CT-NFR-2 ⚠ | Optimistic edits and sync feedback | PARTIAL | useProject.ts (no `onMutate`) | The sync label is static. |
| CT-NFR-3 | Accessibility | PARTIAL | | |
| CT-NFR-4 | Localisation | MISSING | | |
| CT-NFR-5 | Attachment malware scanning | MISSING | activities/[activityId]/attachments/route.ts:50 | ClamAV already exists in creation-upload-security.ts:310 and could be reused. |
| CT-NFR-6 | Realtime and offline | MISSING | | |

### C.2 Workspace optimisation (`docs/project_workspace_optimization_requirements.md`)
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| WO-3.1-1 | Header shows identity, status, health, client and timeline | PARTIAL | ProjectWorkspaceClient.tsx:118-164 | No status or timeline. |
| WO-3.1-2 | Tabs and schedule come before registers | DONE | | |
| WO-3.1-3 | Health and OKR don't dominate | DONE | | |
| WO-3.1-4 | Stored view is the default | DONE | | |
| WO-3.2-1 | Phase = section, Milestone = subsection | DONE | schedule-grid.tsx:515-598 | |
| WO-3.2-2 | Activities plus one-level subtasks | DONE | | |
| WO-3.2-3 | Sections distinct and collapsible, with dates and % | DONE | | |
| WO-3.2-4 | Rows align with the timeline | DONE | | |
| WO-3.2-5 | Task column: indent, status affordance, handle | PARTIAL | schedule-grid.tsx:253-266 | No status affordance. |
| WO-3.3-1 | New task | DONE | GanttChart.tsx:791-793 | |
| WO-3.3-2 | New section creates a Phase | PARTIAL | GanttChart.tsx:565-567 vs 587-590 | The toolbar path adds no "General" milestone; the other paths do. |
| WO-3.3-3 | Task needs a Phase and Milestone; auto "General" | DONE | lib/projects/schedule-creation.ts:17-41 | |
| WO-3.3-4 | Contextual add actions | DONE | schedule-grid.tsx:321-325 | |
| WO-3.3-5 | Existing APIs and invalidation | DONE | | |
| WO-3.4-1 | Reorder all levels | DONE | GanttChart.tsx:592-646 | |
| WO-3.4-2 | Same parent only; no silent re-parenting | DEVIATES | GanttChart.tsx:618-627; activities/[activityId]/route.ts:136-141 | A cross-milestone drop re-parents silently. A moved parent **orphans its subtasks**, which vanish from the views. |
| WO-3.4-3 | Only in natural sort with no search or grouping | DEVIATES | GanttChart.tsx:351,632-639 | Reordering under automatic sort persists the date order. Filters don't disable reordering. |
| WO-3.4-4 | Drag handle only | DONE | | |
| WO-3.4-5 | Pointer and keyboard, labels, live feedback | PARTIAL | GanttChart.tsx:247-250,1019 | Screen-reader announcements read raw ids. |
| WO-3.4-6 | One transaction, contiguous renumbering | DONE | schedule/reorder/route.ts:42-49 | |
| WO-3.4-7 | Order-only changes | DONE | | |
| WO-4.1 | @dnd-kit | DONE | package.json:51-53 | |
| WO-4.2 | Reorder API contract | DONE | schedule/reorder/route.ts; schedule-order.ts; schedule-order.test.ts | |
| WO-5-1 | No migration | DONE | | |
| WO-5-2 | Reorder allowed once baselined | DONE | | |
| WO-5-3 | Date drag still gated | PARTIAL | | Table bypass (C4-AC1). |
| WO-5-4 | Alternative sort never persisted | DEVIATES | as 3.4-3 | |
| WO-5-5 | Read-only users see no handles or create actions | PARTIAL | schedule-grid.tsx:224-229 | |
| WO-5-6 | Server order restored on failure, plus toast | DONE | useProject.ts:861 | Unhandled rejection in `handleReorder`. |
| WO-AC1 | Workspace-first landing | DONE | | |
| WO-AC2 | Collapsible sections | DONE | | |
| WO-AC3 | Create from the Gantt | DONE | | |
| WO-AC4 | Order persists | DONE | | |
| WO-AC5 | Keyboard reorder | PARTIAL | | |
| WO-AC6 | Search or sort disables reorder, with an explanation | PARTIAL | schedule-grid.tsx:260 | Sort doesn't disable it. |
| WO-AC7 | No regressions | PARTIAL | | The Table baselined-date regression. |
| WO-AC8 | TypeScript, tests and build pass | PARTIAL | 431/431 tests | TypeScript and build not run. |

### C.3 Delivery Views clone spec (`../docs/DELIVERY_VIEWS_CLONE_SPEC.md` §16, §19, §21)
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| DV-21.S1 | 6 tabs, icons, underline | DONE | ProjectViewSwitcher.tsx:120-127,222 | |
| DV-21.S2 | Favourites persisted | DONE | | |
| DV-21.S3 | Header filters apply to all views | DONE | | |
| DV-21.S4 | Search plus tinted status on non-Gantt views | PARTIAL | :228-246 | A status filter applies invisibly to the Gantt. |
| DV-21.S5 | Project switch clears filters | DONE | | |
| DV-21.S6 | `?activity` deep link | DONE | | |
| DV-21.G1 | Virtualized, 1000 rows at 60fps | PARTIAL | | Unmeasured. |
| DV-21.G2 | 5 scales, zoom 45–180% | DONE | | |
| DV-21.G3 | Display toggles persist | DONE | | |
| DV-21.G4 | Phase bracket, diamond, status bars | DONE | | |
| DV-21.G5 | Conditional ghost bars | DONE | | |
| DV-21.G6 | Drag tooltip, successor preview, resize | DONE | | |
| DV-21.G7 | Slip dialog; cancel persists nothing | DONE | | Gantt only. |
| DV-21.G8 | Reason picks the owner | DONE | | |
| DV-21.G9 | Dependency routes; click to delete | DONE | | |
| DV-21.G10 | Cycle rejected | DONE | | |
| DV-21.G11 | Critical path plus strip | DONE | | |
| DV-21.G12 | Reorder rules | PARTIAL | | Orphaned subtasks; filters don't disable. |
| DV-21.G13 | Export file naming | DONE | | |
| DV-21.G14 | Layout persistence | DONE | | |
| DV-21.T1 | 17 table columns | DONE | | |
| DV-21.T2 | Inline edits save | PARTIAL | | Baselined dates 403. |
| DV-21.T3 | Footer count; Add section | DONE | | |
| DV-21.T4 | Shared task-column width | DONE | | |
| DV-21.B1–B4 | Board behaviours | DONE | | These are the clone spec's (phase-column) board; see E1-V3 for the BUILD_SPEC conflict. |
| DV-21.W1–W5 | Workload behaviours | DONE | | |
| DV-21.M1–M5 | Mindmap behaviours | DONE | | |
| DV-21.O1–O3 | Overview KPIs, timeline, registers | DONE | | |
| DV-21.O4 | 8 charts, empty sentence, PNG | PARTIAL | ProjectChartsLibrary.tsx:88-111 | Empty charts are hidden instead of showing a sentence. |
| DV-21.O5 | Resource status pill | DONE | | |
| DV-21.SV1 | Baseline write and missing slip → 403 | DONE | | |
| DV-21.SV2 | Parent % and inverted dates → 400 | DONE | | |
| DV-21.SV3 | Stage gate 409 plus override | DONE | | |
| DV-21.SV4 | Reorder rejects partial permutations | DONE | | |
| DV-21.SV5 | Rollup and audit on every mutation | PARTIAL | | See INV-10. |
| DV-16.1 | Baseline immutable | DONE | | See INV-1. |
| DV-16.2 | Slip gate | DONE | | See INV-2. |
| DV-16.3–8 | Clock, anonymisation, SQL visibility, AI cap, Jira read-only, Jira-optional | PARTIAL | | See INV-3 to INV-8 (#3, #5, #6 and #7 are PARTIAL). |
| DV-16.9 | Rollup in the same transaction | DONE | | |
| DV-16.10 | Every mutation audited | PARTIAL | | |
| DV-19 | 9 persistence keys | DONE | | |
| DV-19-H | Hydration guards | PARTIAL | GanttChart.tsx:264,286-300 | Unguarded `JSON.parse` of localStorage, so a corrupt value crashes the Gantt. |

### C.4 Consolidated requirements (`../docs/PM_Tool_Consolidated_Requirements.md`, one row per subsection)
| ID | Requirement (short) | Status | Evidence | Gap / note |
|---|---|---|---|---|
| CR-1.1 | Title bar | PARTIAL | ProjectWorkspaceClient.tsx | No "completed" health; trial not built. |
| CR-2 | Tabs | PARTIAL | | Overflow menu is minimal. |
| CR-3.1 | Gantt toolbar | PARTIAL | | No Columns menu or sync; single-step undo. |
| CR-3.2 | Task list | PARTIAL | GanttChart.tsx:182 | Fixed columns; no row #. |
| CR-3.3 | Chart panel | PARTIAL | | Minimap not clickable. |
| CR-4.1 | Table toolbar | MISSING | | |
| CR-4.2 | Table columns | PARTIAL | | |
| CR-5.1 | Board toolbar | MISSING | | |
| CR-5.2 | Board layout | PARTIAL | | |
| CR-6.1 | Workload toolbar | MISSING | | |
| CR-6.2 | Member list | PARTIAL | | |
| CR-6.3 | Workload timeline | PARTIAL | | |
| CR-7.1 | Mindmap toolbar | PARTIAL | | |
| CR-7.2 | Mindmap canvas | PARTIAL | | |
| CR-8.1 | Overview toolbar | MISSING | | |
| CR-8.2 | Timeline | PARTIAL | | |
| CR-8.3 | Progress widget | PARTIAL | | No current-vs-expected curve. |
| CR-8.4 | Resources table | PARTIAL | | |
| CR-9.1 | Segments | DEVIATES | schedule-grid.tsx:775-788 | Re-sorts with no group headers. |
| CR-10.1 | Task model | PARTIAL | | |
| CR-10.2 | Section model | DONE | | |
| CR-10.3 | Task creation | PARTIAL | | |
| CR-10.4 | Task editing | PARTIAL | | Cross-section move orphans subtasks. |
| CR-10.5 | Subtasks | PARTIAL | | |
| CR-10.6 | Deletion | PARTIAL | | Deleting a parent silently promotes its subtasks. |
| CR-11.1 | Panel behaviour | DONE | | |
| CR-11.2 | Panel header | PARTIAL | | |
| CR-11.3 | Assignee and dates | DONE | | |
| CR-11.4 | Progress | DONE | | |
| CR-11.5 | Metrics grid | DONE | | |
| CR-11.6 | Subtasks section | PARTIAL | | |
| CR-11.7 | Details | PARTIAL | | No tags; plain-text description. |
| CR-11.8 | Comments and mentions | PARTIAL | ActivityDetailPanel.tsx:644 | Mentions list all org users. |
| CR-12.1 | Dependency types | DONE | | |
| CR-12.2 | Creating dependencies | PARTIAL | | |
| CR-12.3 | Dependency visualisation | PARTIAL | | |
| CR-12.4 | "Keep lag" option | DEVIATES | activities/schedule/route.ts:58 | Always shifts. |
| CR-12.5 | Removing dependencies | DONE | | |
| CR-13.1 | Critical path | PARTIAL | | |
| CR-13.2 | Free-edit mode | MISSING | | |
| CR-13.3 | Multi-select | MISSING | | |
| CR-13.4 | Duplicate project | MISSING | | |
| CR-13.5 | Import CSV | DONE | | |
| CR-14.1 | Export & Share | PARTIAL | | Gantt only; no XLSX. |
| CR-14.2 | Snapshot modal | MISSING | | |
| CR-15 | Baselines (list, create, load) | DEVIATES | | Single governed baseline with versions. No named list or load. The version select is cosmetic. |
| CR-16.1 | Columns dropdown | MISSING | | |
| CR-16.2 | Custom fields | MISSING | | |
| CR-16.3 | Status column configuration | MISSING | | |
| CR-17.1 | Options menu | PARTIAL | | |
| CR-18.1 | Status values | DONE | features/projects/types.ts:62-69 | |
| CR-18.2 | Status UI | DONE | | |
| CR-18.3 | Status filtering | PARTIAL | | Single-select; invisible on the Gantt. |
| CR-18.4 | Status configuration | MISSING | | |
| CR-19.1 | Roles | DEVIATES | | Org roles plus PM; members can't edit. |
| CR-19.2 | Invites | PARTIAL | | |
| CR-19.3 | Assignees | PARTIAL | | All org users, not project members. |
| CR-19.4 | @Mentions | PARTIAL | | |
| CR-19.5 | Public snapshots | DONE | | |
| CR-20.1 | Performance | PARTIAL | | Unmeasured. |
| CR-20.2 | Browser support | PARTIAL | | Can't be verified statically; there's no browser matrix or test. |
| CR-20.3 | Realtime | MISSING | | The static "In sync" label is misleading. |
| CR-20.4 | Persistence | PARTIAL | | |
| CR-20.5 | Accessibility | PARTIAL | | |
| CR-20.6 | Security | PARTIAL | | No attachment AV scan. |
| CR-20.7 | Trial | MISSING | | |
| CR-20.8 | Localisation | MISSING | | |

---

## Gaps to fix (prioritised)

Severity: **High** = a spec invariant, data integrity, security, or a ⭐ requirement is broken · **Med** = a spec AC is unmet, or a user-visible wrong result · **Low** = polish or parity.
Effort: **S** ≤ ½ day · **M** 1–3 days · **L** > 3 days.

| # | Gap | Rows | Severity | Effort |
|---|---|---|---|---|
| 1 | **Project notifications reach nobody.** Add PROJECT routing in `lib/notifications/dispatcher.ts` (PM = `project.projectManagerId`, CEO = `organizationSettings.companyCeoUserId`, or EXECUTIVE), or pass `explicitRecipients` at the 6 emit sites. The ⭐ approval-clock pending and SLA escalations are silent today. | P5.2-X1, C3-FN2, C3-R3, B2-AC2, C2-DoD4 | High | S |
| 2 | **Internal content leaks to the portal via reports.** Filter `topRisks` with `clientVisible` and CRs with `visibility: CLIENT_VISIBLE` in STEERING and R2 generation (management-reports.ts:320-321; client-report.ts:211), or build a client-safe DTO in `serializeReportForClient`. Add a route test that seeds generator output rather than hand-made JSON. | I2-F8, INV-5, H2-AC3, J5-R6 | High | S |
| 3 | **Jira token exfiltration.** Test Connection re-uses the stored token against a caller-supplied host. Require the stored `siteUrl` whenever the token is blank, or add a host allow-list. | G1-DoD2, INV-7 | High | S |
| 4 | **`percentPlanned` is always 0.** Derive `Phase.currentStart/End` from the min/max of child activities inside `recalcProjectRollup` (and milestone `currentDate`) before the baseline copies them. Backfill existing projects, re-baselining only those that have no phase baselines. | B2-PLANNED, E1-AC4, INV-9 note | High | M |
| 5 | **EVM is dead.** SPI, CPI and EAC are always null. Add `budgetAtCompletion` and `actualCost` to the project PATCH and settings UI (or derive them from Σ activity cost). Until then, C1, C3, C17, portfolio SPI, WBR and K3 all show nothing. | B2-EVM, DM-Project, J1-C03, K2-C1/C17 | High | M |
| 6 | **Delay ledger double-counts cascades.** Record the slip only on the dragged activity (or tag cascaded events and exclude them from totals and Pareto). Normalise the units (business vs calendar days). | C4-X1, J1-C18, K2-AC2/AC3 | High | S |
| 7 | **Variance vs v1 is lost after a re-baseline.** Read `BaselineSnapshot` for the selected version in the ledger, Planned-vs-Actual, R2, export and the ghost bars, with v1 as the default for client reports. Wire up (or remove) the cosmetic Gantt version select. | C2-AC3, C2-DoD2, D4-T2 | High | M |
| 8 | **Permission matrix and sensitive fields aren't enforced.** EMPLOYEE reads costs, payments and COEs; EXECUTIVE writes everything; DEPARTMENT_LEAD waives gates; **assignees can't update their own activity.** Either enforce §5.1 via `lib/rbac.ts`/`lib/permissions.ts` or amend the spec. | P5.1-X2, P5.1-sens-enf, P5.1-activity-EMP | High | M–L |
| 9 | **Cross-milestone drag orphans subtasks and re-parents silently.** Move subtasks with their parent (or block the move), and restrict drag to same-parent as the spec requires. | WO-3.4-2, CR-10.4 | High | S |
| 10 | **The approval clock can be bypassed through rollup-derived parent status.** Either don't derive `status` for activities that own the clock, or run `applyApprovalClock` for derived transitions. | B1-X1, INV-3 | Med | S |
| 11 | **SLA hard-coded to 3 days** in the activity panel, the portal "Awaiting" cards and portfolio C9. Use the project's APPROVAL obligation SLA. | C3-DoD7, F1-AC2, I3-X1, H4-AC3 | Med | S |
| 12 | **Table date edits on baselined projects always 403.** Route them through the Gantt's slip dialog (`requestScheduleChange`). | C4-AC1, E1-V2, WO-5-3 | Med | S |
| 13 | **Board is phase-based.** The spec's status Board, where a drag is a status transition (⭐ clock), is missing. Add a group-by-status mode. | E1-V3, E1-AC2, E1-DoD3 | Med | M |
| 14 | **Jira: no backfill, and `/rest/api/3/search` is deprecated.** Add a full first sync and backfill, move to `/search/jql`, honour `Retry-After`, and verify against live Jira Cloud. | G2-INC, G2-EP, G2-RL | Med | S–M |
| 15 | **R2 defects.** Summary editable after approval/SENT (re-gate it); duplicate draft after SENT; "days behind" is percentage points; the emailed PDF link needs an internal login; SENT is set before mail succeeds. | J2-AC1/AC3/AC5, J2-SEC, INV-6 | Med | S |
| 16 | **Audit gaps.** Add `recordActivity` to report generation, manual Jira sync and the cron writers. Add an audit-coverage test modelled on `app/api/performance/audit-coverage.test.ts`. | INV-10, GD-AUDIT | Med | S |
| 17 | **Missing notification emits.** PROJECT_CREATED, ACTIVITY_BLOCKED, BASELINE_SLIPPED, STAGE_GATE_PENDING/BYPASSED, CHANGE_REQUEST_SUBMITTED, JIRA_SYNC_FAILED, COE_REQUIRED and SCRUM_NOT_LOGGED. | P5.2-* | Med | M |
| 18 | **Performance module isn't fed** by Jira metrics, R3/R4 or ScrumLog, so Issue #9 is unresolved. | ARCH-2.2-Perf, G4-DoD4b, G6-DoD4, J4-AC4 | Med | M |
| 19 | **Missing charts.** 14 of 24 are missing, including C24 (the Image 9 ring), C3, C4, C7, C11, C13, C19, C21 and C22. C20 shows made-up `Math.sin` data and should be removed or computed. | J1-*, K2-C20, E1-V6 | Med | L |
| 20 | **K3 cross-project report is essentially unbuilt:** no trends and no "#1 systemic problem" answer. Portfolio escalations also lack gates, payments and COEs. | K3-*, K2-AC4, H5-AC4, H6-AC2 | Med | L |
| 21 | **Critical path isn't CPM, and successor shift re-aligns instead of shifting by the delta.** | D4-AC2, D3-I5 | Med | M |
| 22 | **Gantt parity gaps:** Columns menu, Segments grouping, Date/Name/Status/Priority sort, status legend, clickable minimap and multi-level undo. | D1-S2, D4-T4/T5/T9, D1-S11, CT-TM-6 | Med | M–L |
| 23 | **No UI for tags or weights,** and the weight-mismatch warning is dead code. Tags are also falsely listed as existing in the tracker. | B1-F3/F4, B1-H2, CT-TM-2 | Med | S–M |
| 24 | **Multi-select and bulk edit are missing** (tracker claims Done). | CT-TM-4, E1-V2, CR-13.3 | Med | M |
| 25 | **Holiday calendar isn't configured** for the approval clock or idle days. Reuse `ScrumSettings.holidays`. | C3-R1, G4-AC4 | Low | S |
| 26 | **Project code generation isn't concurrency-safe** and sorts lexically. Retry on P2002, or use a sequence. | A1-DoD3 | Low | S |
| 27 | **Unguarded localStorage `JSON.parse` in the Gantt** (a corrupt value crashes the view). | DV-19-H | Low | S |
| 28 | **Custom bar colour saved but not rendered;** static "In sync" label; portal owner label says "360Ground" instead of "360Ground Team". | F1-H5, CT-NFR-2, I2-S2 | Low | S |
| 29 | **Correct the stale tracker rows** in `PM_TOOL_CONSOLIDATED_IMPLEMENTATION_TRACKER.md` (⚠ in §C.1). | §C.1 | Low | S |
| 30 | **Attachment malware scanning:** reuse the ClamAV path from creation uploads. | CT-NFR-5 | Low | S–M |
