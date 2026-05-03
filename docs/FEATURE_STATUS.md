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
| Authentication | DONE | `app/auth/`, `lib/auth.ts` | Sign-in, sign-up, session | NextAuth Credentials provider, JWT |
| Permissions (RBAC) | DONE | `lib/rbac.ts` + `lib/permissions.ts` | `can(action, resource, actor)` unified API | Covers all 40 matrix actions — `lib/permissions.ts` is wrapped by `rbac.ts` |
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

## Work Management

| Feature | Status | Path | Key Exports | Notes |
|---------|--------|------|-------------|-------|
| Todos / Initiatives | DONE, NEEDS REFACTOR | `components/todos/`, `app/api/todos/` | CRUD modals + lists | Duplicate status toggle logic in ToDoList vs MyTasksList |
| Sprint Board | DONE | `components/sprints/`, `app/api/sprints/` | Kanban board | Trello-style with columns, cards, comments, sub-tasks |
| Sprint-to-Initiative Convert | DONE | `app/api/sprints/[id]/activities/[actId]/convert-to-initiative/` | | |
| AI Sprint Planning | PLANNED | `app/api/sprints/ai/`, `features/sprints/` | Spec: `docs/AI_SPRINT_PLANNING.md` | Bi-weekly draft sprints with carryover triage. Behind `OrganizationSettings.aiSprintPlanningEnabled` flag. |
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

## Organization

| Feature | Status | Path | Notes |
|---------|--------|------|-------|
| User Management | DONE | `components/settings/UserManagement.tsx`, `app/api/users/` | Uses useState (not react-hook-form) |
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
| Integrations Config | DONE | `components/settings/IntegrationsManagement.tsx` | react-hook-form |
| Audit Logs | DONE | `components/settings/AuditLogsView.tsx` | |

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
