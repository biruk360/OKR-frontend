# Feature & Module Status

> **Purpose:** Track what's built, what's in progress, and what's planned. AI checks this before starting work. Updated after every feature change.

## Legend

- **DONE** — Feature is complete and in production
- **IN PROGRESS** — Actively being worked on
- **PLANNED** — Scoped but not started
- **NEEDS REFACTOR** — Works but has known duplication/issues

---

## Core Features

| Feature | Status | Path | Key Exports | Notes |
|---------|--------|------|-------------|-------|
| Daily Trip Plan (DTP) — web Phase 1 | IN PROGRESS | `features/daily-trip-plan/`, `lib/dtp/`, `app/api/dtp/`, `app/dashboard/travel/` | `PlanEditor`, `CoordinatorConsole`, `MovementSheetView`, `RunSheetView`, `PoolConsole`, `TravelSettingsForm`, `dtpApi` | Web slice of spec `docs/Daily_Trip_Plan_Requirements_v1.0.md`. Phase-2 stubs: Distance Matrix (10-min placeholder), VRP optimizer (no suggestions), Flutter mobile, SMS/Telegram, server-PDF, KR linkage UI. |
| Project Management & Delivery Intelligence | IN PROGRESS | `features/projects/`, `lib/projects/`, `app/api/projects/`, `app/dashboard/projects/`, `app/portal/` | `ProjectViewSwitcher`, `GanttChart`, `DelayLedgerTable`, `ChartWrapper`, `ProjectChartsLibrary`, `ClientReportsPanel`, `PortfolioWbrPanel`, `PortfolioDashboard`, `PortfolioChartsLibrary`, `PortfolioReportPanel`, `PerformanceReportsPanel`, `ManagementReportsPanel`, `AiAssistantPanel`, `ProjectObjectiveLinker`, `MilestoneKeyResultLinker`, `ObjectiveDeliveryPanel`, `TemplateListClient`, `TemplateBuilderClient`, `NewProjectEntry`, `CreationDraftShell`, `CreateProjectWizard`, `ImportTemplateDownloads`, `ImportUploadStep`, `ColumnMappingStep`, `ValidationReportPanel`, `DraftReviewWorkspace`, `ChangeListPanel`, `CommitConfirmDialog` | Existing P1-P8 module and all 6 PM crons remain complete. Project Creation v1.1 P1 is complete. P2 Stories 2.1–2.4 provide secure retained uploads, optional OpenAI mapping, cleanup decisions, and ordered DOCX extraction. The Manual modal now has repaired responsive progress controls and type-first template selection for Website, Web Portal, Data Platform, Mobile App, Banking App, ICT Equipment Supply, and Import. Templates carry explicit type links; seven linked system schedules plus three general schedules are seeded on deployment and custom links are managed in the template directory/builder. AC7, AC10, AC11, and AC13 are complete; AC5 awaits Story 2.5 and AC12 awaits Story 2.6. |
| Daily Scrum — P0 foundation | IN PROGRESS | `features/scrum/`, `app/dashboard/scrum/`, `types/scrum.ts`, `scripts/seed-scrum-*` | `ScrumHome`, working-day utilities, mood serializer | Foundation slice from `docs/daily_scrum_module_IMPLEMENTATION_STRATEGY.md`: schema, settings/permission seeds, notifications, nav, serializer/tests. Submission UI/API and calendar are pending P1/P2. Build spec file is currently absent from workspace. |
| Telegram Bot — Stage 1 (foundation) | IN PROGRESS | `lib/telegram/`, `lib/ai/telegram-chat.ts`, `app/api/telegram/` | `webhook` route, `admin/setup` route, `TelegramChat`/`TelegramMessage`/`TelegramBotConfig` models | Logs all group/channel messages, answers `/ask` via Claude Sonnet 4.6. Stages 2 (Odoo digests) and 3 (tool use + admin UI) deferred. See `docs/TELEGRAM_BOT.md`. |
| Authentication | DONE | `app/auth/`, `lib/auth.ts`, `app/api/auth/change-password/` | Sign-in, sign-up, session, change password, 4-hour idle timeout | NextAuth Credentials provider, JWT; `maxAge` 14400 s; client-side `useIdleTimeout` hook with 5-min warning toast |
| Permissions (RBAC) | DONE | `lib/rbac.ts` + `lib/permissions.ts` | `can(action, resource, actor)` unified API | Covers all 40 matrix actions — `lib/permissions.ts` is wrapped by `rbac.ts` |
| Permission Management — Roles CRUD API | DONE | `app/api/permissions/roles/`, `app/api/permissions/roles/[id]/`, `app/api/permissions/roles/[id]/clone/` | REST API for Role, RoleDocTypePermission, FeaturePermission, RecordScopeRule management. Roles list, create, detail, update, delete, clone. ADMIN-only via `withRole`. |
| Activity Logging | DONE | `lib/activity-log.ts` | `recordActivity()` | Append-only audit trail |
| Real-time Notifications | DONE | `lib/pusher.ts`, `lib/stores/notification-store.ts` | Pusher integration | |
| Notification Dispatcher | DONE | `lib/notifications/` | `emit(event, payload)`, 40 canonical events, per-user prefs, org defaults, digest queue | Wired into objective/KR/todo/user/timeframe/comment mutations |
| Email Templates | DONE | `lib/email/templates/index.ts` | `renderTemplate(eventKey, data)` | One template per event; redaction-aware |
| Notification Preferences | DONE | `app/dashboard/settings/notifications/`, `/api/notifications/preferences` | Per-category in-app/email/cadence | Account category is mandatory |
| Org Notification Defaults | DONE | `app/dashboard/settings/notification-defaults/`, `/api/settings/notification-defaults` | Admin-only | Fallback when user has no row |
| Watchers | DONE | `/api/watchers` | Opt-in watch on objective/KR/todo | Receives applicable dispatcher events |
| Notification Cron Jobs | DONE | `lib/notifications/jobs.ts`, `/api/cron/notifications` | Digest drain, escalation, todo reminders, timeframe watcher, admin digests | See `deploy/notifications-crontab.example` |

## OKR Management

| Feature | Status | Path | Key Exports | Notes |
|---------|--------|------|-------------|-------|
| Objectives CRUD | DONE, NEEDS REFACTOR | `components/objectives/`, `app/api/objectives/` | Modals, buttons, lists | 19 modal wrappers need consolidation |
| Objective Hierarchy | DONE | `components/objectives/NestedObjectivesList.tsx` | Parent-child tree | |
| Objective Cloning | DONE | `components/objectives/CloneObjectiveModal.tsx` | Clone with KRs | |
| Key Results CRUD | DONE, NEEDS REFACTOR | `components/keyresults/`, `app/api/keyresults/` | Modals, buttons, charts | Same modal duplication |
| KR Check-ins | DONE | `components/keyresults/CreateCheckInModal.tsx` | Check-in form + history | |
| KR Archiving | DONE | `components/keyresults/ArchiveKeyResultModal.tsx` | Archive/unarchive | |
| Progress Calculation | DONE | `lib/objectiveProgress.ts` | `recalcNodeAndAncestors()` | Supports LOOSE + STRICT_DEPENDENCY |
| Confidence Snapshots | DONE | `lib/confidence-calc.ts` | Auto-computed on check-in + bi-weekly cron. Score = time-elapsed vs progress gap (40%) + velocity (25%) + initiative completion (15%) + staleness (20%). Objective goalStatus = worst-of children. | `app/api/cron/confidence-calc/`, `app/api/cron/auto-confidence/` |
| Alignment Map | DONE | `app/dashboard/alignment-map/` | OKR alignment visualization | |
| Period close, retrospective, reopen, and lock | DONE | `app/api/objectives/[id]/close/`, `app/api/keyresults/[id]/close/`, `components/shared/OkrCloseModal.tsx` | Server-side 423 lock, evidence-backed retrospective, reopen scars | Verified on localhost |
| Roll-forward and lineage | DONE | Existing `/clone` routes/modals, `components/shared/RolledFromBanner.tsx` | Carried baseline, single successor, predecessor/successor history | Verified Q1→Q2 |
| End-of-period report | DONE | `/dashboard/okrs-all/period-report/[timeframeId]`, `/api/reports/period-close/[timeframeId]` | Scoped charts, lessons, ledger, close queue, PDF | Verified API/page/PDF |

## Work Management

| Feature | Status | Path | Key Exports | Notes |
|---------|--------|------|-------------|-------|
| Todos / Initiatives | DONE, NEEDS REFACTOR | `components/todos/`, `app/api/todos/`, `app/api/todos/reorder/` | CRUD modals + lists | Duplicate status toggle logic in ToDoList vs MyTasksList; kanban now supports precise drop-position with insertion-line indicator (`sortOrder` field) |
| Sprint Board | DONE | `components/sprints/`, `app/api/sprints/`, `app/api/sprints/[id]/board/reorder/` | Kanban board | Trello-style with columns, cards, comments, sub-tasks; precise drag-and-drop with insertion-line indicator and position persistence (`sprintPosition`) |
| Sprint-to-Initiative Convert | DONE | `app/api/sprints/[id]/activities/[actId]/convert-to-initiative/` | | |
| AI Sprint Planning | IN PROGRESS | `app/api/sprints/ai/`, `features/sprints-ai/` | `GenerateSprintButton`, `GenerateSprintModal`, `ReviewPlanClient`, `runSprintPlanPipeline` | Per-user generation INTO an existing PLANNING team sprint (no longer creates one). Trigger is in the sprint board header. Multiple users can have plans on the same sprint; each is reviewed and approved independently. Sprint stays in PLANNING until the lead manually starts it. Behind `OrganizationSettings.aiSprintPlanningEnabled` flag. |
| Initiative Daily Updates | DONE | `components/initiative-report/`, `app/api/initiatives/` | Report grid | |

## Views & Analytics

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| Dashboard Home | DONE | `app/dashboard/page.tsx`, `components/dashboard/` | Has stat card duplication |
| My OKRs | DONE | `app/dashboard/my-okrs/`, `components/dashboard/MyOKRsPage.tsx` | |
| My Tasks | DONE | `app/dashboard/my-tasks/` | |
| Goals View | DONE | `app/dashboard/goals/`, `components/goals/` | Table, feed, filter views |
| Filters Workspace | DONE | `app/dashboard/filters/`, `features/filters/` | Three-tab (Objectives/KRs/Initiatives) analytical surface: segments panel, filter bar, KPI tiles, histogram chart, grouped results list. URL-synced state. GET /api/keyresults added. |
| Company OKRs | DONE, NEEDS REFACTOR | `app/dashboard/company-okrs/page.tsx` | Near-identical to Department OKRs page |
| Department OKRs | DONE, NEEDS REFACTOR | `app/dashboard/department-okrs/page.tsx` | Near-identical to Company OKRs page |
| Progress Tracking | DONE | `app/dashboard/progress/` | |
| Reports | DONE | `app/dashboard/reports/`, `components/reports/` | |
| Analytics | DONE | `app/dashboard/analytics/` | |
| Activity Feed | DONE | `app/dashboard/activity/` | |
| Comments | DONE | `app/dashboard/comments/` | |
| Notifications | DONE | `app/dashboard/notifications/` | |
| Archived Objectives | DONE | `app/dashboard/archived-objectives/` | |

## Performance & Scorecard

Implementation reference: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`. Detailed delivery status: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md`.

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| Scorecard schema, scoring, state machine, and policy | DONE | `prisma/schema.prisma`, `lib/performance/` | Fail-closed relationship access and immutable published versions |
| Performance permissions and role alignment | DONE | `lib/performance/policy.ts`, `lib/permission-resolver.ts`, `scripts/seed-permissions.ts` | Effective direct/profile roles, module-scoped Performance Admin, 22 DocTypes, sensitive fields, API/page/navigation/action enforcement |
| Template management | DONE | `features/performance/`, `app/api/performance/templates/`, `prisma/seed-culture-library.ts` | Create/build/publish/fork/archive, role mappings, metric mappings, culture block, scoring-rule picker, tier/criterion reordering (drag-drop + buttons), gatekeeper & decision-bands editor; C1-C6 culture-library seed (`npm run db:seed:culture-library`) and admin editor at `/dashboard/performance/culture-library` |
| Review cycles and evaluator panels | DONE | `app/api/performance/cycles/`, `app/api/performance/evaluations/[id]/panel/` | Idempotent open, close with incomplete-evaluation override, issue resolve/waive UI (`CycleIssuesModal`), panel management UI (`PanelManager`), default manager lead |
| Scoring, metric auto-pull, consolidation, calibration | IN PROGRESS | `ScoringWorkspace`, `lib/performance/consolidation.ts` | Core flow works; manual consolidation retry and side-by-side calibration view added; no AG Grid |
| Reports, acknowledgement, finalization | IN PROGRESS | `PerformanceReport`, evaluation workflow APIs | Core workflow works; competency radar, multi-cycle trend, and OKR attainment sections added to reports |
| Continuous development and rewards | IN PROGRESS | `PerformanceHome`, `ActionsWorkspace`, `/api/cron/performance-nudge` | In-app nudge and recommendation queue work; dashboard radar/trend charts and sealed-results indicator added; dispatcher/email/activity audit remain |
| Excel template import | BLOCKED | — | Required source workbooks are absent |

## Organization

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| User Management | DONE | `components/settings/UserManagement.tsx`, `app/api/users/` | Includes an admin-only, audited Project Manager capability switch; user data still uses component state rather than react-hook-form. |
| Team Management | DONE | `components/settings/TeamsManagement.tsx`, `app/api/departments/` | |
| User Directory | DONE | `app/dashboard/org/users/` | |
| Team Directory | DONE | `app/dashboard/org/teams/` | |
| User Profile | DONE | `app/dashboard/profile/`, `components/profile/` | |
| Org Hierarchy | DONE | `components/hierarchy/` | Manager/direct report visualization |

## Settings

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| Profile Settings | DONE | `app/dashboard/settings/profile/` | |
| Account Settings | DONE | `app/dashboard/settings/account/` | |
| Notification Settings | DONE | `app/dashboard/settings/notifications/` | |
| Timeframe Management | DONE | `app/dashboard/settings/timeframes/`, `app/api/timeframes/` | |
| OKR Rules Config | DONE | `components/settings/OKRRulesManagement.tsx` | react-hook-form |
| Branding Config | DONE | `components/settings/BrandingManagement.tsx` | react-hook-form |
| Integrations Config | IN PROGRESS | `components/settings/IntegrationsManagement.tsx`, `components/settings/AiProviderSettingsPanel.tsx`, `app/api/settings/integrations/ai/` | Existing email/Slack settings plus Administrator-only masked OpenAI project-creation key, allowlisted model, caps, live connection testing, safe distinct outcomes, last-verification state, and an independently persisted/audited project-creation AI master toggle. The feature uses `PROJECT_CREATION_AI`, never the sprint-planning flag. Story 1.3 now hides the New Project AI option when disabled; AC36 remains partial only until P2/P3 add concrete AI endpoints whose refusal can be tested end to end. |
| Audit Logs | DONE | `components/settings/AuditLogsView.tsx` | |

## Letter Management

Spec: `docs/letter_management_requirements.md` (v2.0). Implemented as a vertical slice — UI, API, workflow, sequence, activity log, and enclosures are real; Odoo contact lookup and PDF generation are deliberately mocked (see route comments).

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| List view + filters + search | DONE | `features/letters/components/LettersPageClient.tsx`, `LettersTable.tsx` | Status tabs (My Letters, Draft, Submitted, Approved, Sent, Archived) + type filters |
| Create letter (draft) | DONE | `features/letters/components/CreateLetterModal.tsx`, `app/api/letters/route.ts` | Allocates `360G/LT/{CL\|OF\|GR}/{SEQ}/{YEAR}` via `lib/letters.ts` |
| Letter form (edit, body, recipient/sender, signatory) | DONE | `features/letters/components/LetterFormClient.tsx`, `app/dashboard/letters/[id]/page.tsx` | Auto-save body after 30s of inactivity |
| Workflow transitions (submit/approve/reject/send/archive/unarchive) | DONE | `app/api/letters/[id]/{submit,approve,reject,send,archive}/route.ts` | Pre-conditions enforced; activity log entries written |
| Enclosures | DONE (metadata only) | `features/letters/components/EnclosuresPanel.tsx`, `app/api/letters/[id]/enclosures/` | Real binary upload deferred to object-storage milestone |
| PDF preview & print | MOCKED | `features/letters/components/PdfPreviewPanel.tsx`, `app/api/letters/[id]/pdf/route.ts` | Returns server-rendered HTML; swap for `@react-pdf/renderer` or Puppeteer worker |
| Odoo customer typeahead | MOCKED | `features/letters/components/CustomerLookup.tsx`, `app/api/letters/odoo/contacts/route.ts` | Returns a small stub roster; replace with real Odoo `res.partner` integration |
| Activity log integration | DONE | `components/shared/ActivityLogPanel.tsx` (extended), `lib/activity-log.ts` (LETTER entityType + 9 actions) | Reuses shared panel |
| Permissions | DONE | `lib/permissions.ts`, `lib/letter-permissions.ts`, `app/api/settings/letter-permissions/` | DB-driven role × permission matrix + per-user overrides; editable via Settings > Letter Permissions (ADMIN only); `checkLetterPermission()` async resolver with static fallback |
| Letter Permissions settings UI | DONE | `components/settings/LetterPermissionsManagement.tsx`, `app/dashboard/settings/letter-permissions/page.tsx` | 3-tab UI: Role Matrix toggle grid, User Overrides panel, Letter Types CRUD |
| Reporting view | PLANNED | — | FR-16 — not yet built |
| Notifications on transitions | PLANNED | — | Hook into `lib/notifications.ts` once the letter UI stabilises |
| Template management screen | PLANNED | — | Currently constants in `lib/letters.ts` |

## Infrastructure

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| Email Digest | DONE | `lib/weekly-digest.ts`, `app/api/cron/weekly-digest/` | Weekly email with OKR updates |
| SMTP Email Delivery | DONE (requires env) | `lib/email.ts` | Set `EMAIL_DRIVER=smtp` + SMTP env vars |
| Admin Email Test Endpoint | DONE | `app/api/email/test/route.ts` | Admin-only SMTP test email |
| Client Error Reporting | DONE | `components/CrashReporter.tsx`, `app/api/client-errors/` | |
| View Tracking | DONE | `lib/view-tracking.ts` | One row per user/entity/day |
| Planning Page | DONE | `app/dashboard/plans/`, `components/plans/` | |

---

## Refactor Backlog (Planned Modules)

| Module | Phase | Description |
|--------|-------|-------------|
| `components/ui/Modal` | Phase 3 | DONE — shared modal shell (ready for adoption) |
| `components/ui/ConfirmDialog` | Phase 3 | DONE — shared confirm dialog (ready for adoption) |
| `components/ui/EmptyState` | Phase 3 | DONE — shared empty state (ready for adoption) |
| `components/ui/StatCard` + `StatGrid` | Phase 3 | DONE — shared stat card layout (ready for adoption) |
| `components/ui/PageHeader` | Phase 3 | DONE — shared page header (ready for adoption) |
| `hooks/useUsersForSelection` | Phase 4 | DONE — React Query cached hook (ready for adoption) |
| `hooks/useTimeframes` | Phase 4 | DONE — React Query cached hook (ready for adoption) |
| `hooks/useDepartments` | Phase 4 | DONE — React Query cached hook (ready for adoption) |
| `hooks/useReferenceData` | Phase 4 | DONE — combined hook for forms (ready for adoption) |
| `features/objectives/` | Phase 5 | Feature module with barrel export |
| `features/key-results/` | Phase 5 | Feature module with barrel export |
| `features/todos/` | Phase 5 | Feature module with barrel export |
| `features/sprints/` | Phase 5 | Feature module with barrel export |
| `lib/api/withAuth.ts` | Phase 6 | DONE — auth middleware + withRole helper (2 pilot routes migrated) |
| `lib/api/apiResponse.ts` | Phase 6 | DONE — standard envelope helpers (apiSuccess/apiError/apiUnauthorized/apiForbidden/apiNotFound/apiBadRequest/apiValidationError/apiConflict/apiPaginated) |
| `lib/api/handleError.ts` | Phase 6 | DONE — handles Prisma errors (P2002/P2025) and generic failures |
| **API route migration** | Phase 6 | **42 of ~43 routes migrated.** All application routes done. Intentionally deferred: `/api/cron/*` (custom CRON_SECRET auth), `/api/health` (public). Previous WIP note: **Done:** departments (+/[id]), users/for-selection, timeframes (+/[id]), labels, user-preferences, initiative-report, todos (+/[id]), keyresults (+/[id] and all sub-routes: archive/unarchive/clone/todos/check-ins/activity/views), objectives (+/[id] and all sub-routes: clone/children/labels/activity/views/key-result-permissions/alignment-search), users (+/[id]/+me), settings/okr-rules, settings/branding, settings/integrations, auth/register, client-errors, initiatives/[id]/updates. **Remaining:** sprint routes (cohesive unit, batch together), cron/* (custom CRON_SECRET auth), health (trivial). |
| **Features scaffolding (Phase 5)** | Phase 5 | DONE — all 5 features physically migrated. Files live under `features/[name]/components/`. Barrels re-export locally. External consumers import from `@/features/*`. Cross-feature imports go through barrels (verified for `features/key-results` → `features/todos`). |
| **OKRLevelView consolidation (Phase E)** | Phase E | DONE — company-okrs + department-okrs pages reduced from 373 lines of duplicated code to 42 lines + 109-line shared `OKRLevelView` component. |

| **Plans Gantt (DHTMLX)** | 2026-04-20 | DONE — `/dashboard/plans` has a List/Gantt view toggle. Gantt is powered by `dhtmlx-gantt` with objective→KR parent/child, parentObjective dependency arrows, assignee column with avatars, status/confidence pills, progress column, zoom (Week/Month/Quarter/Year), today marker. Data source: `GET /api/gantt` (role-scoped). |
