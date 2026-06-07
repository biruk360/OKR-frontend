# OKR Management System — Master Reference

> **This is the single authoritative reference document for the entire system.**
> It is generated from a full traversal of all code, schemas, routes, components, and docs.
> **Keep it up-to-date:** after every feature addition or significant change, update the relevant section(s) here, then update `docs/CHANGELOG_AI.md`.
>
> Last updated: 2026-06-07

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Modules & Features](#4-modules--features)
5. [Page List & Sitemap](#5-page-list--sitemap)
6. [Data Models (Database Schema)](#6-data-models-database-schema)
7. [API Reference](#7-api-reference)
8. [Components](#8-components)
9. [Shared Hooks](#9-shared-hooks)
10. [State Management (Zustand)](#10-state-management-zustand)
11. [Permissions & RBAC](#11-permissions--rbac)
12. [Notification System](#12-notification-system)
13. [Email & Digest System](#13-email--digest-system)
14. [Cron Jobs](#14-cron-jobs)
15. [Library Utilities](#15-library-utilities)
16. [Layouts](#16-layouts)
17. [Design System & Conventions](#17-design-system--conventions)
18. [Infrastructure & Deployment](#18-infrastructure--deployment)
19. [Feature Status Summary](#19-feature-status-summary)
20. [Known Issues & Refactor Backlog](#20-known-issues--refactor-backlog)

---

## 1. System Overview

A full-stack **OKR (Objectives & Key Results) management platform** built with Next.js 14 App Router. The system enables organizations to:

- Set and track **Company, Department, and Individual objectives** with hierarchical alignment
- Manage **Key Results** with check-ins, confidence tracking, and progress calculation
- Run **Sprint boards** (Trello-style kanban) with AI-assisted planning
- Manage **To-dos / Initiatives** linked to Key Results and Objectives
- Write and track **formal business letters** through a full approval workflow
- Manage **Daily Trip Plans** for employee travel logistics
- Run **performance scorecards and review cycles** with evaluator panels, calibration, reports, growth focuses, and development actions
- Receive **real-time notifications** and email digests
- Visualize org hierarchy, alignment maps, Gantt charts, and analytics

### Roles

| Role | Hierarchy | Capabilities |
|------|-----------|--------------|
| `ADMIN` | 1 (highest) | Everything — full system access |
| `EXECUTIVE` | 2 | Same as ADMIN for most OKR operations |
| `DEPARTMENT_LEAD` | 3 | Department + individual objectives, team management |
| `EMPLOYEE` | 4 (lowest) | Own individual objectives, assigned todos |

---

## 2. Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14 | App Router, API routes, SSR |
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Prisma | Latest | ORM — PostgreSQL (prod), schema-push deployment |
| TanStack Query | Latest | Server state caching |
| Zustand | Latest | Client-side stores |
| Tailwind CSS | 3 | Styling with design tokens |
| react-hook-form | Latest | Form state management |
| NextAuth.js | Latest | Authentication (Credentials provider, JWT) |
| Pusher | Latest | Real-time push notifications |
| date-fns | Latest | Date formatting |
| Lucide React | Latest | Icons |
| dhtmlx-gantt | Latest | Gantt chart on Plans page |

**Database:** PostgreSQL (production). Schema applied via `prisma db push` — no migration history. Changes tracked in `preflight.sql`.

---

## 3. Project Structure

```
OKR-frontend/
├── app/                          # Next.js App Router
│   ├── api/                      # REST API endpoints (170+ route files)
│   ├── auth/                     # Public auth pages (signin, signup)
│   └── dashboard/                # All authenticated UI pages
│
├── components/                   # Shared React components
│   ├── ui/                       # Primitives: Modal, ConfirmDialog, StatCard, EmptyState, PageHeader
│   ├── layout/                   # DashboardShell, DashboardTitleContext
│   ├── shared/                   # ActivityLogPanel, EntityLink, TimeframeBadge
│   ├── dashboard/                # Dashboard widgets, MyOKRsPage
│   ├── hierarchy/                # Org hierarchy visualization
│   ├── initiative-report/        # Daily updates report grid
│   ├── objectives/               # Objective modals, lists, buttons
│   ├── keyresults/               # KR modals, lists, buttons
│   ├── todos/                    # Todo modals, lists, buttons
│   ├── goals/                    # Goals views and filter bar
│   ├── sprints/                  # Sprint board, card modal
│   ├── settings/                 # All settings panels
│   ├── plans/                    # PlansList, PlansGantt
│   ├── profile/                  # User profile components
│   └── reports/                  # Report components
│
├── features/                     # Feature barrels (strangler pattern)
│   ├── objectives/               # 18 exports + barrel
│   ├── key-results/              # 16 exports + barrel
│   ├── todos/                    # 11 exports + barrel
│   ├── goals/                    # 9 exports + barrel
│   ├── sprints/                  # 3 exports + barrel
│   ├── letters/                  # Letter UI + workflow components
│   ├── filters/                  # Filters workspace
│   ├── daily-trip-plan/          # Full DTP feature module
│   └── index.ts                  # Root namespace barrel
│
├── hooks/                        # Shared React hooks
│   ├── useDebounce.ts
│   ├── useUsersForSelection.ts
│   ├── useTimeframes.ts
│   ├── useDepartments.ts
│   ├── useReferenceData.ts
│   ├── useMediaQuery.ts
│   └── useViewTracker.ts
│
├── lib/                          # Server + shared utilities
│   ├── api/                      # withAuth, apiResponse, handleError
│   ├── stores/                   # Zustand stores
│   ├── email/                    # Email templates + digest
│   ├── notifications/            # Event dispatcher, jobs, preferences
│   ├── auth.ts                   # NextAuth config
│   ├── prisma.ts                 # Prisma singleton
│   ├── permissions.ts            # RBAC functions (13+)
│   ├── rbac.ts                   # Unified RBAC API wrapping permissions.ts
│   ├── utils.ts                  # cn(), formatDate, calculateProgress, etc.
│   ├── objectiveProgress.ts      # recalcNodeAndAncestors()
│   ├── activity-log.ts           # recordActivity() — audit trail
│   ├── confidence-calc.ts        # Bi-weekly confidence computation
│   ├── letters.ts                # Letter reference number allocation
│   ├── letter-permissions.ts     # checkLetterPermission() async resolver
│   ├── pusher.ts                 # Real-time push
│   ├── email.ts                  # sendMail() with SMTP
│   ├── weekly-digest.ts          # Weekly digest generation
│   ├── dashboard-navigation.ts   # Sidebar nav structure
│   └── telegram/                 # Telegram bot integration
│
├── types/
│   ├── index.ts                  # All shared TypeScript types
│   └── next-auth.d.ts            # Session type augmentation
│
├── prisma/
│   ├── schema.prisma             # Source of truth — 58 models
│   └── seed*.ts                  # Seed scripts
│
└── docs/                         # Documentation
    ├── MASTER_REFERENCE.md       # This file — update after every change
    ├── CHANGELOG_AI.md           # AI change log (append-only)
    ├── SITEMAP.md                # Route map
    ├── FEATURE_STATUS.md         # Module status tracker
    ├── COMPONENT_CATALOG.md      # Component inventory
    ├── AI_CONTEXT.md             # Architecture summary
    ├── REQUIREMENTS.md           # Feature requirements index
    ├── CONVENTIONS.md            # Code conventions
    ├── NOTIFICATIONS.md          # Notification cadence + RBAC matrix
    ├── REPORTS.md                # Report system docs
    ├── CRON.md                   # Cron job schedule
    ├── TELEGRAM_BOT.md           # Telegram integration
    └── AI_SPRINT_PLANNING.md     # AI sprint planning spec
```

---

## 4. Modules & Features

### 4.1 Core OKR Management

| Module | Status | Paths |
|--------|--------|-------|
| Authentication | DONE | `app/auth/`, `lib/auth.ts` |
| Objectives CRUD | DONE (needs refactor) | `features/objectives/`, `app/api/objectives/` |
| Objective Hierarchy | DONE | `components/objectives/NestedObjectivesList.tsx` |
| Objective Cloning | DONE | `components/objectives/CloneObjectiveModal.tsx` |
| Objective Alignment Map | DONE | `app/dashboard/alignment-map/` |
| Key Results CRUD | DONE (needs refactor) | `features/key-results/`, `app/api/keyresults/` |
| KR Check-ins | DONE | `components/keyresults/CreateCheckInModal.tsx` |
| KR Archiving | DONE | `components/keyresults/ArchiveKeyResultModal.tsx` |
| Progress Calculation | DONE | `lib/objectiveProgress.ts` |
| Confidence Snapshots | DONE | `lib/confidence-calc.ts`, `/api/cron/confidence-calc/` |
| Favorites / Starred | DONE | `/api/favorites/` |
| Watchers | DONE | `/api/watchers/` |

### 4.2 Work Management

| Module | Status | Paths |
|--------|--------|-------|
| Todos / Initiatives CRUD | DONE (needs refactor) | `features/todos/`, `app/api/todos/` |
| Todo Comments (WYSIWYG) | DONE | `app/api/todos/[id]/comments/` |
| Todo Checklists | DONE | `app/api/todos/[id]/checklists/` |
| Todo Attachments | DONE | `app/api/todos/[id]/attachments/` |
| Todo Labels | DONE | `app/api/todo-labels/` |
| Initiative Daily Updates | DONE | `app/api/initiatives/[id]/updates/` |
| Sprint Board (Kanban) | DONE | `features/sprints/`, `app/api/sprints/` |
| Sprint Cloning | DONE | `/api/sprints/[id]/clone/` |
| Sprint Ending | DONE | `/api/sprints/[id]/end/` |
| AI Sprint Planning | IN PROGRESS | `features/sprints-ai/`, `app/api/sprints/ai/` |

### 4.3 Views & Analytics

| Module | Status | Paths |
|--------|--------|-------|
| Dashboard Home | DONE | `app/dashboard/page.tsx` |
| My OKRs | DONE | `app/dashboard/my-okrs/` |
| My Tasks | DONE | `app/dashboard/my-tasks/` |
| Goals View (table/feed/team) | DONE | `app/dashboard/goals/`, `features/goals/` |
| Filters Workspace | DONE | `app/dashboard/filters/`, `features/filters/` |
| Company OKRs | DONE | `app/dashboard/company-okrs/` |
| Department OKRs | DONE | `app/dashboard/department-okrs/` |
| Plans (List + Gantt) | DONE | `app/dashboard/plans/`, `components/plans/` |
| Progress Tracking | DONE | `app/dashboard/progress/` |
| Reports & Analytics | DONE | `app/dashboard/reports/`, `app/dashboard/analytics/` |
| Initiative Report | DONE | `app/dashboard/initiative-report/` |
| Activity Feed | DONE | `app/dashboard/activity/` |
| Archived Objectives | DONE | `app/dashboard/archived-objectives/` |
| OKR Alignment Map | DONE | `app/dashboard/alignment-map/` |

### 4.4 Letter Management

Full lifecycle workflow: DRAFT → SUBMITTED → APPROVED → SENT → ARCHIVED.

| Module | Status | Paths |
|--------|--------|-------|
| Letter List (filters, search, status tabs) | DONE | `features/letters/components/LettersPageClient.tsx` |
| Create Letter (draft + ref number) | DONE | `features/letters/components/CreateLetterModal.tsx` |
| Letter Form (body, recipient, signatory) | DONE | `features/letters/components/LetterFormClient.tsx` |
| Workflow transitions (submit/approve/reject/send/archive) | DONE | `/api/letters/[id]/{submit,approve,reject,send,archive}` |
| Enclosures | DONE (metadata only) | `features/letters/components/EnclosuresPanel.tsx` |
| PDF preview & print | MOCKED | `/api/letters/[id]/pdf/` |
| Odoo customer typeahead | MOCKED | `/api/letters/odoo/contacts/` |
| Activity log integration | DONE | `components/shared/ActivityLogPanel.tsx` |
| Letter Permissions (role matrix + per-user overrides) | DONE | `lib/letter-permissions.ts`, `components/settings/LetterPermissionsManagement.tsx` |
| Reporting view | PLANNED | — |
| Notifications on transitions | PLANNED | — |
| Template management screen | PLANNED | — |

### 4.5 Daily Trip Plan (DTP)

Employee travel request and logistics management.

| Module | Status | Paths |
|--------|--------|-------|
| Employee Plan Home | IN PROGRESS | `app/dashboard/travel/` |
| Plan Editor | IN PROGRESS | `app/dashboard/travel/plans/[id]/` |
| Coordinator Console | IN PROGRESS | `app/dashboard/travel/console/` |
| Daily Movement Sheet | IN PROGRESS | `app/dashboard/travel/sheet/[deptId]/[date]/` |
| Daily Run Sheet | IN PROGRESS | `app/dashboard/travel/runsheet/[driverId]/[date]/` |
| Pool Coordinator Console | IN PROGRESS | `app/dashboard/travel/pool/` |
| DTP Settings | IN PROGRESS | `app/dashboard/settings/travel/` |
| Distance Matrix | STUB | Phase 2 — 10-min placeholder only |
| VRP Optimizer | STUB | Phase 2 — no real suggestions yet |
| Mobile App | PLANNED | Flutter — Phase 2 |
| SMS/Telegram integration | PLANNED | Phase 2 |

### 4.6 Telegram Bot

| Module | Status | Notes |
|--------|--------|-------|
| Webhook (message logging + `/ask` command) | IN PROGRESS | Stage 1 — Claude Sonnet 4.6 Q&A |
| Admin setup (register/clear webhook) | IN PROGRESS | `/api/telegram/admin/setup/` |
| Odoo digests | DEFERRED | Stage 2 |
| Tool use + admin UI | DEFERRED | Stage 3 |

### 4.7 Performance & Scorecard

Implementation reference: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`. Requirement-level status: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md`.

| Module | Status | Paths |
|--------|--------|-------|
| Scorecard templates, versions, role mappings, metric mappings, culture block | IN PROGRESS | `features/performance/`, `app/api/performance/templates/`, `app/api/performance/*-mappings/` |
| Review cycles, evaluator panels, and issue generation | DONE | `app/api/performance/cycles/`, `lib/performance/cycle-opening.ts` |
| Scoring, OKR metric actuals, consolidation, calibration | IN PROGRESS | `ScoringWorkspace`, `lib/performance/consolidation.ts`, `/api/performance/okr-actual/` |
| Sealed reports, acknowledgement, dispute, finalization | IN PROGRESS | `PerformanceReport`, evaluation workflow APIs |
| Growth focuses, weekly nudge, and development actions | IN PROGRESS | `PerformanceHome`, `ActionsWorkspace`, `/api/cron/performance-nudge` |
| Excel scorecard seed | BLOCKED | Required workbooks are absent |

### 4.7 Organization & Settings

| Module | Status | Paths |
|--------|--------|-------|
| User Management | DONE | `components/settings/UserManagement.tsx` |
| Team Management | DONE | `components/settings/TeamsManagement.tsx` |
| User Directory | DONE | `app/dashboard/org/users/` |
| Team Directory | DONE | `app/dashboard/org/teams/` |
| User Profile | DONE | `app/dashboard/profile/` |
| Org Hierarchy (manager/reports) | DONE | `components/hierarchy/` |
| Timeframe Management | DONE | `app/dashboard/settings/timeframes/` |
| OKR Rules Config | DONE | `components/settings/OKRRulesManagement.tsx` |
| Branding Config | DONE | `components/settings/BrandingManagement.tsx` |
| Integrations Config | DONE | `components/settings/IntegrationsManagement.tsx` |
| Audit Logs | DONE | `components/settings/AuditLogsView.tsx` |
| Notification Preferences | DONE | `app/dashboard/settings/notifications/` |
| Org Notification Defaults (Admin) | DONE | `app/dashboard/settings/notification-defaults/` |
| Letter Permissions (Admin) | DONE | `app/dashboard/settings/letter-permissions/` |

### 4.8 Infrastructure

| Module | Status | Paths |
|--------|--------|-------|
| RBAC (Permissions) | DONE | `lib/rbac.ts`, `lib/permissions.ts` |
| Activity Logging (audit trail) | DONE | `lib/activity-log.ts` |
| Real-time Notifications (Pusher) | DONE | `lib/pusher.ts` |
| Notification Dispatcher | DONE | `lib/notifications/dispatcher.ts` |
| Email Delivery (SMTP) | DONE | `lib/email.ts` |
| Email Digest Queue | DONE | `lib/notifications/jobs.ts` |
| View Tracking | DONE | `lib/view-tracking.ts` |
| Client Error Reporting | DONE | `components/CrashReporter.tsx`, `/api/client-errors/` |
| AI Generation Logging | DONE | `AiGenerationLog` model, `/api/admin/ai-logs/` |

---

## 5. Page List & Sitemap

### 5.1 Public Routes

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Root redirect |
| `/auth/signin` | `app/auth/signin/page.tsx` | Sign-in |
| `/auth/signup` | `app/auth/signup/page.tsx` | Sign-up / registration |

### 5.2 Dashboard — My Work

| Route | File | Description |
|-------|------|-------------|
| `/dashboard` | `app/dashboard/page.tsx` | Main dashboard overview |
| `/dashboard/my-okrs` | `app/dashboard/my-okrs/page.tsx` | User's own OKRs |
| `/dashboard/my-tasks` | `app/dashboard/my-tasks/page.tsx` | User's assigned tasks |
| `/dashboard/todos` | `app/dashboard/todos/page.tsx` | All todos / initiatives |
| `/dashboard/goals` | `app/dashboard/goals/page.tsx` | Goals (table, feed, team views) |
| `/dashboard/sprints` | `app/dashboard/sprints/page.tsx` | Sprint list |
| `/dashboard/sprints/[id]` | `app/dashboard/sprints/[id]/page.tsx` | Sprint kanban board detail |
| `/dashboard/sprints/ai/[planId]` | `app/dashboard/sprints/ai/[planId]/page.tsx` | AI sprint plan review + approve |

### 5.3 Dashboard — OKRs

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/plans` | `app/dashboard/plans/page.tsx` | Planning page (List + Gantt toggle) |
| `/dashboard/company-okrs` | `app/dashboard/company-okrs/page.tsx` | Company-level OKRs |
| `/dashboard/department-okrs` | `app/dashboard/department-okrs/page.tsx` | Department-level OKRs |
| `/dashboard/objectives` | `app/dashboard/objectives/page.tsx` | All objectives list |
| `/dashboard/objectives/[id]` | `app/dashboard/objectives/[id]/page.tsx` | Objective detail view |
| `/dashboard/key-results/[id]` | `app/dashboard/key-results/[id]/page.tsx` | Key result detail view |
| `/dashboard/alignment-map` | `app/dashboard/alignment-map/page.tsx` | OKR alignment / strategy map |
| `/dashboard/filters` | `app/dashboard/filters/page.tsx` | Filters Workspace (3-tab analytical surface) |
| `/dashboard/archived-objectives` | `app/dashboard/archived-objectives/page.tsx` | Archived objectives |

### 5.4 Dashboard — Tracking & Analytics

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/progress` | `app/dashboard/progress/page.tsx` | Progress tracking |
| `/dashboard/reports` | `app/dashboard/reports/page.tsx` | Reports & analytics |
| `/dashboard/initiative-report` | `app/dashboard/initiative-report/page.tsx` | Daily initiative updates report |
| `/dashboard/analytics` | `app/dashboard/analytics/page.tsx` | Analytics dashboard |

### 5.4A Dashboard — Performance & Scorecard

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/performance` | `app/dashboard/performance/page.tsx` | Employee My Performance dashboard |
| `/dashboard/performance/evaluations` | `app/dashboard/performance/evaluations/page.tsx` | Evaluation queue |
| `/dashboard/performance/evaluations/[id]/score` | `app/dashboard/performance/evaluations/[id]/score/page.tsx` | Scoring, calibration, and report workspace |
| `/dashboard/performance/templates` | `app/dashboard/performance/templates/page.tsx` | Scorecard template management |
| `/dashboard/performance/templates/[id]` | `app/dashboard/performance/templates/[id]/page.tsx` | Template builder and metric mappings |
| `/dashboard/performance/cycles` | `app/dashboard/performance/cycles/page.tsx` | Review-cycle management |
| `/dashboard/performance/actions` | `app/dashboard/performance/actions/page.tsx` | Development/reward action queue |

### 5.5 Dashboard — Communication

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/activity` | `app/dashboard/activity/page.tsx` | Activity feed |
| `/dashboard/comments` | `app/dashboard/comments/page.tsx` | Comment threads |
| `/dashboard/notifications` | `app/dashboard/notifications/page.tsx` | In-app notifications |

### 5.6 Dashboard — Letters

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/letters` | `app/dashboard/letters/page.tsx` | Letters list (filters, search, status tabs) |
| `/dashboard/letters/[id]` | `app/dashboard/letters/[id]/page.tsx` | Letter form — details, body, enclosures, PDF preview, activity log + workflow |

### 5.7 Dashboard — Travel (DTP)

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/travel` | `app/dashboard/travel/page.tsx` | Employee home — recent plans + create CTA |
| `/dashboard/travel/plans/[id]` | `app/dashboard/travel/plans/[id]/page.tsx` | Plan detail / editor |
| `/dashboard/travel/console` | `app/dashboard/travel/console/page.tsx` | Travel Coordinator console |
| `/dashboard/travel/sheet/[deptId]/[date]` | `app/dashboard/travel/sheet/[deptId]/[date]/page.tsx` | Daily Movement Sheet (printable) |
| `/dashboard/travel/runsheet/[driverId]/[date]` | `app/dashboard/travel/runsheet/[driverId]/[date]/page.tsx` | Daily Run Sheet |
| `/dashboard/travel/pool` | `app/dashboard/travel/pool/page.tsx` | Pool Coordinator assignment |

### 5.8 Dashboard — People & Organization

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/org/teams` | `app/dashboard/org/teams/page.tsx` | Teams directory |
| `/dashboard/org/teams/[id]` | `app/dashboard/org/teams/[id]/page.tsx` | Team detail |
| `/dashboard/org/users` | `app/dashboard/org/users/page.tsx` | Users directory |
| `/dashboard/org/users/[id]` | `app/dashboard/org/users/[id]/page.tsx` | User detail |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | User profile |

### 5.9 Dashboard — Settings

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Settings home |
| `/dashboard/settings/profile` | `app/dashboard/settings/profile/page.tsx` | Profile settings |
| `/dashboard/settings/account` | `app/dashboard/settings/account/page.tsx` | Account settings |
| `/dashboard/settings/notifications` | `app/dashboard/settings/notifications/page.tsx` | Notification preferences |
| `/dashboard/settings/notification-defaults` | `app/dashboard/settings/notification-defaults/page.tsx` | Org notification defaults (Admin) |
| `/dashboard/settings/users` | `app/dashboard/settings/users/page.tsx` | User management (Admin) |
| `/dashboard/settings/teams` | `app/dashboard/settings/teams/page.tsx` | Team management (Admin) |
| `/dashboard/settings/timeframes` | `app/dashboard/settings/timeframes/page.tsx` | Timeframe management |
| `/dashboard/settings/okr-rules` | `app/dashboard/settings/okr-rules/page.tsx` | OKR rules configuration |
| `/dashboard/settings/branding` | `app/dashboard/settings/branding/page.tsx` | Branding configuration |
| `/dashboard/settings/integrations` | `app/dashboard/settings/integrations/page.tsx` | Integrations configuration |
| `/dashboard/settings/audit-logs` | `app/dashboard/settings/audit-logs/page.tsx` | Audit log viewer |
| `/dashboard/settings/letter-permissions` | `app/dashboard/settings/letter-permissions/page.tsx` | Letter permissions (Admin) |
| `/dashboard/settings/travel` | `app/dashboard/settings/travel/page.tsx` | DTP settings (Admin) |

---

## 6. Data Models (Database Schema)

Database: **PostgreSQL** (production). All enums stored as `String` for portability. Soft deletion via `archivedAt`, `status`, `deletedAt` fields.

### 6.1 Users & Organization

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `User` | `users` | `id`, `email`, `name`, `role`, `designation`, `nameAmharic`, `designationAmharic`, `isActive`, `avatar` | Roles: ADMIN / EXECUTIVE / DEPARTMENT_LEAD / EMPLOYEE |
| `Department` | `departments` | `id`, `name`, `description`, `isActive` | |
| `DepartmentMembership` | `department_memberships` | `userId`, `departmentId`, `role`, `isPrimary`, `endedAt` | Roles: HEAD / MEMBER / SECONDARY_MEMBER |
| `ManagerRelationship` | `manager_relationships` | `managerId`, `directReportId`, `startedAt`, `endedAt` | Manager hierarchy |
| `OrganizationSettings` | `organization_settings` | `companyName`, `companyCeoUserId`, `allowMatrixReporting`, `allowMultipleDeptHeads`, `aiSprintPlanningEnabled`, `aiPreferredProvider` | Singleton row (`id="singleton"`) |
| `UserPreference` | `user_preferences` | `userId`, `todoViewMode` | Per-user UI prefs |
| `Favorite` | `favorites` | `userId`, `entityType`, `entityId` | Starred objectives |

### 6.2 OKR Core

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `Timeframe` | `timeframes` | `name`, `type`, `startDate`, `endDate`, `isActive` | Types: MONTHLY / QUARTERLY / SIX_MONTH / YEARLY |
| `Objective` | `objectives` | `title`, `level`, `status`, `goalStatus`, `progress`, `confidence`, `isPrivate`, `ownerId`, `timeframeId`, `departmentId`, `parentObjectiveId`, `alignmentType`, `rollupCalculation`, `checkInCadence`, `weight` | Levels: COMPANY / DEPARTMENT / INDIVIDUAL |
| `ObjectiveContributor` | `objective_contributors` | `objectiveId`, `userId`, `addedAt` | Additional collaborators |
| `KeyResult` | `key_results` | `title`, `startValue`, `targetValue`, `currentValue`, `unit`, `confidence`, `progress`, `status`, `isPrivate`, `ownerId`, `objectiveId`, `checkInCadence`, `weight` | Confidence: ON_TRACK / AT_RISK / OFF_TRACK |
| `KeyResultCheckIn` | `key_result_check_ins` | `keyResultId`, `asOfDate`, `value`, `confidence`, `confidenceScore`, `analysis`, `createdById` | `confidenceScore` 0-100 numeric |
| `ConfidenceSnapshot` | `confidence_snapshots` | `entityType`, `entityId`, `periodStart`, `confidence`, `score`, `factors` | Bi-weekly auto-calculated |
| `Label` | `labels` | `name`, `color` | Shared objective labels |
| `ObjectiveLabel` | `objective_labels` | `objectiveId`, `labelId` | Junction table |

### 6.3 Work Management

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `Todo` | `initiatives` | `title`, `status`, `priority`, `assigneeId`, `creatorId`, `keyResultId`, `objectiveId`, `sprintId`, `sprintPosition`, `taskType`, `aiSuggested`, `ambitionLevel`, `carryoverCount`, `carryoverDisposition`, `dueDate`, `startDate` | Statuses: PENDING / IN_PROGRESS / IN_REVIEW / STUCK / COMPLETED / CANCELLED |
| `TodoMember` | `todo_members` | `todoId`, `userId` | Additional assignees |
| `TodoLabel` | `todo_labels` | `todoId`, `labelDefId` | |
| `TodoLabelDef` | `todo_label_defs` | `name`, `color` | Board-wide label palette |
| `TodoChecklist` | `todo_checklists` | `todoId`, `title`, `position` | Named checklist group |
| `TodoChecklistItem` | `todo_checklist_items` | `checklistId`, `title`, `completed`, `assigneeId`, `dueDate` | |
| `TodoAttachment` | `todo_attachments` | `todoId`, `filename`, `url`, `mimeType`, `size` | |
| `TodoComment` | `todo_comments` | `todoId`, `authorId`, `content` (HTML), `parentId` | WYSIWYG threaded comments |
| `InitiativeUpdate` | `initiative_updates` | `initiativeId`, `authorId`, `updateDate`, `content`, `status`, `blockers` | One per (initiative, date) |
| `Sprint` | `sprints` | `name`, `ownerId`, `startDate`, `endDate`, `state`, `goal`, `departmentId`, `background` | States: PLANNING / ACTIVE / COMPLETED / CANCELLED |
| `SprintParticipant` | `sprint_participants` | `sprintId`, `userId`, `role` | Roles: MEMBER / OWNER |
| `SprintColumn` | `sprint_columns` | `sprintId`, `name`, `statusKey`, `position`, `color` | Dynamic board columns |
| `SprintActivity` | `sprint_activities` | — | **DEPRECATED** — slated for removal after 2026-05-11 |
| `SprintActivityComment` | `sprint_activity_comments` | — | **DEPRECATED** |
| `SprintActivityTask` | `sprint_activity_tasks` | — | **DEPRECATED** |

### 6.4 AI Features

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `AiSprintPlan` | `ai_sprint_plans` | `sprintId`, `subjectUserId`, `provider`, `modelId`, `rationale`, `allocations`, `carryoverSummary`, `status` | Statuses: DRAFT / ACCEPTED / DISCARDED / SUPERSEDED |
| `AiGenerationLog` | `ai_generation_logs` | `userId`, `feature`, `provider`, `modelId`, `inputTokens`, `outputTokens`, `costUsd`, `latencyMs`, `status` | Per-call audit for all AI generations |

### 6.5 Notifications & Email

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `Notification` | `notifications` | `userId`, `eventKey`, `category`, `title`, `message`, `isRead`, `metadata`, `redacted`, `emailMode` | In-app notification row |
| `NotificationPreference` | `notification_preferences` | `userId`, `category`, `inApp`, `email`, `emailCadence` | Per-user per-category |
| `OrgNotificationDefault` | `org_notification_defaults` | `category`, `inApp`, `email`, `emailCadence` | Fallback when no user row |
| `EmailDigestQueue` | `email_digest_queue` | `userId`, `cadence`, `category`, `eventKey`, `subject`, `bodyHtml` | Pending digest entries |
| `EmailDigestState` | `email_digest_state` | `userId`, `lastSentAt` | Idempotency for weekly digest |
| `OutboundEmail` | `outbound_emails` | `toEmail`, `subject`, `bodyHtml`, `status`, `attempts` | Sent email audit trail |
| `Watcher` | `watchers` | `userId`, `entityType`, `entityId` | Opt-in watchers |

### 6.6 Activity & Audit

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `ActivityLog` | `activity_logs` | `entityType`, `objectiveId?`, `keyResultId?`, `todoId?`, `sprintId?`, `letterId?`, `action`, `actorId`, `changes` (JSONB), `metadata` (JSONB) | Append-only audit trail |
| `ObjectiveView` | `objective_views` | `objectiveId`, `userId`, `viewDate`, `viewCount` | One row per (user, objective, day) |
| `KeyResultView` | `key_result_views` | `keyResultId`, `userId`, `viewDate`, `viewCount` | |
| `ClientErrorLog` | `client_error_logs` | `source`, `message`, `stack`, `url`, `userId` | Browser error reports |
| `Comment` | `comments` | `content`, `authorId`, `objectiveId?`, `keyResultId?`, `parentId` | Legacy threaded comments on OKRs |
| `Risk` | `risks` | `title`, `severity`, `status`, `objectiveId?`, `keyResultId?`, `reporterId` | Risk register |

### 6.7 Letters

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `Letter` | `letters` | `referenceNumber`, `subject`, `letterType`, `letterTypeId`, `status`, `customerName`, `preparedById`, `signatoryId`, `bodyContent`, `bodyDocx` | Statuses: DRAFT / SUBMITTED / APPROVED / SENT / ARCHIVED |
| `LetterEnclosure` | `letter_enclosures` | `letterId`, `fileName`, `fileSize`, `mimeType`, `storagePath` | |
| `LetterSequence` | `letter_sequences` | `typeCode`, `year`, `lastSeq` | Monotonic reference number sequences |
| `LetterTypeDef` | `letter_types` | `code`, `name`, `isBuiltIn` | e.g. CL / OF / GR |
| `LetterRolePermission` | `letter_role_permissions` | `role`, `permission`, `granted` | DB-driven RBAC matrix |
| `LetterUserPermission` | `letter_user_permissions` | `userId`, `permission`, `granted` | Per-user overrides |

### 6.8 Daily Trip Plan (DTP)

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `Vehicle` | `dtp_vehicles` | `plate`, `model`, `capacity`, `defaultDriverId` | |
| `Driver` | `dtp_drivers` | `userId?`, `fullName`, `phone`, `license`, `defaultVehicleId` | |
| `DtpTripType` | `dtp_trip_types` | `code`, `label`, `icon`, `defaultDwellMin` | e.g. MEETING, BANK_VISIT |
| `DtpDepartmentApproval` | `dtp_department_approvals` | `departmentId?`, `primaryCoordinatorId`, `failoverHours` | Per-dept approval routing |
| `DtpSettings` | `dtp_settings` | `submissionCutoff`, `approvalSlaTime`, `officeAnchorLat/Lng`, `workStart/End`, `poolCoordinatorIds` | Singleton (`id="default"`) |
| `DailyTripPlan` | `dtp_plans` | `requesterId`, `tripDate`, `status`, `priority`, `defaultModeOfMovement`, `late`, `emergency` | 14 statuses |
| `TripStop` | `dtp_trip_stops` | `planId`, `seq`, `purposeCode`, `destinationName`, `plannedStart`, `dwellMinutes`, `tripMode` | |
| `TripLeg` | `dtp_trip_legs` | `planId`, `tripStopId`, `legType`, `scheduledTime`, `driverId`, `vehicleId`, `status` | Types: DROPOFF / RETURN_PICKUP |
| `DailyRunSheet` | `dtp_run_sheets` | `driverId`, `vehicleId`, `runDate`, `status` | Driver × date container |
| `DtpEvent` | `dtp_events` | `planId`, `actorId`, `action`, `fromStatus`, `toStatus`, `payload` | Append-only audit |
| `RouteGroup` | `dtp_route_groups` | `runDate`, `tripStopIds`, `status` | Carpool/optimizer suggestions |

### 6.9 Telegram

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `TelegramChat` | `telegram_chats` | `chatId`, `type`, `title`, `scrapeMode`, `askEnabled` | |
| `TelegramMessage` | `telegram_messages` | `chatId`, `messageId`, `fromUserId`, `text`, `isCommand`, `command` | |
| `TelegramBotConfig` | `telegram_bot_config` | `botUsername`, `webhookUrl`, `systemPrompt` | Singleton (`id="default"`) |

### 6.10 Performance & Scorecard

| Model group | Models | Purpose |
|-------------|--------|---------|
| Settings and template definition | `PerformanceSettings`, `ScorecardTemplateFamily`, `ScorecardTemplate`, `ScorecardTier`, `ScorecardCriterion`, `CriterionLibraryEntry` | Versioned scorecard definitions, validation configuration, and reusable criteria |
| Template assignment and OKR links | `TemplateRoleMapping`, `EmployeeTemplateAssignment`, `MetricSourceMapping` | Resolve employee templates and reusable metric criteria |
| Review-cycle orchestration | `ReviewCycle`, `ReviewCycleDepartment`, `ReviewCycleIssue`, `Evaluation`, `EvaluationMetricSource` | Generate evaluations, freeze metric sources, and surface setup issues |
| Evaluator scoring and consolidation | `EvaluatorAssignment`, `EvaluatorScore`, `CriterionResult` | Blind panel scoring, variance, calibration, and consolidated results |
| Employee report and growth | `EvaluationReport`, `EvaluationAcknowledgement`, `ImprovementFocus`, `PerformanceNudgeDelivery` | Sealed report lifecycle, response, and score-free development loop |
| Development outcomes | `DevelopmentAction` | Human-approved reward, promotion, training, and role-change recommendations |

---

## 7. API Reference

All routes are under `/api/`. Standard response envelope: `{ success: boolean, data?: T, error?: string, pagination?: { page, limit, total, totalPages } }`.

Auth: routes use `withAuth(handler)` or `withRole(roles, handler)` from `lib/api/withAuth.ts`.

### 7.1 Authentication

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | Public | Register new user |
| GET/POST | `/api/auth/[...nextauth]` | Public | NextAuth handler |
| POST | `/api/auth/forgot-password` | Public | Request password reset |
| POST | `/api/auth/reset-password` | Public | Reset password with token |

### 7.2 Objectives

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/objectives` | Auth | List (role-scoped) |
| POST | `/api/objectives` | Auth | Create |
| GET | `/api/objectives/[id]` | Auth | Get detail |
| PUT | `/api/objectives/[id]` | Auth | Update |
| DELETE | `/api/objectives/[id]` | Auth | Delete |
| POST | `/api/objectives/[id]/archive` | Auth | Archive |
| POST | `/api/objectives/[id]/unarchive` | Auth | Unarchive |
| POST | `/api/objectives/[id]/complete` | Auth | Mark complete |
| GET | `/api/objectives/[id]/children` | Auth | Child objectives |
| GET/POST | `/api/objectives/[id]/labels` | Auth | Label management |
| GET | `/api/objectives/[id]/activity` | Auth | Activity log |
| POST | `/api/objectives/[id]/views` | Auth | Track view |
| GET | `/api/objectives/[id]/key-result-permissions` | Auth | KR permission check |
| POST | `/api/objectives/[id]/clone` | Auth | Clone with KRs |
| GET/PUT | `/api/objectives/[id]/weights` | Auth | KR/child weights |
| GET/POST | `/api/objectives/[id]/comments` | Auth | Comments |
| POST | `/api/objectives/[id]/request-checkin` | Auth | Request check-in from owner |
| GET | `/api/objectives/alignment-search` | Auth | Search alignment candidates |

### 7.3 Key Results

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/keyresults` | Auth | Create (recalcs parent progress) |
| GET | `/api/keyresults/[id]` | Auth | Get detail |
| PUT | `/api/keyresults/[id]` | Auth | Update |
| DELETE | `/api/keyresults/[id]` | Auth | Delete |
| POST | `/api/keyresults/[id]/archive` | Auth | Archive |
| POST | `/api/keyresults/[id]/unarchive` | Auth | Unarchive |
| POST | `/api/keyresults/[id]/complete` | Auth | Mark complete |
| POST | `/api/keyresults/[id]/clone` | Auth | Clone |
| GET/POST | `/api/keyresults/[id]/check-ins` | Auth | Check-in history / Record |
| GET | `/api/keyresults/[id]/todos` | Auth | Initiatives under this KR |
| GET | `/api/keyresults/[id]/activity` | Auth | Activity log |
| POST | `/api/keyresults/[id]/views` | Auth | Track view |
| GET/POST | `/api/keyresults/[id]/comments` | Auth | Comments |
| POST | `/api/keyresults/[id]/request-checkin` | Auth | Request check-in |

### 7.4 Todos / Initiatives

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/todos` | Auth | List (filtered) |
| POST | `/api/todos` | Auth | Create |
| GET | `/api/todos/[id]` | Auth | Get detail |
| PUT | `/api/todos/[id]` | Auth | Update |
| DELETE | `/api/todos/[id]` | Auth | Delete |
| GET | `/api/todos/[id]/activity` | Auth | Activity log |
| GET/POST | `/api/todos/[id]/comments` | Auth | Threaded comments |
| PUT/DELETE | `/api/todos/[id]/comments/[commentId]` | Auth | Comment CRUD |
| GET/POST | `/api/todos/[id]/checklists` | Auth | Checklists |
| GET/PUT/DELETE | `/api/todos/[id]/checklists/[checklistId]` | Auth | Checklist CRUD |
| GET/POST | `/api/todos/[id]/checklists/[checklistId]/items` | Auth | Checklist items |
| GET/PUT/DELETE | `/api/todos/[id]/checklists/[checklistId]/items/[itemId]` | Auth | Item CRUD |
| GET/POST | `/api/todos/[id]/attachments` | Auth | Attachments |
| DELETE | `/api/todos/[id]/attachments/[attachmentId]` | Auth | Remove attachment |
| GET/POST | `/api/initiatives/[id]/updates` | Auth | Daily initiative updates |
| GET/POST | `/api/todo-labels` | Auth | Label definitions |
| GET/PUT/DELETE | `/api/todo-labels/[id]` | Auth | Label def CRUD |

### 7.5 Sprints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/sprints` | Auth | List |
| POST | `/api/sprints` | Auth | Create |
| GET | `/api/sprints/active` | Auth | Active sprints |
| GET | `/api/sprints/[id]` | Auth | Get detail |
| PUT | `/api/sprints/[id]` | Auth | Update |
| DELETE | `/api/sprints/[id]` | Auth | Delete |
| POST | `/api/sprints/[id]/end` | Auth | End sprint |
| POST | `/api/sprints/[id]/clone` | Auth | Clone sprint |
| GET | `/api/sprints/[id]/board` | Auth | Board data |
| GET/POST | `/api/sprints/[id]/columns` | Auth | Sprint columns |
| PUT/DELETE | `/api/sprints/[id]/columns/[colId]` | Auth | Column CRUD |
| GET/POST | `/api/sprints/[id]/activities` | Auth | Sprint cards (legacy) |
| GET/PUT/DELETE | `/api/sprints/[id]/activities/[actId]` | Auth | Card CRUD (legacy) |
| GET/POST | `/api/sprints/[id]/activities/[actId]/comments` | Auth | Card comments |
| PUT/DELETE | `/api/sprints/[id]/activities/[actId]/comments/[commentId]` | Auth | Comment CRUD |
| GET/POST | `/api/sprints/[id]/activities/[actId]/tasks` | Auth | Card sub-tasks |
| PUT/DELETE | `/api/sprints/[id]/activities/[actId]/tasks/[taskId]` | Auth | Sub-task CRUD |
| POST | `/api/sprints/[id]/activities/[actId]/convert-to-initiative` | Auth | Convert to initiative |

#### 7.5.1 AI Sprint Planning

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/sprints/ai/generate` | Auth | Generate AI plan for (subjectUserId, sprintId) |
| GET | `/api/sprints/ai/[planId]` | Auth | Fetch draft plan with proposed tasks |
| POST | `/api/sprints/ai/[planId]/accept` | Auth | Accept plan — promote todos to sprint |
| POST | `/api/sprints/ai/[planId]/discard` | Auth | Discard draft plan |
| POST | `/api/sprints/ai/[planId]/regenerate` | Auth | Supersede and re-run with feedback |
| GET | `/api/sprints/ai/[planId]/debug` | Admin/Exec | Diagnostic — KR coverage + generation logs |
| GET/PUT | `/api/sprints/ai/[planId]/carryover/override` | Auth | Override carryover disposition |

### 7.6 Users

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/users` | Auth | List users |
| POST | `/api/users` | Admin | Create user |
| GET | `/api/users/for-selection` | Auth | Active users for dropdowns |
| GET | `/api/users/me/direct-reports` | Auth | Manager's direct reports |
| GET | `/api/users/me/departments` | Auth | Current user's departments |
| GET | `/api/users/[id]` | Auth | User detail |
| PUT | `/api/users/[id]` | Auth | Update user |
| DELETE | `/api/users/[id]` | Admin | Delete user |
| POST | `/api/users/[id]/reset-password` | Admin | Reset password |
| GET | `/api/users/[id]/org` | Auth | User's org context |

### 7.7 Departments

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/departments` | Auth | List |
| POST | `/api/departments` | Admin | Create |
| GET | `/api/departments/[id]` | Auth | Detail |
| PUT | `/api/departments/[id]` | Admin | Update |
| DELETE | `/api/departments/[id]` | Admin | Delete |
| GET/POST | `/api/departments/[id]/members` | Admin | Members |
| PUT/DELETE | `/api/departments/[id]/members/[membershipId]` | Admin | Member CRUD |
| PUT | `/api/departments/[id]/head` | Admin | Set department head |

### 7.8 Timeframes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/timeframes` | Auth | List |
| POST | `/api/timeframes` | Admin/Exec | Create |
| PUT | `/api/timeframes/[id]` | Admin/Exec | Update |
| DELETE | `/api/timeframes/[id]` | Admin/Exec | Delete |

### 7.9 Settings & Config

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/POST | `/api/labels` | Auth | Objective labels |
| GET/PUT | `/api/user-preferences` | Auth | User view preferences |
| GET/PUT | `/api/settings/okr-rules` | Admin | OKR rules config |
| GET/PUT | `/api/settings/branding` | Admin | Branding config |
| GET/PUT | `/api/settings/integrations` | Admin | Integrations config |
| GET/PUT | `/api/settings/notification-defaults` | Admin | Org notification defaults |
| GET/PUT | `/api/settings/letter-permissions/roles` | Admin | Letter role × permission matrix |
| GET/POST | `/api/settings/letter-permissions/users` | Admin | Per-user letter permission overrides |
| GET/DELETE | `/api/settings/letter-permissions/users/[userId]` | Admin | Override detail + delete |
| POST | `/api/email/test` | Admin | SMTP test email |

### 7.10 Notifications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/PUT | `/api/notifications/preferences` | Auth | Per-user notification preferences |

### 7.11 Letters

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/letters` | Auth | List (filter by status, type, search, mine) |
| POST | `/api/letters` | Auth | Create draft + allocate reference number |
| GET | `/api/letters/[id]` | Auth | Letter detail |
| PATCH | `/api/letters/[id]` | Auth | Update editable fields |
| DELETE | `/api/letters/[id]` | Auth | Delete DRAFT letter |
| POST | `/api/letters/[id]/submit` | Auth | DRAFT → SUBMITTED |
| POST | `/api/letters/[id]/approve` | Auth (letter:approve) | SUBMITTED → APPROVED |
| POST | `/api/letters/[id]/reject` | Auth (letter:approve) | SUBMITTED → DRAFT |
| POST | `/api/letters/[id]/send` | Auth | APPROVED → SENT |
| POST | `/api/letters/[id]/archive` | Auth | SENT → ARCHIVED |
| DELETE | `/api/letters/[id]/archive` | Admin | Unarchive |
| GET | `/api/letters/[id]/activity` | Auth | Activity log |
| POST | `/api/letters/[id]/views` | Auth | View beacon |
| POST | `/api/letters/[id]/pdf` | Auth | Render HTML + missing placeholders |
| GET | `/api/letters/[id]/html` | Auth | Raw HTML body |
| GET | `/api/letters/[id]/docx` | Auth | DOCX download |
| POST | `/api/letters/[id]/enclosures` | Auth | Register enclosure |
| DELETE | `/api/letters/[id]/enclosures/[enclosureId]` | Auth | Remove enclosure |
| GET | `/api/letters/odoo/contacts` | Auth | Mocked Odoo contact typeahead |
| GET/POST | `/api/letters/types` | Admin | Letter type definitions |

### 7.12 Daily Trip Plan (DTP)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/dtp/plans` | Auth | List plans |
| POST | `/api/dtp/plans` | Auth | Create plan |
| GET/PATCH/DELETE | `/api/dtp/plans/[id]` | Auth | Plan CRUD |
| POST | `/api/dtp/plans/[id]/submit` | Auth | Submit plan |
| POST | `/api/dtp/plans/[id]/withdraw` | Auth | Withdraw submission |
| POST | `/api/dtp/plans/[id]/cancel` | Auth | Cancel plan |
| POST | `/api/dtp/plans/[id]/endorse` | Auth | Manager endorsement |
| POST | `/api/dtp/plans/[id]/approve` | Coordinator | Approve plan |
| POST | `/api/dtp/plans/[id]/reject` | Coordinator | Reject plan |
| POST | `/api/dtp/plans/[id]/return` | Coordinator | Return for revision |
| POST | `/api/dtp/plans/[id]/acknowledge` | Auth | Acknowledge coordinator adjustments |
| POST | `/api/dtp/plans/[id]/clone` | Auth | Clone plan |
| GET/POST | `/api/dtp/plans/[id]/stops` | Auth | Plan stops |
| GET/PUT/DELETE | `/api/dtp/plans/[id]/stops/[stopId]` | Auth | Stop CRUD |
| GET | `/api/dtp/runsheet/[driverId]/[date]` | Auth | Driver run sheet |
| POST | `/api/dtp/runsheet/assign` | Pool | Assign driver to plan |
| GET | `/api/dtp/sheet/[deptId]/[date]` | Auth | Department movement sheet |
| PUT | `/api/dtp/legs/[id]/status` | Driver | Update leg status |
| GET | `/api/dtp/drivers` | Auth | List drivers |
| GET | `/api/dtp/vehicles` | Auth | List vehicles |
| GET | `/api/dtp/trip-types` | Auth | List trip types |
| GET/PUT/DELETE | `/api/dtp/trip-types/[id]` | Admin | Trip type CRUD |
| GET/PUT | `/api/dtp/settings` | Admin | DTP settings |

### 7.13 Telegram

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/telegram/webhook` | Token (`X-Telegram-Bot-Api-Secret-Token`) | Receive Telegram updates |
| GET/POST/DELETE | `/api/telegram/admin/setup` | Admin | Bot identity + webhook management |

### 7.14 Admin

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/admin/ai-logs` | Admin/Exec | AI generation audit logs |
| GET/PUT | `/api/admin/org-settings` | Admin | Organization settings (CEO, feature flags) |

### 7.15 Reports & Analytics

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/initiative-report` | Auth | Daily initiative report data |
| GET | `/api/dashboards/ceo` | Auth | CEO dashboard payload |
| GET | `/api/dashboards/me` | Auth | Personal dashboard payload |
| GET | `/api/gantt` | Auth | Gantt chart data (role-scoped) |
| GET | `/api/filters/progress-timeseries` | Auth | Progress timeseries for filters workspace |
| GET | `/api/my/nav-progress` | Auth | Nav sidebar progress ring |

### 7.16 Misc

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/health` | Public | Health check |
| POST | `/api/client-errors` | Auth | Browser error reporting |
| GET | `/api/search` | Auth | Global search |
| GET/POST | `/api/watchers` | Auth | Opt-in watchers |
| GET/POST/DELETE | `/api/favorites` | Auth | Starred objectives |
| GET | `/api/okr-hierarchy` | Auth | Full OKR hierarchy |
| GET | `/api/org/tree` | Auth | Org tree |
| GET | `/api/org/diagnostics` | Admin | Org structure diagnostics |
| GET | `/api/risks` | Auth | List risks |
| POST | `/api/risks` | Auth | Create risk |
| GET/PUT/DELETE | `/api/risks/[id]` | Auth | Risk CRUD |

### 7.17 Cron Jobs

All cron routes: `POST /api/cron/*` — require Bearer `CRON_SECRET` header.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/cron/confidence-calc` | Bi-weekly confidence snapshots |
| POST | `/api/cron/auto-confidence` | Auto-confidence recalculation |
| POST | `/api/cron/weekly-digest` | Weekly email digest drain |
| POST | `/api/cron/daily-digest` | Daily email digest drain |
| POST | `/api/cron/notifications` | Unified notification cron (`?job=daily|weekly|monthly|escalation|todos|timeframes|admin-weekly|admin-monthly`) |
| POST | `/api/cron/sprint-tick` | Sprint lifecycle tick (PLANNING→ACTIVE→COMPLETED) |
| POST | `/api/cron/sprint-deadlines` | Sprint deadline warnings |
| POST | `/api/cron/sprint-migration-check` | Legacy sprint migration status check |
| POST | `/api/cron/prune-activity` | Prune old activity log rows |
| POST | `/api/cron/performance-nudge` | Bundled score-free weekly performance focus notification |

### 7.18 Performance & Scorecard

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/POST | `/api/performance/templates` | Auth/Admin create | List/create scorecard templates |
| GET/PATCH | `/api/performance/templates/[id]` | Auth/Admin write | Template detail and configuration |
| PUT | `/api/performance/templates/[id]/builder` | Admin | Replace draft tiers and criteria |
| POST | `/api/performance/templates/[id]/{publish,fork,archive,culture-block}` | Admin | Template lifecycle and culture insertion |
| GET/PUT/DELETE | `/api/performance/template-mappings`, `/api/performance/metric-mappings` | Admin | Role and employee metric mappings |
| GET/POST | `/api/performance/cycles` | Auth/Admin create | List/create cycles |
| GET/POST | `/api/performance/cycles/[id]`, `/api/performance/cycles/[id]/{open,close}` | Scoped/Admin | Cycle detail and lifecycle |
| GET | `/api/performance/evaluations`, `/api/performance/evaluations/[id]` | Scoped | Actor-specific queue and sealed detail DTO |
| PUT/POST | `/api/performance/evaluations/[id]/{scores,submit,panel,calibration,share-draft,acknowledge,dispute,finalize}` | Scoped | Evaluation workflow |
| GET | `/api/performance/okr-actual/[criterionId]` | Scoped | Period-bounded live metric actual and computed score |
| GET/PUT | `/api/performance/me`, `/api/performance/focuses/[id]/weekly-step` | Employee | My Performance data and weekly commitment |
| GET/PATCH | `/api/performance/actions`, `/api/performance/actions/[id]` | Admin | Recommendation queue and transitions |

---

## 8. Components

### 8.1 Shared UI Primitives (`components/ui/`)

Import: `import { Modal, ConfirmDialog, EmptyState, StatCard, StatGrid, PageHeader } from '@/components/ui'`

| Component | Key Props | Purpose |
|-----------|-----------|---------|
| `Modal` | `open`, `onClose`, `title`, `icon?`, `size?` (sm/md/lg/xl/2xl), `footer?`, `scrollBehavior?`, `stickyHeader?` | All modal dialogs — do NOT build custom wrappers |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm`, `title`, `message`, `variant?` (danger/warning/info), `bullets?`, `isLoading?` | All delete/archive confirmations |
| `EmptyState` | `icon?`, `title`, `description?`, `action?`, `bare?` | All empty-data displays |
| `StatCard` | `label`, `value`, `icon?`, `tone?` (blue/green/yellow/red/purple/gray/indigo), `trend?`, `helperText?` | Dashboard stat displays |
| `StatGrid` | `children`, `columns?` (2/3/4/5) | Stat card grid layouts |
| `PageHeader` | `title`, `description?`, `actions?`, `breadcrumb?` | Page header + action bar |

### 8.2 Shared Components (`components/shared/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `ActivityLogPanel` | `ActivityLogPanel.tsx` | `entityType`, `entityId` | Audit trail for any entity |
| `EntityLink` | `EntityLink.tsx` | `entity`, `type` | Navigation link to entity detail |
| `TimeframeBadge` | `TimeframeBadge.tsx` | `timeframe` | Badge for Q1 2025, etc. |

### 8.3 Layout Components (`components/layout/`)

| Component | Description |
|-----------|-------------|
| `DashboardShell` | Main layout wrapper: sidebar + header + content area |
| `DashboardTitleContext` | Context for setting page titles from child pages |

### 8.4 Objectives (`features/objectives/` — 18 exports)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateObjectiveModal` | Form modal | Uses Modal + useReferenceData |
| `EditObjectiveModal` | Form modal | Uses Modal + useReferenceData |
| `DeleteObjectiveModal` | Confirm modal | Uses ConfirmDialog |
| `CloneObjectiveModal` | Form modal | Uses Modal |
| `ObjectivesList` | List | Objective list with filters |
| `NestedObjectivesList` | List | Hierarchical objective view |
| `OKRLevelView` | Server component | Shared for Company + Department OKR pages |
| `CreateObjectiveButton` | Trigger | Opens CreateObjectiveModal (accepts `level` prop) |
| `EditObjectiveButton` | Trigger | |
| `DeleteObjectiveButton` | Trigger | |
| `CloneObjectiveButton` | Trigger | |
| `ArchiveObjectiveButton` | Action | Direct archive |
| `UnarchiveObjectiveButton` | Action | Direct unarchive |

### 8.5 Key Results (`features/key-results/` — 16 exports)

| Component | Type | Notes |
|-----------|------|-------|
| `AddKeyResultModal` | Form modal | Uses Modal |
| `EditKeyResultModal` | Form modal | Uses Modal |
| `DeleteKeyResultModal` | Confirm modal | Uses ConfirmDialog |
| `ArchiveKeyResultModal` | Confirm modal | Uses ConfirmDialog (warning variant) |
| `CloneKeyResultModal` | Form modal | Uses Modal |
| `CreateCheckInModal` | Form modal | Sticky header + internal scroll + chart |
| `KeyResultsList` | List | KRs under an objective |
| `AddKeyResultButton` | Trigger | |
| `EditKeyResultButton` | Trigger | |
| `DeleteKeyResultButton` | Trigger | |
| `CloneKeyResultButton` | Trigger | |
| `ArchiveKeyResultButton` | Trigger | |
| `UnarchiveKeyResultButton` | Action | |

### 8.6 Todos (`features/todos/` — 11 exports)

| Component | Type | Notes |
|-----------|------|-------|
| `EditTodoModal` | Form modal | Uses Modal |
| `DeleteTodoModal` | Confirm modal | Uses ConfirmDialog |
| `AssignUserModal` | Form modal | Uses Modal |
| `SetDueDateModal` | Form modal | Uses Modal |
| `ToDoList` | List | Main todo list with status toggle |
| `MyTasksList` | List | User's assigned tasks |
| `EditTodoButton` | Trigger | |
| `DeleteTodoButton` | Trigger | |
| `AssignUserButton` | Trigger | |
| `SetDueDateButton` | Trigger | |

### 8.7 Goals (`features/goals/` — 9 exports)

| Component | Notes |
|-----------|-------|
| `GoalsListView` | List view |
| `GoalsTable` | Table view |
| `GoalsFeedView` | Feed view |
| `GoalsFilterBar` | Filter bar |
| `MyTeamView` | Team goals |
| `CreateGoalModal` | Uses Modal + useReferenceData |

### 8.8 Sprints (`features/sprints/` — 3 exports)

| Component | Notes |
|-----------|-------|
| `SprintBoardClient` | Trello-style kanban board |
| `SprintCardModal` | Card detail/edit |
| `SprintsListClient` | Sprint list |

### 8.9 Letters (`features/letters/`)

| Component | Notes |
|-----------|-------|
| `LettersPageClient` | Letters list with status tabs + filters |
| `LettersTable` | Table of letters |
| `CreateLetterModal` | Create draft + allocate reference |
| `LetterFormClient` | Full letter editor (body, recipient, signatory) |
| `EnclosuresPanel` | Enclosure management |
| `PdfPreviewPanel` | PDF/print preview |
| `CustomerLookup` | Odoo contact typeahead |

### 8.10 Filters Workspace (`features/filters/`)

| Component | Notes |
|-----------|-------|
| `ObjectiveDetailModal` | Objective detail panel in filters view |
| `KeyResultDetailModal` | KR detail panel in filters view |
| `ResultsList` | Grouped results list |

### 8.11 Daily Trip Plan (`features/daily-trip-plan/`)

Import: `import { PlanEditor, CoordinatorConsole, MovementSheetView, RunSheetView, PoolConsole, TravelSettingsForm, TravelHome, dtpApi } from '@/features/daily-trip-plan'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `TravelHome` | — | Employee home — recent plans + create CTA |
| `PlanEditor` | `planId`, `isRequester?` | Two-column plan detail + stops + timeline |
| `StopList` | `planId`, `stops`, `readOnly?` | Stop cards with edit/remove |
| `StopEditorModal` | `open`, `onClose`, `initial?`, `onSubmit` | Stop form (where/when/how) |
| `PlanTimeline` | `plan`, `events?` | State-machine timeline |
| `StatusBadge` | `status` | DTP status pill |
| `CoordinatorActions` | `plan` | Approve/Return/Reject bar |
| `CoordinatorConsole` | — | Pending plans + KPIs |
| `MovementSheetView` | `deptId`, `date` | Printable movement sheet |
| `RunSheetView` | `driverId`, `date`, `driverMode?` | Driver run sheet |
| `PoolConsole` | — | Pool Coordinator assignment |
| `TravelSettingsForm` | — | Admin settings form |
| `dtpApi` | — | Typed fetch client |

**DTP Hooks:** `usePlans`, `usePlan`, `useTripTypes`, `useDrivers`, `useVehicles`, `useMovementSheet`, `useRunSheet`, `useDtpSettings`, `useCreateOrOpenPlan`, `useAddStop`, `useUpdateStop`, `useDeleteStop`, `usePlanTransition`, `useAssignDriver`, `useSetLegStatus`, `useUpdateSettings`, `useInvalidatePlan`

### 8.11A Performance & Scorecard (`features/performance/`)

| Component | Purpose |
|-----------|---------|
| `PerformanceHome` | Employee focus, weekly step, and review history |
| `TemplatesWorkspace`, `TemplateBuilder` | Template/version management and builder |
| `RoleMappingManager`, `MetricMappingManager` | Template resolution and employee KR source mapping |
| `CyclesWorkspace`, `EvaluatorQueue` | Cycle administration and evaluator work queue |
| `ScoringWorkspace`, `CalibrationPanel` | Scoring, live metric actuals, consolidation workflow, and calibration |
| `PerformanceReport` | Employee-safe shared/final report and response |
| `ActionsWorkspace` | Development/reward recommendation queue |

### 8.12 Settings Components (`components/settings/`)

| Component | Notes |
|-----------|-------|
| `UserManagement` | User CRUD (uses useState — inconsistent) |
| `TeamsManagement` | Team CRUD |
| `OKRRulesManagement` | react-hook-form |
| `BrandingManagement` | react-hook-form |
| `IntegrationsManagement` | react-hook-form |
| `AuditLogsView` | Audit log viewer |
| `LetterPermissionsManagement` | 3-tab: Role Matrix / User Overrides / Letter Types |

### 8.13 Plans Components (`components/plans/`)

| Component | Notes |
|-----------|-------|
| `PlansList` | List view with List/Gantt toggle. Server-rendered with KR/initiative/NCS metrics |
| `PlansGantt` | DHTMLX-Gantt. Objective→KR hierarchy, dependency arrows, status/confidence pills, zoom (Week/Month/Quarter/Year) |

### 8.14 Dashboard Components (`components/dashboard/`)

| Component | Notes |
|-----------|-------|
| `MyOKRsPage` | User's OKR overview (has duplicate stat card markup — refactor pending) |
| Various dashboard widgets | Stats, charts, quick actions |

---

## 9. Shared Hooks

Import: `import { useDebounce, useUsersForSelection, useTimeframes, useDepartments, useReferenceData } from '@/hooks'`

| Hook | Returns | Description |
|------|---------|-------------|
| `useDebounce(value, delay)` | `T` | Debounce any value |
| `useUsersForSelection()` | `{ users, isLoading, isError, refetch }` | Active users for dropdowns (React Query, 1-min cache) |
| `useTimeframes({ activeOnly? })` | `{ timeframes, isLoading, isError, refetch }` | Timeframes for dropdowns |
| `useDepartments()` | `{ departments, isLoading, isError, refetch }` | Departments with member counts |
| `useReferenceData({ users?, timeframes?, departments?, activeTimeframesOnly? })` | `{ users, timeframes, departments, isLoading }` | Combined hook for forms — parallel fetches |
| `useMediaQuery(query)` | `boolean` | Responsive breakpoint detection |
| `useViewTracker(entityType, entityId)` | — | Fires view-tracking beacon once per entity per session |

---

## 10. State Management (Zustand)

| Store | File | State |
|-------|------|-------|
| `useTodoStore` | `lib/stores/todo-store.ts` | Todo filters (`status`, `priority`, `assigneeId`), selected todo IDs |
| `useNotificationStore` | `lib/stores/notification-store.ts` | Toast notification messages |
| `useUserPrefsStore` | `lib/stores/user-prefs-store.ts` | UI preferences (`todoViewMode`: modal/sidebar) |
| `useThemeStore` | `lib/stores/theme-store.ts` | Light/dark theme selection |
| `useCmdkStore` | `lib/stores/cmdk-store.ts` | Command palette open/close state |

---

## 11. Permissions & RBAC

Source of truth: `lib/permissions.ts` (wrapped by `lib/rbac.ts` as unified API `can(action, resource, actor)`).

### 11.1 Role Hierarchy

```
ADMIN > EXECUTIVE > DEPARTMENT_LEAD > EMPLOYEE
```

### 11.2 Objective Permissions

| Action | ADMIN | EXECUTIVE | DEPARTMENT_LEAD | EMPLOYEE |
|--------|-------|-----------|-----------------|----------|
| Create COMPANY objective | ✅ | ✅ | ❌ | ❌ |
| Create DEPARTMENT objective | ✅ | ✅ | ✅ (own dept) | ❌ |
| Create INDIVIDUAL objective | ✅ | ✅ | ✅ | ✅ (own) |
| Edit any objective | ✅ | ✅ | dept + own | own only |
| Archive/delete objective | ✅ | ✅ | dept + own | own only |
| See PRIVATE objectives | ✅ | ✅ | owner's manager only | owner only |

### 11.3 System Permissions

| Action | ADMIN | EXECUTIVE | DEPARTMENT_LEAD | EMPLOYEE |
|--------|-------|-----------|-----------------|----------|
| Manage users | ✅ | ❌ | ❌ | ❌ |
| Manage departments | ✅ | view own | view own | view own |
| Manage timeframes | ✅ | ✅ | ❌ | ❌ |
| Set org notification defaults | ✅ | ❌ | ❌ | ❌ |
| Trigger cron | ✅ | ❌ | ❌ | ❌ |
| Approve alignment requests | ✅ | ✅ | own reports | ❌ |
| Comment / mention | ✅ | ✅ | ✅ | ✅ |
| Watch any visible entity | ✅ | ✅ | ✅ | ✅ |

### 11.4 Letter Permissions (DB-driven)

Stored in `LetterRolePermission` (role matrix) and `LetterUserPermission` (per-user overrides). Resolved by `lib/letter-permissions.ts::checkLetterPermission()`. Editable at runtime via Settings > Letter Permissions (Admin only).

Key permissions: `letter.read`, `letter.create`, `letter.edit`, `letter.delete`, `letter.submit`, `letter.approve`, `letter.send`, `letter.archive`.

### 11.5 DTP Permissions

Role tags: `poolCoordinatorIds` (CSV in DtpSettings), `operationsManagerIds` (CSV in DtpSettings), `primaryCoordinatorId` / `alternateCoordinatorId` (per-department). Coordinators approve/reject plans. Pool coordinators assign drivers.

---

## 12. Notification System

Source: `lib/notifications/` — `events.ts`, `dispatcher.ts`, `jobs.ts`, `preferences.ts`, `recipients.ts`, `redact.ts`, `deep-link.ts`.

### 12.1 Flow

```
domain code → emit(eventKey, payload)
  ├─ resolveRecipients()     ← role-based routing per event
  ├─ getUserPrefsBulk()      ← per-user override or org default
  ├─ redact()                ← privacy mask for isPrivate entities
  ├─ renderTemplate()        ← subject / text / html
  ├─ write Notification row (in-app)
  └─ email:
       IMMEDIATE → sendMail() now
       DAILY/WEEKLY/MONTHLY → enqueue to EmailDigestQueue
```

### 12.2 Event Categories

| Category | Events (sample) | Mandatory |
|----------|-----------------|-----------|
| `ACCOUNT` | ACCOUNT_INVITE, ACCOUNT_PASSWORD_RESET_REQUESTED, ACCOUNT_ROLE_CHANGED | ✅ Always on |
| `OBJECTIVE` | OBJECTIVE_ASSIGNED, OBJECTIVE_CREATED_IN_TEAM, OBJECTIVE_ARCHIVED | — |
| `KEY_RESULT` | KR_ASSIGNED, KR_AT_RISK, KR_COMPLETED, KR_ARCHIVED | — |
| `CHECK_IN` | CHECKIN_WEEKLY_DUE, CHECKIN_MISSED_7D, CHECKIN_MISSED_14D | — |
| `TODO` | TODO_ASSIGNED, TODO_DUE_TOMORROW, TODO_OVERDUE, SPRINT_STARTING_TOMORROW | — |
| `TIMEFRAME` | TIMEFRAME_OPENED, TIMEFRAME_ENDING_7D, TIMEFRAME_CLOSED | — |
| `ALIGNMENT` | ALIGNMENT_REQUESTED, OBJECTIVE_ALIGNED_CHILD_ADDED | — |
| `COMMENT` | USER_MENTIONED, COMMENT_ON_OWNED_ENTITY | — |
| `ADMIN` | ADMIN_WEEKLY_HEALTH_DIGEST, ADMIN_MONTHLY_EXEC_SUMMARY | — |

### 12.3 Recipient Role Tags

`OWNER`, `MANAGER`, `PARENT_OWNER`, `ADMIN`, `WATCHER`, `TEAM`, `ASSIGNEE`, `EXPLICIT`

Self-suppression: actors never notify themselves (except `EXPLICIT`).

### 12.4 Force-Coalesced to DAILY

`CHECKIN_MISSED_7D`, `CHECKIN_MISSED_14D`, `CHECKIN_WEEKLY_DUE`, `TODO_DUE_TOMORROW`, `TODO_DUE_TODAY`, `TODO_OVERDUE` — always digest regardless of user preference to prevent notification flood.

### 12.5 Privacy Redaction

Entities with `isPrivate: true`: owner + owner's managers + ADMIN see real data; all others get `[Private Objective]` / `[Private Key Result]` placeholder.

---

## 13. Email & Digest System

| Component | File | Description |
|-----------|------|-------------|
| Send function | `lib/email.ts` | `sendMail(userId, subject, html)` — SMTP when `EMAIL_DRIVER=smtp`, otherwise logs only |
| Templates | `lib/email/templates/index.ts` | One template per event key (`subject`, `text`, `html`) |
| Digest template | `lib/email/templates/digest.ts` | Groups items by category — Apple Pro design tokens |
| Digest generation | `lib/weekly-digest.ts` | Weekly digest content generation |
| Digest drain | `lib/notifications/jobs.ts::runDigestDrain()` | Drains `EmailDigestQueue` into bundled emails |
| Escalation | `lib/notifications/jobs.ts::runCheckinEscalation()` | Overdue check-in escalation |
| Todo reminders | `lib/notifications/jobs.ts::runTodoReminders()` | `TODO_DUE_TOMORROW` / `TODO_OVERDUE` |
| Timeframe watcher | `lib/notifications/jobs.ts::runTimeframeWatcher()` | Timeframe lifecycle events |
| Admin digests | `lib/notifications/jobs.ts::runAdminDigests()` | Weekly/monthly admin summaries |

---

## 14. Cron Jobs

All cron routes secured by Bearer `CRON_SECRET`.

| Job | Route | Recommended Schedule | Purpose |
|-----|-------|---------------------|---------|
| Confidence calc | `POST /api/cron/confidence-calc` | Bi-weekly | Objective + KR confidence snapshots |
| Auto-confidence | `POST /api/cron/auto-confidence` | Daily | Auto-recalculate confidence |
| Daily digest | `POST /api/cron/daily-digest` | Daily | Drain DAILY email queue |
| Weekly digest | `POST /api/cron/weekly-digest` | Weekly (Monday) | Drain WEEKLY queue + weekly summary |
| Notification jobs | `POST /api/cron/notifications?job=` | Various | `daily`, `weekly`, `monthly`, `escalation`, `todos`, `timeframes`, `admin-weekly`, `admin-monthly` |
| Sprint tick | `POST /api/cron/sprint-tick` | Daily | Sprint lifecycle state transitions |
| Sprint deadlines | `POST /api/cron/sprint-deadlines` | Daily | Sprint deadline warnings |
| Prune activity | `POST /api/cron/prune-activity` | Monthly | Remove old activity log rows |
| Sprint migration check | `POST /api/cron/sprint-migration-check` | One-time | Legacy sprint migration status |

---

## 15. Library Utilities

### 15.1 API Route Helpers (`lib/api/`)

| Helper | Usage |
|--------|-------|
| `withAuth(handler)` | Enforces session. Returns 401 if absent. Auto-catches errors. |
| `withRole(roles, handler)` | Enforces session + role whitelist. Returns 403 if not allowed. |
| `apiSuccess(data, opts?)` | `{ success: true, data }` — 200 |
| `apiPaginated(data, pagination, opts?)` | `{ success: true, data, pagination }` — 200 |
| `apiError(error, opts?)` | `{ success: false, error }` — 500 default |
| `apiUnauthorized(msg?)` | 401 |
| `apiForbidden(msg?)` | 403 |
| `apiNotFound(msg?)` | 404 |
| `apiBadRequest(msg, details?)` | 400 |
| `apiValidationError(msg, details?)` | 422 |
| `apiConflict(msg, details?)` | 409 |
| `handleApiError(error)` | P2002 → 409, P2025 → 404, else 500 |

### 15.2 Core Utilities (`lib/utils.ts`)

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + twMerge) |
| `formatDate(date, format?)` | date-fns formatting |
| `formatRelativeTime(date)` | "3 hours ago" |
| `calculateProgress(current, target, start?)` | Progress % (0-100) |
| `getProgressColor(progress)` | Tailwind color classes by progress % |
| `getProgressBarClass(progress)` | Solid bar fill class |
| `getConfidenceColor(confidence)` | Tailwind classes for ON_TRACK / AT_RISK / OFF_TRACK |
| `truncateText(text, maxLength)` | Truncate with ellipsis |
| `capitalizeFirst(str)` | Capitalize first letter |
| `isValidEmail(email)` | Email regex |
| `getErrorMessage(error)` | Extract message from unknown error |

### 15.3 Business Logic

| File | Key Export | Description |
|------|-----------|-------------|
| `lib/objectiveProgress.ts` | `recalcNodeAndAncestors()`, `recalcObjectiveStoredProgress()` | LOOSE + STRICT_DEPENDENCY progress recalculation |
| `lib/confidence-calc.ts` | `runConfidenceCalc()` | Score = time-elapsed vs progress (40%) + velocity (25%) + initiative completion (15%) + staleness (20%) |
| `lib/activity-log.ts` | `recordActivity()` | Append-only audit trail |
| `lib/letters.ts` | `allocateReferenceNumber()` | `360G/LT/{CL\|OF\|GR}/{SEQ}/{YEAR}` allocation |
| `lib/letter-permissions.ts` | `checkLetterPermission()` | Async permission resolver: DB row → static fallback |
| `lib/view-tracking.ts` | `trackView()` | One row per (user, entity, day) |
| `lib/pusher.ts` | `pushToUser()` | Real-time Pusher push |
| `lib/dashboard-navigation.ts` | `navGroups` | Sidebar nav structure |
| `lib/profileMetrics.ts` | `getUserMetrics()` | User activity metrics |
| `lib/reportDashboard.ts` | `loadDashboardPayload()` | CEO + personal dashboard data |
| `lib/keyResultChart.ts` | `buildChartData()` | KR progress chart data |
| `lib/timeframe-utils.ts` | `isTimeframeActive()`, `getTimeframeDates()` | Date range utilities |
| `lib/check-in-cadence.ts` | `isCheckinDue()` | Validate check-in frequency |

---

## 16. Layouts

| File | Scope | Description |
|------|-------|-------------|
| `app/layout.tsx` | Root | Fonts, providers, toast container |
| `app/dashboard/layout.tsx` | Dashboard | `DashboardShell` wrapper — sidebar + header |
| `app/dashboard/settings/layout.tsx` | Settings | Nested settings layout |

---

## 17. Design System & Conventions

### 17.1 CSS Tokens (Apple Pro)

Light/dark theme via CSS variables. Key tokens:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--app-bg` | `#F2F2F7` | — | App background |
| `--card-bg` | `#FFFFFF` | — | Card surface |
| `--primary` | `#007AFF` | — | Primary actions |
| `--ink` | `#1D1D1F` | — | Primary text |
| `--secondary-ink` | `#8E8E93` | — | Secondary text |
| `--divider` | `#E5E5EA` | — | Borders/dividers |

Tone classes: `success-*`, `primary-*`, `warning-*`, `danger-*` — do NOT hardcode hex colors.

### 17.2 Code Conventions

- **Routes** (`app/`): thin composition only — no business logic, no Prisma, no inline fetches
- **Features**: self-contained with `components/`, `hooks/`, `services/`, `types.ts`, `index.ts` barrel
- **Cross-feature imports**: go through barrels (`@/features/name`) — never import internal files directly
- **Forms**: `react-hook-form` — no raw `useState` for form state
- **Modals**: `components/ui/Modal` — never build custom modal wrappers
- **Confirms**: `components/ui/ConfirmDialog` — never use `window.confirm()`
- **Empty states**: `components/ui/EmptyState`
- **Reference data**: `useUsersForSelection`, `useTimeframes`, `useDepartments` — never inline-fetch
- **API auth**: `withAuth` / `withRole` — never manually call `getServerSessionSafe()` + return 401
- **API response**: always `{ success, data?, error?, pagination? }` — never `{ todos: [] }` or `{ ok: true }`
- **Conditional styles**: `cn()` from `lib/utils` — never string concatenation
- **Types**: all shared types in `types/index.ts` — never re-declare in component files
- **Permissions**: `lib/permissions.ts` — never add permission logic to `lib/utils.ts` or inline

### 17.3 After Completing Work

Always update after every code change:
1. `docs/CHANGELOG_AI.md` — date, summary, files changed
2. `docs/MASTER_REFERENCE.md` — update the relevant section
3. `docs/FEATURE_STATUS.md` — if module status changed
4. `docs/SITEMAP.md` — if routes changed
5. `docs/COMPONENT_CATALOG.md` — if reusable component added/changed

---

## 18. Infrastructure & Deployment

| Concern | Details |
|---------|---------|
| Hosting | VPS, PM2 process manager, Nginx reverse proxy |
| Database | PostgreSQL — `prisma db push` (no migration history) |
| Schema changes | `scripts/preflight.sql` runs in CI before deploy |
| CI secrets | Repo-level GitHub secrets |
| Zero-downtime | PM2 graceful reload |
| Cron | System cron calling API routes with `CRON_SECRET` |
| Email | `EMAIL_DRIVER=smtp` + SMTP env vars; falls back to log-only |
| Real-time | Pusher — placeholder creds (`dev-placeholder`) will fail; set real creds in env |
| AI | Anthropic API (Claude Sonnet 4.6) — `ANTHROPIC_API_KEY` env var |
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_SECRET` env vars |

### 18.1 Required Environment Variables

```
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER
EMAIL_DRIVER (smtp | log)
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
CRON_SECRET
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_SECRET
```

---

## 19. Feature Status Summary

| Feature | Status |
|---------|--------|
| Authentication (NextAuth, JWT) | ✅ DONE |
| RBAC (Permissions) | ✅ DONE |
| Objectives CRUD + hierarchy + cloning | ✅ DONE (needs modal refactor) |
| Key Results CRUD + check-ins + archiving | ✅ DONE (needs modal refactor) |
| Progress calculation (LOOSE + STRICT_DEPENDENCY) | ✅ DONE |
| Confidence snapshots (bi-weekly + cron) | ✅ DONE |
| Todos / Initiatives CRUD | ✅ DONE (needs refactor) |
| Todo comments, checklists, attachments | ✅ DONE |
| Initiative daily updates | ✅ DONE |
| Sprint board (kanban) | ✅ DONE |
| AI Sprint Planning | 🔄 IN PROGRESS |
| Goals view (table/feed/team) | ✅ DONE |
| Filters Workspace (3-tab analytical) | ✅ DONE |
| Plans page (List + Gantt) | ✅ DONE |
| Alignment Map | ✅ DONE |
| Company OKRs / Department OKRs | ✅ DONE |
| Dashboard (home, my-okrs, my-tasks) | ✅ DONE |
| Reports & Analytics | ✅ DONE |
| Activity Feed | ✅ DONE |
| User Management | ✅ DONE |
| Team Management | ✅ DONE |
| Org Hierarchy visualization | ✅ DONE |
| Timeframe Management | ✅ DONE |
| Notification System (40+ events, dispatcher) | ✅ DONE |
| Email Delivery + Digests | ✅ DONE |
| Real-time (Pusher) | ✅ DONE |
| Watchers | ✅ DONE |
| Favorites | ✅ DONE |
| Settings (profile, account, OKR rules, branding) | ✅ DONE |
| Audit Logs | ✅ DONE |
| Letter Management (full workflow) | ✅ DONE (PDF/Odoo mocked) |
| Letter Permissions (DB-driven) | ✅ DONE |
| Risk Register | ✅ DONE |
| Activity Logging (audit trail) | ✅ DONE |
| View Tracking | ✅ DONE |
| Client Error Reporting | ✅ DONE |
| AI Generation Logging | ✅ DONE |
| Performance & Scorecard core review lifecycle | 🔄 IN PROGRESS |
| Daily Trip Plan (DTP) — web Phase 1 | 🔄 IN PROGRESS |
| DTP — Distance Matrix / VRP Optimizer | 🗓 PLANNED (Phase 2) |
| DTP — Mobile App (Flutter) | 🗓 PLANNED (Phase 2) |
| Telegram Bot — Stage 1 (Q&A) | 🔄 IN PROGRESS |
| Telegram Bot — Stage 2 (Odoo digests) | ⏸ DEFERRED |
| Telegram Bot — Stage 3 (tool use + admin UI) | ⏸ DEFERRED |
| Letter Reporting view | 🗓 PLANNED |
| Letter Notifications on transitions | 🗓 PLANNED |
| Letter Template management screen | 🗓 PLANNED |

---

## 20. Known Issues & Refactor Backlog

| Area | Issue | Priority |
|------|-------|----------|
| Objectives modals | 19 modal wrappers with identical structure → consolidate to `components/ui/Modal` | Medium |
| KR modals | Same duplication as objectives | Medium |
| `ToDoList` vs `MyTasksList` | Duplicate status toggle logic | Medium |
| `company-okrs` vs `department-okrs` | Near-identical pages — DONE via `OKRLevelView` but old pages still exist | Low |
| `UserManagement` | Uses `useState` instead of `react-hook-form` — inconsistent | Low |
| `GoalsTable`, `GoalsFeedView`, `MyTeamView` | Duplicate empty-state blocks | Low |
| Sprint legacy tables | `SprintActivity`, `SprintActivityComment`, `SprintActivityTask` — DEPRECATED, slated for removal | Planned |
| Pusher placeholder creds | `dev-placeholder`/`your-*`/`0` pass truthy guard → every mutation awaits 400 from Pusher | Blocker if real-time needed |
| Letter PDF | Returns server-rendered HTML — needs Puppeteer or `@react-pdf/renderer` | Planned |
| Letter Odoo integration | Returns stub roster — needs real Odoo `res.partner` API | Planned |
| Notification dedup upper bound | No sweeper for old unread notifications → `Notification` table grows unbounded | Medium |
| Notification quiet hours | All emails fire in server time — no per-user timezone or quiet hours | Low |
| Watcher UI | `Watcher` rows can only be created programmatically — no Watch button in UI | Low |
| Email batch sends | Sequential sends in digest drain — slow for large orgs | Medium |
| DTP Distance Matrix | 10-minute placeholder — no real Google/HERE integration | Phase 2 |
| Performance Excel seed | Required scorecard source workbooks are absent | Blocked |
| Performance report visuals | Radar, trend, and OKR-attainment sections remain | Planned |
| Performance audit integration | Shared ActivityLog has no performance entity foreign key | Planned |
