# OKR Management System — Master Reference

> **This is the single authoritative reference document for the entire system.**
> It is generated from a full traversal of all code, schemas, routes, components, and docs.
> **Keep it up-to-date:** after every feature addition or significant change, update the relevant section(s) here, then update `docs/CHANGELOG_AI.md`.
>
> Last updated: 2026-09-25 — full-project remediation (session okr-mgt-75), **complete**: Waves 1–3, Wave 4 G1–G7
> (OKR pages consolidated into My OKRs / OKR Explorer / Insights with 14 permanent redirects, projects DOCX import +
> provenance + background processing, AI-guided project creation, portal Planned-vs-Actual and Change Requests tabs,
> filters sort, scrum server drafts), follow-ups H2–H6 / C1–C6 / B1–B2 (comment attachments for activities and scrum +
> staging cleanup, OKR realtime + comment access, `test:core`, thin pages) and Next 14.2.35. Verified: tsc 0 · lint 0
> errors · 15 test scripts green (1,661 runs) · `next build` 209 pages. Deploy: §18.2. Open items: §20.
> Plan and decisions: `docs/REMEDIATION_PLAN_2026-09-25.md`.

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
- Capture **Daily Scrum updates** with mood privacy, working-day rules, blockers, wins, and OKR linkage foundations
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
| Next.js | 14 (`14.2.35`, 2026-09-25) | App Router, API routes, SSR. `images.unoptimized: true`. Next 14 is EOL; the remaining advisories are fixed only in 15.5.x (open decision) |
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Prisma | Latest | ORM — PostgreSQL (prod), schema-push deployment |
| TanStack Query | Latest | Server state caching |
| Zustand | Latest | Client-side stores |
| Tailwind CSS | 3 | Styling with design tokens |
| react-hook-form | Latest | Form state management |
| NextAuth.js | `^4.24.15` | Authentication (Credentials provider, JWT) |
| Pusher | Latest | Real-time push notifications |
| date-fns | Latest | Date formatting |
| Lucide React | Latest | Icons |
| dhtmlx-gantt | Latest | OKR Explorer Timeline view (`PlansGantt`) |
| @tanstack/react-virtual | Latest | Custom Project Management Gantt row virtualization |
| ESLint (`next/core-web-vitals`, `eslint-config-next` 14.2.35) | — | `.eslintrc.json` (2026-09-25); `npm run lint` runs in CI; `rules-of-hooks` is an error |

**Database:** PostgreSQL (production). Schema applied via `prisma db push` — no migration history. Changes tracked in `preflight.sql`.

---

## 3. Project Structure

```
OKR-frontend/
├── app/                          # Next.js App Router
│   ├── api/                      # REST API endpoints (170+ route files)
│   ├── auth/                     # Public auth pages (signin, signup, forgot-password, reset-password)
│   ├── portal/                   # Client portal (signin, accept-invite, projects/[id])
│   ├── projects/                 # Full-screen project workspace + public snapshots
│   └── dashboard/                # All authenticated UI pages
│
├── components/                   # Shared React components
│   ├── ui/                       # Primitives: Modal, ConfirmDialog, StatCard, EmptyState, PageHeader
│   ├── layout/                   # DashboardShell, DashboardTitleContext
│   ├── shared/                   # ActivityLogPanel, EntityLink, TimeframeBadge
│   ├── dashboard/                # Dashboard widgets, MyOKRsPage
│   ├── hierarchy/                # Org hierarchy visualization, OkrHierarchyTable (Explorer Tree view)
│   ├── insights/                 # Insights Progress / Period-close panels (2026-09-25)
│   ├── initiative-report/        # Daily updates report grid
│   ├── objective-detail/         # Objective detail sections (KRList + kr-filters, hero, activity tabs)
│   ├── todos/                    # TodoCardModal + Card* sections, LazyTodoCardModal, TodoCard, MentionEditor
│   ├── sprints/                  # Sprint helper modals/popovers (board lives in features/sprints)
│   ├── settings/                 # All settings panels
│   ├── plans/                    # PlansGantt (Explorer Timeline view)
│   ├── profile/                  # User profile components
│   └── reports/                  # Report components
│
├── features/                     # Feature modules with barrels (objectives/key-results/todos migrated out of components/)
│   ├── objectives/               # modals, buttons, lists, ObjectiveActionsMenu, services/
│   ├── key-results/              # modals, buttons, KeyResultActionsMenu, KeyResultDetailClient
│   ├── todos/                    # modals, buttons, ToDoList, useTodoStatusToggle
│   ├── sprints/                  # SprintBoardClient (+ Header/Lane/AddTaskInline), SprintsListClient
│   ├── letters/                  # Letter UI + workflow components
│   ├── filters/                  # Filters workspace
│   ├── daily-trip-plan/          # Full DTP feature module
│   ├── scrum/                    # Daily Scrum (S1–S11)
│   ├── auth/                     # Sign-in/up, forgot/reset password
│   ├── projects/                 # Project management + portal UI
│   ├── automations/, performance/, sprints-ai/  # AI Automations, Performance, AI sprint planning
│   └── index.ts                  # Root namespace barrel
│
├── hooks/                        # Shared React hooks
│   ├── useDebounce.ts
│   ├── useUsersForSelection.ts
│   ├── useTimeframes.ts
│   ├── useDepartments.ts
│   ├── useReferenceData.ts
│   ├── useMediaQuery.ts
│   ├── useViewTracker.ts
│   ├── useOkrOptions.ts, useLinkPreview.ts
│   └── useRealtimeRefresh.ts     # 2026-09-25 — debounced Pusher refetch
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
│   ├── telegram/                 # Telegram bot integration (+ access.ts allowlist/limits)
│   ├── okr/                      # visibility-scope, action-permissions, check-in queue, dashboard-home, thresholds, explorer-params, insights-data, realtime, comment-access
│   ├── retired-routes.js         # 14 retired OKR/analytics routes → next.config.js redirects()
│   ├── security/                 # rate-limit, auth-tokens (+ invariant tests)
│   ├── cron-auth.ts              # withCronAuth — every /api/cron/* route
│   ├── background.ts             # runAfterResponse / flushBackgroundWork
│   ├── retention/                # prune-tables (nightly retention)
│   ├── users/                    # deleted-account (admin delete = anonymise)
│   └── chart-colors.ts           # recharts colours from tokens
│
├── types/
│   ├── index.ts                  # All shared TypeScript types
│   ├── scrum.ts                  # Daily Scrum value sets
│   └── next-auth.d.ts            # Session type augmentation
│
├── prisma/
│   ├── schema.prisma             # Source of truth — 147 models (2026-09-25)
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

**Thin pages (2026-09-25, H5/C3/C6).** No `app/**/page.tsx` imports Prisma (was 35). Page data comes from server-only
`*.server.ts` loaders: `features/admin-org/services/org-pages.server.ts`, `features/daily-trip-plan/services/travel-pages.server.ts`,
`features/key-results/services/key-result-detail.server.ts`, `features/letters/services/letter-pages.server.ts`,
`features/objectives/services/{archived-objectives,objective-detail}.server.ts`, `features/projects/services/{portal-pages,snapshot-page}.server.ts`,
`features/sprints/services/sprint-pages.server.ts`, `features/todos/services/todo-pages.server.ts`, `lib/dashboards/home.server.ts`,
`lib/notifications/notifications-page.server.ts`, `lib/okr/{activity-feed,comments-page}.server.ts`, `lib/settings/settings-pages.server.ts`.
New pages must follow the same pattern.

---

## 4. Modules & Features

### 4.1 Core OKR Management

| Module | Status | Paths |
|--------|--------|-------|
| Authentication | DONE (hardened 2026-09-25) | `app/auth/`, `features/auth/`, `lib/auth.ts`, `lib/security/`, `app/api/auth/**`, `app/api/wallpaper/` — rate limits, hashed tokens, `passwordChangedAt` session invalidation, sign-up = inactive EMPLOYEE |
| Objectives CRUD | DONE | `features/objectives/`, `app/api/objectives/` — action menu gated by `lib/okr/action-permissions.ts` |
| Objective Hierarchy | DONE | `features/objectives/components/NestedObjectivesList.tsx` |
| Objective Cloning | DONE | `features/objectives/components/CloneObjectiveModal.tsx` |
| Objective Alignment Map | DONE | `lib/okr/alignment-map-data.ts` — rendered as the OKR Explorer Map view (`/dashboard/okrs-all?view=map`) |
| Key Results CRUD | DONE | `features/key-results/`, `app/api/keyresults/`, `/dashboard/key-results` index |
| KR Check-ins | DONE | `features/key-results/components/CreateCheckInModal.tsx`, check-in picker (`?checkin=1`), `CheckInQueue` |
| KR Archiving | DONE | `features/key-results/components/ArchiveKeyResultModal.tsx` |
| OKR visibility scope | DONE (2026-09-25) | `lib/okr/visibility-scope.ts` — one rule for hierarchy, objectives API, progress, analytics, alignment, timeline, activity, home feed |
| Progress Calculation | DONE | `lib/objectiveProgress.ts` |
| Confidence Snapshots | DONE | `lib/confidence-calc.ts`, `/api/cron/confidence-calc/` |
| Favorites / Starred | DONE | `/api/favorites/` |
| Watchers | DONE | `/api/watchers/` |
| OKR realtime + comments | DONE (2026-09-25, H3/C2) | `lib/okr/realtime.ts` (`private-objective-<id>` / `private-keyresult-<id>`), `lib/okr/comment-access.ts`, `OkrComments` on objective + KR pages — needs real Pusher creds |
| Period Close & Retrospective | DONE | `lib/okr/`, close/retrospective/reopen routes, shared close/reopen UI |
| Roll-forward & Lineage | DONE | Existing clone routes/modals, `RolledFromBanner` |
| End-of-period Report | DONE | `/dashboard/okrs-all/period-report/[timeframeId]`, `/api/reports/period-close/[timeframeId]` |

### 4.2 Work Management

| Module | Status | Paths |
|--------|--------|-------|
| Todos / Initiatives CRUD | DONE (needs refactor) | `features/todos/`, `app/api/todos/` |
| Todo Comments (WYSIWYG) | DONE | `app/api/todos/[id]/comments/` — optimistic post/reply/edit in `CardComments`; notifications run after the response (`lib/background.ts`); attachments are `CommentAttachment` rows (`commentType: 'TODO'`, 2026-09-25) |
| Link previews in card + OKR comments/description | DONE | `app/api/link-preview/`, `lib/link-preview/`, `components/shared/LinkPreview.tsx` — SSRF-safe server fetch, favicon/site/title/description/thumbnail |
| Todo Checklists | DONE | `app/api/todos/[id]/checklists/` |
| Todo Attachments | DONE | `app/api/todos/[id]/attachments/` — type-validated, stored privately (`TODO_UPLOAD_DIR`, default `var/uploads/todos`), served only via the API with safe headers; `/uploads/todos/*` is blocked in middleware |
| Todo Labels | DONE | `app/api/todo-labels/` |
| Initiative Daily Updates | DONE | `app/api/initiatives/[id]/updates/` |
| Sprint Board (Kanban) | DONE | `features/sprints/`, `app/api/sprints/` — invite-only; filter facets people/labels/due/watching/linked (`lib/sprints/board-filters.ts`); live refresh on `private-sprint-<id>` (`lib/sprints/realtime.ts`, `useRealtimeRefresh`) |
| Sprint Cloning | DONE | `/api/sprints/[id]/clone/` |
| Sprint Ending | DONE | `/api/sprints/[id]/end/` |
| AI Sprint Planning | IN PROGRESS | `features/sprints-ai/`, `app/api/sprints/ai/` |

### 4.3 Views & Analytics

| Module | Status | Paths |
|--------|--------|-------|
| Dashboard Home | DONE | `app/dashboard/page.tsx` (loader `lib/dashboards/home.server.ts`) |
| My OKRs | DONE | `app/dashboard/my-okrs/` — own + contributed objectives with the "Needs a check-in" queue on top |
| OKR Explorer | DONE (2026-09-25, G6) | `app/dashboard/okrs-all/` — `?view=list\|tree\|timeline\|map\|analyze`, `?level=all\|company\|department\|mine\|team` (List/Tree); `lib/okr/explorer-params.ts` |
| Insights | DONE (2026-09-25, G6) | `app/dashboard/insights/` — `?tab=overview\|progress\|reports\|initiatives\|period-close`; `lib/okr/insights-data.ts`, `components/insights/`, `components/reports/`, `components/initiative-report/` |
| Filters Workspace | DONE | `features/filters/` — Explorer Analyze view and `/dashboard/key-results`; sort + More menu (G7) |
| Retired routes | RETIRED (2026-09-25) | 14 permanent redirects in `lib/retired-routes.js` (objectives, company/department OKRs, goals, plans, timeline, okr-hierarchy, alignment-map, filters → Explorer; analytics, progress-report, progress, reports, initiative-report → Insights). `features/goals`, `OKRLevelView`, `PlansList` deleted |
| My Tasks | RETIRED | `app/dashboard/my-tasks/` redirects to `/dashboard/todos?scope=assigned` |
| Activity Feed | DONE | `app/dashboard/activity/` |
| Archived Objectives | DONE | `app/dashboard/archived-objectives/` |
| Period Close Report | DONE | `app/dashboard/okrs-all/period-report/[timeframeId]/` (reached from Insights → Period close) |

### 4.4 Letter Management

Full lifecycle workflow: DRAFT → SUBMITTED → APPROVED → SENT → ARCHIVED.

| Module | Status | Paths |
|--------|--------|-------|
| Letter List (filters, search, status tabs) | DONE | `features/letters/components/LettersPageClient.tsx` |
| Create Letter (draft + ref number) | DONE | `features/letters/components/CreateLetterModal.tsx` |
| Letter Form (body, recipient, signatory) | DONE | `features/letters/components/LetterFormClient.tsx` |
| Workflow transitions (submit/approve/reject/send/archive) | DONE | `/api/letters/[id]/{submit,approve,reject,send,archive}` |
| Enclosures | DONE (real files, 2026-09-25) | `features/letters/components/EnclosuresPanel.tsx`, `lib/letter-enclosure-storage.ts` (`LETTER_UPLOAD_DIR`, default `var/uploads/letters`) |
| PDF preview & print | DONE | `/api/letters/[id]/pdf/` — Puppeteer, JS off, request interception |
| Odoo customer typeahead | DONE (mock fallback) | `/api/letters/odoo/contacts/`, `lib/odoo-contacts.ts` |
| Security (sanitise, read guard, sandbox) | DONE (2026-09-25) | `lib/letter-sanitize.ts`, `lib/letter-access.ts` |
| Activity log integration | DONE | `components/shared/ActivityLogPanel.tsx` |
| Letter Permissions (role matrix + per-user overrides) | DONE | `lib/letter-permissions.ts`, `components/settings/LetterPermissionsManagement.tsx` |
| Reporting view (FR-16) | DONE (2026-09-25) | `/dashboard/letters/reports`, `LetterReportsClient`, `lib/letter-reports.ts` — sidebar *Letter Reports* |
| Notifications on transitions | DONE | `lib/letters-notify.ts` (submit/approve/reject/send, `LETTER` category) |
| Template management screen | DONE (2026-09-25) | `/dashboard/letters/templates`, `LetterTemplatesClient`, `lib/letter-templates.ts`, `LetterTemplate` model — letter admin only; sidebar *Letter Templates* (`button.letter.admin`); audited as `LETTER_TEMPLATE` |

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

### 4.6 Daily Scrum

Daily employee scrum updates and team visibility. All stories S1.1–S11.3 are implemented with tests; `docs/SCRUM_MODULE_TRACKER.md` keeps them 🟡 only for the manual walkthrough column.

| Module | Status | Paths |
|--------|--------|-------|
| Schema | DONE | `ScrumUpdate`, `ScrumComment`, `ScrumAbsence`, `ScrumSettings`, `ScrumWinCelebration`, `ScrumSavedView`, `ScrumJobRun`, `ScrumUpdateLink` (+ legacy PM `ScrumLog`) |
| Submit / proxy / previous-day panel | DONE (manual QA pending) | `features/scrum/`, `app/api/scrum/updates/**`, `app/dashboard/scrum/` |
| Wall: month / week / day / streak / analytics views, deep links, saved views | DONE (2026-09-25 F4 completed week view, day filter, deep links, saved-view UI) | `ScrumCalendarViews.tsx`, `ScrumSavedViewsMenu.tsx`, `services/view-state.ts` |
| Blockers (lifecycle, same-blocker prompt, resolve/escalate), wins + celebrate, absences | DONE (F4 UI) | `ScrumBlockerDialogs.tsx`, `ScrumAbsenceModal.tsx`, `/dashboard/scrum/wins` |
| Crons: reminder, finalize, nudge, health (mood alert), weekly | DONE, scheduled | `/api/cron/scrum-*` |
| Performance + PM + OKR links (S9/S11) | DONE | `app/api/scrum/{metrics,links,linkable,attention}`, `ScrumActivityPanel` |
| Security (2026-09-25 S2) | DONE | `services/html.ts` (escape/sanitise), `services/access.ts` (ownership + read checks), audit on settings/saved-views/celebrate/links |
| Server-side drafts | DONE (2026-09-25, G7) | `ScrumUpdate.status = 'DRAFT'`, `features/scrum/services/drafts.ts` — owner-only, no side effects until submit; every counting read spreads `SUBMITTED_SCRUM_UPDATE_WHERE` (`drafts.test.ts`) |
| Comment attachments | DONE (2026-09-25, H2) | `CommentAttachment` `commentType: 'SCRUM'`; files purged when the update is deleted |

### 4.6a AI Automations

Scheduled, user-authored AI tasks. Each firing produces a **Briefing** — a rendered HTML document — which is emailed to configured recipients. Spec: `docs/AI_Automations_Requirements_v1.0.md`. P0 is the complete loop with one tool; later phases add the natural-language compiler and external data sources.

Three layers: **Automation** (config + compiled plan) → **AutomationRun** (audit object) → **AutomationBriefing** (the document; Findings are its payload).

| Module | Status | Paths |
|--------|--------|-------|
| Schema | DONE | `prisma/schema.prisma` (`Automation`, `AutomationRun`, `AutomationBriefing`, `AutomationBriefingRecipient`, `AutomationCredential`, `AutomationSettings`) |
| Schedule engine (8 presets, tz, catch-up, jitter, cron) | DONE | `lib/automations/schedule.ts` + 31 tests |
| Plan validation + template resolution | DONE | `lib/automations/plan.ts` + 16 tests |
| Tool layer (`okr.query`, `odoo.search`, grant-gated registry) | DONE | `lib/automations/tools/` |
| AI synthesis (OpenAI structured output) | DONE | `lib/automations/synthesis.ts` |
| Findings + run-to-run diffing | DONE | `lib/automations/findings.ts` + 12 tests |
| Briefing assembly + 3 renderers (app / email / text) | DONE | `lib/automations/briefing.ts`, `lib/automations/render.ts` + 22 tests |
| Run executor | DONE | `lib/automations/runner.ts` |
| Queue: tick, claim (`FOR UPDATE SKIP LOCKED`), lease reaper | DONE | `lib/automations/service.ts`, `app/api/cron/automations-{tick,reap}/` |
| Worker process | DONE | `scripts/automations-worker.ts` — `npm run worker:automations` (pm2) |
| End-to-end smoke harness (34 checks vs a live Postgres) | DONE | `scripts/smoke-automations.ts` — `npm run smoke:automations` |
| Distribution + delivery ledger | DONE | `lib/automations/delivery.ts` |
| Access control + permission seed | DONE | `lib/automations/access.ts`, `scripts/seed-automation-permissions.ts` |
| UI (list, create/edit form, detail, briefing viewer, briefings list, run transcript, admin settings) | DONE | `features/automations/`, `app/dashboard/automations/`, `app/dashboard/settings/automations/` |
| Test-run affordance + permanent self-test fixture | DONE | `features/automations/components/TestRunPanel.tsx`, `scripts/create-test-automation.ts` — `npm run automations:test-schedule` |
| Finding promotion (FR-12), export to PDF/DOCX (FR-13), month-to-date spend (FR-17) | DONE | `app/api/automations/briefings/[id]/{promote,export}/`, `lib/automations/crud.ts` |
| NL → plan compiler (two-attempt repair, grouped plan diff) | DONE | `lib/automations/compiler.ts`, `lib/automations/plan-diff.ts` + 28 tests |
| Shared Odoo XML-RPC client (read-only by construction) | DONE | `lib/odoo/client.ts` + 13 tests; `lib/odoo-contacts.ts` now consumes it |
| `web.search` / `web.fetch` + source registry | PLANNED | P2b. Provider chosen (Tavily). The tools stay out of `AVAILABLE_TOOL_IDS` in `types/automations.ts` until their SSRF review closes — an unwired tool cannot be granted. |
| Credential vault, site login, mailbox | PLANNED | P3 |

**Proven in production 2026-09-21.** The whole chain ran unattended on the VPS: cron tick → enqueue → worker claim (`FOR UPDATE SKIP LOCKED`) → RBAC-scoped `okr.query` → OpenAI → finding diff → three renderings → DRY_RUN suppression. Trigger was `SCHEDULE`, not `MANUAL`; the slot fired exactly where `computeNextRunAt` predicted; the query returned 20 real rows in 26 ms; the model call cost $0.0628 and its summary was grounded in those rows; and `automation_briefing_recipients` held **zero** rows, which is the safety model working rather than a test asserting it would. Twenty seconds end to end. A permanent fixture — automation "Self-test — scheduler health check", ENABLED, DRY_RUN, `nextRunAt: null` so the tick (which indexes only non-null `nextRunAt`) never picks it up — stays on production for manual re-testing via **Run test run**. **Still unexercised:** a real Odoo call, and browser QA of the authoring form.

**Key invariants.** The compiler runs **once, interactively** — the instruction is the authoring surface, the compiled PlanSpec is the execution surface, and the worker never re-interprets free text. The model never chooses recipients or cost caps, and its grants are derived from the steps it produced. `odoo.search` narrows in three layers, outermost first: `lib/odoo/client.ts` refuses any non-read method before doing I/O; `ODOO_ALLOWED_MODELS` is the outer bound; the grant's `models` list narrows that per automation — intersected, never unioned. An automation executes **as its owner** — every read passes that user's RBAC, and adding a recipient never widens it. Tools are granted, never ambient. Every automation starts in `DRY_RUN`; the `DRY_RUN → REVIEW → AUTO` graduation gates *distribution*, and promotion to AUTO is refused until one run has succeeded. `nextRunAt` is always recomputed from the wall-clock rule in the automation's timezone, never by adding a delta. `@@unique([automationId, scheduledFor])` makes the tick exactly-once per slot.

### 4.7 Telegram Bot

| Module | Status | Notes |
|--------|--------|-------|
| Webhook (message logging + `/ask` command) | IN PROGRESS | Stage 1 — provider `TELEGRAM_AI_PROVIDER`, **default OpenAI** (Anthropic optional). Since 2026-09-25: `/ask` only in `TELEGRAM_ALLOWED_CHAT_IDS`, rate-limited, timing-safe webhook secret (`lib/telegram/access.ts`) |
| Admin setup (register/clear webhook) | IN PROGRESS | `/api/telegram/admin/setup/` |
| Odoo digests | DEFERRED | Stage 2 |
| Tool use + admin UI | DEFERRED | Stage 3 |

### 4.8 Performance & Scorecard

Implementation reference: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_PROPOSAL.md`. Requirement-level status: `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md`.

| Module | Status | Paths |
|--------|--------|-------|
| Scorecard templates, versions, role mappings, metric mappings, culture block | DONE | `features/performance/`, `app/api/performance/templates/`, `app/api/performance/*-mappings/`, `prisma/seed-culture-library.ts` |
| Review cycles, evaluator panels, and issue generation | DONE | `app/api/performance/cycles/`, `lib/performance/cycle-opening.ts` |
| Scoring, OKR metric actuals, consolidation, calibration | IN PROGRESS | `ScoringWorkspace`, `lib/performance/consolidation.ts`, `/api/performance/okr-actual/` |
| Sealed reports, acknowledgement, dispute, finalization | IN PROGRESS | `PerformanceReport`, evaluation workflow APIs |
| Growth focuses, weekly nudge, and development actions | IN PROGRESS | `PerformanceHome`, `ActionsWorkspace`, `/api/cron/performance-nudge` (scheduled daily 05:00 UTC; sends on `weeklyNudgeDay`) |
| Excel scorecard seed (A8) | DONE | `npm run db:seed:performance` — 8 role templates from the source workbooks |
| Audit coverage | DONE (2026-09-25) | every performance mutation calls `recordActivity` (`app/api/performance/audit-coverage.test.ts`) |

### 4.9 Organization & Settings

| Module | Status | Paths |
|--------|--------|-------|
| User Management | DONE | `components/settings/UserManagement.tsx`, `UserDetail.tsx` — ADMIN-only create/delete; delete anonymises (`lib/users/deleted-account.ts`); sign-ups arrive inactive |
| Team Management | DONE | `components/settings/TeamsManagement.tsx` |
| User Directory | DONE | `app/dashboard/org/users/` |
| Team Directory | DONE | `app/dashboard/org/teams/` |
| User Profile | DONE | `app/dashboard/profile/` |
| Org Hierarchy (manager/reports) | DONE | `components/hierarchy/` |
| Timeframe Management | DONE | `app/dashboard/settings/timeframes/` |
| OKR Rules Config | DONE | `components/settings/OKRRulesManagement.tsx` |
| Branding Config | DONE | `components/settings/BrandingManagement.tsx` |
| Integrations Config | DONE | `components/settings/IntegrationsManagement.tsx` — ADMIN-only, secrets masked (2026-09-25) |
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
| Cron auth (fail-closed) | DONE (2026-09-25) | `lib/cron-auth.ts` `withCronAuth` |
| Security headers + CSP | DONE (2026-09-25) | `next.config.js` |
| Rate limiting (in-memory) | DONE (2026-09-25) | `lib/security/rate-limit.ts`, `lib/telegram/access.ts` |
| Deferred background work | DONE (2026-09-25) | `lib/background.ts`, `lib/notifications/fanout.ts` |
| Table retention | DONE (2026-09-25) | `lib/retention/prune-tables.ts` via `/api/cron/prune-notifications` |
| Tokens → CSS vars, dark mode | DONE (2026-09-25) | `tailwind.config.js`, `app/globals.css`, `lib/design-tokens.test.ts` |
| Route loading/error boundaries | DONE (2026-09-25) | 35 `loading.tsx`, 24 `error.tsx`; `SectionError`, `RouteStates` |
| ESLint + CI | DONE (2026-09-25) | `.eslintrc.json`, `.github/workflows/ci.yml` |

---

### 4.10 Project creation & client portal — 2026-09-25 additions

| Module | Status | Paths |
|--------|--------|-------|
| DOCX TOR template, DOCX → schedule, server-owned provenance, background processing (Stories 2.5–2.7) | DONE (G4) | `lib/projects/{project-docx-template,creation-docx-schedule,creation-provenance,creation-processing}.ts` — client edits to provenance sources → 422; upload → 202 + polling `GET …/upload` + `POST …/upload/retry` |
| AI-guided project creation (P3) | DONE (G5/C5), OpenAI only, behind the project-creation AI flag | `lib/projects/ai-guided-*.ts`, `app/api/projects/creation-drafts/[id]/ai-guided/**`, `features/projects/components/creation/ai-guided/**`; bulk assumption decisions; audit `AI_PLAN_GENERATED` / `AI_PLAN_REVISED` / `AI_PLAN_REVISION_UNDONE` |
| Change requests shared with the client | DONE (C4) | `ChangeRequest.visibility` (`INTERNAL` \| `CLIENT_VISIBLE`), `ChangeControlBoard` toggle, portal Change Requests tab |
| Portal Planned vs Actual | DONE (G4) | `app/portal/projects/[id]/PlannedVsActualTab.tsx`, `/api/portal/projects/[id]/planned-vs-actual` |
| Project activity comment attachments | DONE (H2) | `lib/attachments/activity-comments.ts` — internal only, never served to the portal |

## 5. Page List & Sitemap

### 5.1 Public Routes

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Root redirect |
| `/auth/signin` | `app/auth/signin/page.tsx` | Sign-in — thin wrapper over `SignInScreen` (`features/auth`), rotating photo backdrop |
| `/auth/signup` | `app/auth/signup/page.tsx` | Sign-up — creates an inactive EMPLOYEE awaiting admin activation |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | Request a reset link (no enumeration) |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Set a password from a reset/invite token |
| `/portal/signin`, `/portal/accept-invite`, `/portal`, `/portal/projects/[id]` | `app/portal/**` | Client portal (separate auth); `accept-invite` new 2026-09-25; project page tabs Planned vs Actual and Change Requests (2026-09-25) |
| `/projects/snapshots/[snapshotId]` | `app/projects/snapshots/[snapshotId]/page.tsx` | Public approved project snapshot |

### 5.2 Dashboard — My Work

| Route | File | Description |
|-------|------|-------------|
| `/dashboard` | `app/dashboard/page.tsx` | Main dashboard overview |
| `/dashboard/my-okrs` | `app/dashboard/my-okrs/page.tsx` | User's own OKRs |
| `/dashboard/my-tasks` | `app/dashboard/my-tasks/page.tsx` | Redirect → `/dashboard/todos?scope=assigned` (2026-09-25) |
| `/dashboard/work` | `app/dashboard/work/page.tsx` | Work Board |
| `/dashboard/todos` | `app/dashboard/todos/page.tsx` | All todos / initiatives |
| `/dashboard/scrum` | `app/dashboard/scrum/page.tsx` | Daily Scrum (submit, wall, week/day views, blockers, wins, absences) |
| `/dashboard/scrum/wins`, `/dashboard/scrum/settings` | `app/dashboard/scrum/{wins,settings}/page.tsx` | Wins feed; settings (gated) |
| `/dashboard/sprints` | `app/dashboard/sprints/page.tsx` | Sprint list |
| `/dashboard/sprints/[id]` | `app/dashboard/sprints/[id]/page.tsx` | Sprint kanban board detail |
| `/dashboard/sprints/[id]/report` | `app/dashboard/sprints/[id]/report/page.tsx` | Sprint report |
| `/dashboard/sprints/ai/[planId]` | `app/dashboard/sprints/ai/[planId]/page.tsx` | AI sprint plan review + approve |

### 5.3 Dashboard — OKRs

> Consolidated 2026-09-25 (G6). Sidebar *OKRs*: OKR Explorer, Key Results, Insights; My OKRs is under *My Work*.

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/my-okrs` | `app/dashboard/my-okrs/page.tsx` | My OKRs + "Needs a check-in" queue |
| `/dashboard/okrs-all` | `app/dashboard/okrs-all/page.tsx` | **OKR Explorer** — views `list` (default), `tree`, `timeline`, `map`, `analyze`; levels `all`, `company`, `department`, `mine`, `team` (List/Tree) |
| `/dashboard/key-results` | `app/dashboard/key-results/page.tsx` | KR index over `FiltersWorkspace` (defaults to my KRs) |
| `/dashboard/objectives/[id]` | `app/dashboard/objectives/[id]/page.tsx` | Objective detail (comment thread, live refresh on `private-objective-<id>`) |
| `/dashboard/key-results/[id]` | `app/dashboard/key-results/[id]/page.tsx` | Key result detail view |
| `/dashboard/archived-objectives` | `app/dashboard/archived-objectives/page.tsx` | Archived objectives |

### 5.4 Dashboard — Insights and retired routes

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/insights` | `app/dashboard/insights/page.tsx` | **Insights** — tabs `overview` (default), `progress` (`&view=dashboard\|tracking`), `reports`, `initiatives`, `period-close` |
| `/dashboard/okrs-all/period-report/[timeframeId]` | `app/dashboard/okrs-all/period-report/[timeframeId]/page.tsx` | End-of-period report |

Retired 2026-09-25 — permanent (308) redirects from `lib/retired-routes.js`, query string carried over:
`/dashboard/objectives` → `/dashboard/okrs-all?level=all` · `/dashboard/company-okrs` → `?level=company` ·
`/dashboard/department-okrs` → `?level=department` · `/dashboard/goals` → `?level=mine` · `/dashboard/plans` and
`/dashboard/timeline` → `?view=timeline` · `/dashboard/okr-hierarchy` → `?view=tree` · `/dashboard/alignment-map` →
`?view=map` · `/dashboard/filters` → `?view=analyze` · `/dashboard/analytics` → `/dashboard/insights?tab=overview` ·
`/dashboard/progress-report` → `?tab=progress` · `/dashboard/progress` → `?tab=progress&view=tracking` ·
`/dashboard/reports` → `?tab=reports` · `/dashboard/initiative-report` → `?tab=initiatives`.

### 5.4A Dashboard — Performance & Scorecard

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/performance` | `app/dashboard/performance/page.tsx` | Employee My Performance dashboard |
| `/dashboard/performance/evaluations` | `app/dashboard/performance/evaluations/page.tsx` | Evaluation queue |
| `/dashboard/performance/evaluations/[id]/score` | `app/dashboard/performance/evaluations/[id]/score/page.tsx` | Scoring, calibration, and report workspace |
| `/dashboard/performance/templates` | `app/dashboard/performance/templates/page.tsx` | Scorecard template management |
| `/dashboard/performance/templates/[id]` | `app/dashboard/performance/templates/[id]/page.tsx` | Template builder and metric mappings |
| `/dashboard/performance/culture-library` | `app/dashboard/performance/culture-library/page.tsx` | Culture-library admin editor (C1-C6 criteria) |
| `/dashboard/performance/cycles` | `app/dashboard/performance/cycles/page.tsx` | Review-cycle management |
| `/dashboard/performance/actions` | `app/dashboard/performance/actions/page.tsx` | Development/reward action queue |
| `/dashboard/performance/settings` | `app/dashboard/performance/settings/page.tsx` | Performance module settings (admin: thresholds, attribution, nudge day, reward rules) |

### 5.4B Dashboard — Project Management

| Route | File | Description |
|-------|------|-------------|
| `/dashboard/projects` | `app/dashboard/projects/page.tsx` | Project list |
| `/dashboard/projects/portfolio` | `app/dashboard/projects/portfolio/page.tsx` | Portfolio dashboard |
| `/dashboard/projects/[id]` | `app/dashboard/projects/[id]/page.tsx` | Redirect → `/projects/[id]` (`ProjectWorkspaceClient`) |
| `/projects/[id]` | `app/projects/[id]/page.tsx` | Full-screen project workspace |
| `/dashboard/projects/templates` | `app/dashboard/projects/templates/page.tsx` | Project template directory |
| `/dashboard/projects/templates/new` | `app/dashboard/projects/templates/new/page.tsx` | New template builder |
| `/dashboard/projects/templates/[id]` | `app/dashboard/projects/templates/[id]/page.tsx` | Edit template builder |

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
| `/dashboard/letters/reports` | `app/dashboard/letters/reports/page.tsx` | **New 2026-09-25.** Letter reports (FR-16) |
| `/dashboard/letters/templates` | `app/dashboard/letters/templates/page.tsx` | **New 2026-09-25.** Template management (letter admin only) |

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
| `/dashboard/settings/users` | `app/dashboard/settings/users/page.tsx` | User management (Admin; ADMIN-only create/delete) |
| `/dashboard/settings/users/[id]` | `app/dashboard/settings/users/[id]/page.tsx` | User detail |
| `/dashboard/settings/permissions` | `app/dashboard/settings/permissions/page.tsx` | Permission manager (role create/delete UI) |
| `/dashboard/settings/automations` | `app/dashboard/settings/automations/page.tsx` | Automations admin settings |
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

> **2026-09-25 schema changes (need `prisma db push`):** `User.passwordChangedAt`, `Todo.recurrenceAnchorDay` (other session), `emailCadence` default → `BATCHED`, new `LetterTemplate` model, `ChangeRequest.visibility` (`INTERNAL` default \| `CLIENT_VISIBLE`, `@@index([projectId, visibility])`), `ScrumUpdate.status` may now be `DRAFT` (no DDL), `CommentAttachment.commentType` now `TODO \| OKR \| ACTIVITY \| SCRUM` (no DDL), and 18 new `@@index`es (objectives `[timeframeId,status]`/`[parentObjectiveId,status]`; key_results `[objectiveId,status]`/`[ownerId]`; initiatives `[keyResultId,status]`/`[objectiveId]`; comments `[objectiveId,createdAt]`/`[keyResultId,createdAt]`/`[parentId]`; notifications `[isRead,createdAt]`; email_digest_queue `[cadence,sentAt,queuedAt]`; objective_labels `[labelId]`; activity_logs `[createdAt]`/`[actorId,createdAt]`; user_roles `[roleId]`; project_milestones `[keyResultId]`; project_activity_dependencies `[successorId]`; project_members `[userId]`). The indexes are also in `scripts/preflight.sql` as `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so they build without locking before `db push`. `letter_templates` has no preflight DDL — `db push` creates it.

### 6.1 Users & Organization

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `User` | `users` | `id`, `email`, `name`, `role`, `designation`, `nameAmharic`, `designationAmharic`, `isActive`, `avatar`, **`passwordChangedAt`** | Roles: ADMIN / EXECUTIVE / DEPARTMENT_LEAD / EMPLOYEE. `passwordChangedAt` (2026-09-25) is the credential epoch: JWTs whose `authTime` predates it are rejected; set on change/reset/admin reset and on admin delete. Deleted users are anonymised in place (`deleted+<id>@deleted.invalid`, "<title> (deleted account)"). |
| `ClientPortalUser` | `project_client_portal_users` | `email`, `name`, `clientName`, `passwordHash` (bcrypt, or a pending `invite:` credential), `projectIds[]` (hard scope), `isActive`, `lastLoginAt`, `createdById` | Client-portal accounts; managed per project via `/api/projects/[id]/portal-users` (2026-09-25) |
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
| `Todo` | `initiatives` | `title`, `status`, `priority`, `assigneeId`, `creatorId`, `keyResultId`, `objectiveId`, `sprintId`, `sprintPosition`, `taskType`, `aiSuggested`, `ambitionLevel`, `carryoverCount`, `carryoverDisposition`, `dueDate`, `startDate`, `recurrenceAnchorDay` | Statuses: PENDING / IN_PROGRESS / IN_REVIEW / STUCK / COMPLETED / CANCELLED |
| `TodoMember` | `todo_members` | `todoId`, `userId` | Additional assignees |
| `TodoLabel` | `todo_labels` | `todoId`, `labelDefId` | |
| `TodoLabelDef` | `todo_label_defs` | `name`, `color` | Board-wide label palette |
| `TodoChecklist` | `todo_checklists` | `todoId`, `title`, `position` | Named checklist group |
| `TodoChecklistItem` | `todo_checklist_items` | `checklistId`, `title`, `completed`, `assigneeId`, `dueDate` | |
| `TodoAttachment` | `todo_attachments` | `todoId`, `filename`, `url`, `mimeType`, `size` | |
| `CommentAttachment` | `comment_attachments` | `scope`, `entityId`, `commentId`, `filename`, `storedName`, `mimeType`, `size`, `width`, `height` | Polymorphic; files live outside `public/` and are served only through the API. Since 2026-09-25 also carries to-do (`TODO`), project activity (`ACTIVITY`, internal only) and scrum (`SCRUM`) comment files; migrate legacy to-do files with `scripts/migrate-todo-comment-attachments.ts`; staged rows unclaimed for 24 h are swept nightly |
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
| `NotificationPreference` | `notification_preferences` | `userId`, `category`, `inApp`, `email`, `emailCadence` | Per-user per-category. `emailCadence` default **`BATCHED`** (was IMMEDIATE; 2026-09-25) — BATCHED / IMMEDIATE / DAILY / WEEKLY / DISABLED |
| `OrgNotificationDefault` | `org_notification_defaults` | `category`, `inApp`, `email`, `emailCadence` | Fallback when no user row; default `BATCHED` (existing rows: `scripts/notifications-set-batched-defaults.ts`) |
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
| `LetterEnclosure` | `letter_enclosures` | `letterId`, `fileName`, `fileSize`, `mimeType`, `storagePath` | Schema unchanged; since 2026-09-25 `storagePath` = `letter-enclosure:<storedName>` pointing at a real private file under `LETTER_UPLOAD_DIR` |
| `LetterTemplate` | `letter_templates` | `name`, `letterType` (LetterTypeDef.code), `language` (en/am), `bodyHtml` (sanitised), `isActive`, `seedKey` (unique), `createdById`, `updatedById` | **New 2026-09-25.** Body templates; archive = `isActive false`; seeded from the old `LETTER_TEMPLATES` constants on first read. `@@index([letterType, language, isActive])` |
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

### 6.9 Daily Scrum

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `ScrumUpdate` | `scrum_updates` | `userId`, `submittedById`, `managerId`, `teamId`, `scrumDate`, `todayPlan`, `blockers`, `blockerCategory`, `blockerStatus`, `win`, `mood`, `hasBlocker`, `hasWin`, `isLate`, `status` (`DRAFT` \| `SUBMITTED` \| `CONFIRMED` \| `AMENDED`), proxy fields | One row per user/day; `DRAFT` rows are excluded from every counting read via `@@unique([userId, scrumDate])`; user references are plain strings, not Prisma relations |
| `ScrumComment` | `scrum_comments` | `updateId`, `authorId`, `body`, `mentions` | Cascades with parent update |
| `ScrumAbsence` | `scrum_absences` | `userId`, `date`, `type`, `reason`, `recordedById` | One row per user/date |
| `ScrumSettings` | `scrum_settings` | `timezone`, reminder/cutoff/nudge times, `workingDays`, `holidays`, feature toggles, escalation thresholds | Singleton default row (`id="default"`) |
| `ScrumUpdateLink` | `scrum_update_links` | `updateId`, `objectiveId?`, `keyResultId?`, `todoId?`, `linkType`, `context`, `progressNote` | OKR join table; app-layer guard must enforce exactly one FK |
| `ScrumWinCelebration` / `ScrumSavedView` / `ScrumJobRun` | — | celebrations per win; per-user saved filter views; cron idempotency ledger | Used by F4 celebrate/saved-view UI and the scrum crons |

### 6.9a AI Automations

| Model | Key fields |
|-------|-----------|
| `Automation` | `ownerId`, `instructionText`, `planJson` (compiled PlanSpec), `planVersion`, `scheduleKind`, `scheduleJson`, `timezone`, `nextRunAt` (the tick's only index), `mode` (DRY_RUN/REVIEW/AUTO), `status`, `toolGrants`, `recipientsJson`, `maxCostUsdPerRun`, `consecutiveFailures`, `deletedAt` |
| `AutomationRun` | `scheduledFor` (nominal slot; unique with `automationId`), `status`, `trigger`, `leaseOwner`/`leaseExpiresAt`, `attempt`, `stepsJson` (transcript), `findingsJson` (next run's diff baseline), `costUsd`, `inputTokens`/`outputTokens` |
| `AutomationBriefing` | `runId` (unique), `title`, `summary`, `blocksJson`, `htmlApp`, `htmlEmail`, `textPlain`, `status`, `newCount`/`changedCount`/`unchangedCount`/`resolvedCount`, `publishedAt`, `approvedById`, `promotedJson` (dedupeKeys already turned into a Todo/Risk) |
| `AutomationBriefingRecipient` | `briefingId` + `userId` + `channel` (unique), `status` (PENDING/SENT/FAILED/SUPPRESSED), `deliveredAt`, `error` |
| `AutomationCredential` | `key`, `encryptedKey` (AES-256-GCM envelope), `lastFour`, `lastVerifiedAt` |
| `AutomationSettings` | Singleton: `globalPaused` (kill switch), `domainAllowlist`, `orgDailyCostCapUsd`, `maxConcurrentRuns`, `defaultTimezone`, `retentionDays` |

AI spend is recorded in the existing `AiGenerationLog` under feature key `AUTOMATION_RUN` with `planId = runId` — there is no parallel cost ledger.

### 6.10 Telegram

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `TelegramChat` | `telegram_chats` | `chatId`, `type`, `title`, `scrapeMode`, `askEnabled` | |
| `TelegramMessage` | `telegram_messages` | `chatId`, `messageId`, `fromUserId`, `text`, `isCommand`, `command` | |
| `TelegramBotConfig` | `telegram_bot_config` | `botUsername`, `webhookUrl`, `systemPrompt` | Singleton (`id="default"`) |

### 6.11 Performance & Scorecard

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
| POST | `/api/auth/register` | Public, rate-limited (5/h/IP) | Always an **inactive EMPLOYEE** (body `role` ignored); identical 201 for new and existing emails; admins notified after the response |
| GET/POST | `/api/auth/[...nextauth]` | Public | NextAuth handler — `verifyCredentials` (rate-limited; passwordless/inactive/unknown → same `invalid`); JWT carries `authTime` |
| POST | `/api/auth/login` | Public, rate-limited | Bearer login for API clients; 429 + `Retry-After` |
| POST | `/api/auth/forgot-password` | Public, rate-limited (IP + email) | Constant-time response; token (hashed) + email sent after the response; no longer emits `ACCOUNT_PASSWORD_RESET_REQUESTED` |
| POST | `/api/auth/reset-password` | Public, rate-limited | Consume hashed token; sets `passwordChangedAt` |
| POST | `/api/auth/change-password` | Auth | Sets `passwordChangedAt` and re-issues the caller's session cookie |
| GET | `/api/wallpaper` | Public | Sign-in backdrop photos — Bing image-of-the-day, memoised 6 h, falls back to built-in CSS scenes (`AUTH_WALLPAPER_SOURCE=off` disables the outbound fetch) |

### 7.2 Objectives

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/objectives` | Auth | List — SQL visibility (`buildObjectiveVisibilityWhere`) + redaction; filters `ownerIds` (repeatable/CSV), `contributorId`; search only matches rows visible unredacted (2026-09-25 I1) |
| POST | `/api/objectives` | Auth | Create |
| GET | `/api/objectives/[id]` | Auth | Get detail |
| PUT | `/api/objectives/[id]` | Auth | Update |
| DELETE | `/api/objectives/[id]` | Auth | Delete |
| POST | `/api/objectives/[id]/archive` | Auth | Archive |
| POST | `/api/objectives/[id]/unarchive` | Auth | Unarchive |
| POST | `/api/objectives/[id]/complete` | Auth | Mark complete |
| GET | `/api/objectives/[id]/children` | Auth | Child objectives |
| GET/POST | `/api/objectives/[id]/labels` | Auth | Label management |
| GET | `/api/objectives/[id]/delivery` | Auth | Linked projects with delivery health (K1) |
| GET | `/api/objectives/[id]/activity` | Auth | Activity log |
| POST | `/api/objectives/[id]/views` | Auth | Track view |
| GET | `/api/objectives/[id]/key-result-permissions` | Auth | KR permission check |
| POST | `/api/objectives/[id]/clone` | Auth | Clone with KRs |
| GET/PUT | `/api/objectives/[id]/weights` | Auth | KR/child weights |
| GET/POST | `/api/objectives/[id]/comments` | Auth + `canAccessOkrComments` | Comments — needs an unredacted view of the objective (else 404); notifications only to recipients who can view it (2026-09-25) |
| POST | `/api/objectives/[id]/request-checkin` | Auth | Request check-in from owner |
| POST | `/api/objectives/[id]/close/initiate` | Owner/editor | Snapshot grade/outcome and enter CLOSING |
| GET/PUT | `/api/objectives/[id]/retrospective` | Owner/editor | Read evidence / save close reflection (validated + sanitised by `lib/okr/retrospective-input.ts`) |
| POST | `/api/objectives/[id]/close/commit` | Owner/editor | Freeze retrospective, close, and lock |
| POST | `/api/objectives/[id]/reopen` | Window/role scoped | Reopen with permanent reason scar |
| GET | `/api/objectives/alignment-search` | Auth | Search alignment candidates (in-DB, case-insensitive, ≤80) |

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
| POST | `/api/keyresults/[id]/close/initiate` | Owner/editor | Snapshot grade/outcome and enter CLOSING |
| GET/PUT | `/api/keyresults/[id]/retrospective` | Owner/editor | Read evidence / save close reflection |
| POST | `/api/keyresults/[id]/close/commit` | Owner/editor | Freeze retrospective, close, and lock |
| POST | `/api/keyresults/[id]/reopen` | Window/role scoped | Reopen with permanent reason scar |

### 7.3a Period Close Reports

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/reports/period-close/[timeframeId]` | Admin/Executive/Department Lead | On-demand scoped close report |
| GET | `/api/reports/period-close/[timeframeId]/pdf` | Same | Shareable Puppeteer PDF export |

### 7.4 Todos / Initiatives

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/todos` | Auth | List (filtered). `?surface=todos\|work\|mine` returns exactly what that page shows (`lib/todos/visibility.ts` + record scope; portal sessions 403); legacy `?mine=` unchanged |
| POST | `/api/todos` | Auth | Create |
| GET | `/api/todos/[id]` | Auth | Get detail |
| PUT | `/api/todos/[id]` | Auth | Update |
| DELETE | `/api/todos/[id]` | Auth | Delete |
| GET | `/api/todos/[id]/activity` | Auth | Activity log |
| GET/POST | `/api/todos/[id]/comments` | Card read/write | Threaded comments. POST responds after the row + ActivityLog; mention/stakeholder notifications run after the response (single mention email since 2026-09-25). Attachments hydrate from `CommentAttachment` rows (rows win over legacy `attachmentIds`) |
| PUT/DELETE | `/api/todos/[id]/comments/[commentId]` | Auth | Comment CRUD |
| — | `/api/todos/[id]/checklists/**` | Card write (`canWriteTodo`) | Record must belong to the card (404); closed sprint 409. Comments/attachments/activity use `canAccessAttachmentScope`; mutations 409 on closed sprints |
| GET/POST | `/api/todos/[id]/checklists` | Auth | Checklists |
| GET/PUT/DELETE | `/api/todos/[id]/checklists/[checklistId]` | Auth | Checklist CRUD |
| GET/POST | `/api/todos/[id]/checklists/[checklistId]/items` | Auth | Checklist items |
| GET/PUT/DELETE | `/api/todos/[id]/checklists/[checklistId]/items/[itemId]` | Auth | Item CRUD |
| GET/POST | `/api/todos/[id]/attachments` | Auth | Attachments |
| GET/DELETE | `/api/todos/[id]/attachments/[attachmentId]` | Auth + `canAccessAttachmentScope` | Stream or remove one attachment. **GET is the only read path** — `public/uploads/**` is served with no session check, so nothing in the UI may link it directly (enforced by `lib/attachments/viewer-invariants.test.ts`). |
| POST/GET | `/api/comment-attachments` | Auth + scope check | Upload (magic-byte validated, allowlisted) and list; `commentType` `TODO` (read/write → `canReadTodo`/`canWriteTodo`), `OKR`, `ACTIVITY`, `SCRUM` (`lib/attachments/access.ts`) |
| GET/DELETE | `/api/comment-attachments/[id]` | Auth + scope check | Stream or remove one |
| GET/POST | `/api/initiatives/[id]/updates` | Auth | Daily initiative updates |
| GET/POST | `/api/todo-labels` | Auth | Label definitions; POST validated (`parseLabelInput`) and audited |
| PATCH/DELETE | `/api/todo-labels/[id]` | PATCH ADMIN/EXECUTIVE, DELETE ADMIN | Label def CRUD (delete hidden in the UI for non-admins) |

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
| POST | `/api/users` | **ADMIN only** | Create user (hashed CSPRNG activation token, audited) |
| GET | `/api/users/for-selection` | Auth | Active users for dropdowns |
| GET | `/api/users/me/direct-reports` | Auth | Manager's direct reports |
| GET | `/api/users/me/departments` | Auth | Current user's departments |
| GET | `/api/users/[id]` | Auth | User detail |
| PATCH | `/api/users/[id]` | ADMIN or `page.settings.users` | Update user; only ADMIN may grant/revoke ADMIN or change an admin's status; last active ADMIN protected; deleted accounts read-only; audited |
| DELETE | `/api/users/[id]` | **ADMIN only** | **Anonymise** — name → "<designation or role> (deleted account)", email → `deleted+<id>@deleted.invalid`, credentials cleared, inactive; records kept. 409 if already deleted |
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
| GET/POST | `/api/settings/integrations` | **ADMIN only** (EXECUTIVE removed 2026-09-25) | Integrations config; secrets masked (`••••••••` + last 4); a masked value on save keeps the stored secret |
| GET/PUT | `/api/settings/notification-defaults` | Admin | Org notification defaults |
| GET/PUT | `/api/settings/letter-permissions/roles` | Admin | Letter role × permission matrix |
| GET/POST | `/api/settings/letter-permissions/users` | Admin | Per-user letter permission overrides |
| GET/DELETE | `/api/settings/letter-permissions/users/[userId]` | Admin | Override detail + delete |
| POST | `/api/email/test` | Admin | SMTP test email |

### 7.10 Notifications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/notifications` | Auth | Current user's notifications + unread count |
| PATCH/DELETE | `/api/notifications/[id]` | Owner | Mark read / dismiss |
| POST | `/api/notifications/mark-all-read` | Auth | Clear unread |
| GET/PUT | `/api/notifications/preferences` | Auth | Per-user notification preferences (15 categories; cadences BATCHED/IMMEDIATE/DAILY/WEEKLY/DISABLED) |

### 7.11 Letters

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/letters` | Auth | List (filter by status, type, search, mine) |
| POST | `/api/letters` | Auth | Create draft + allocate reference number |
| GET | `/api/letters/[id]` | `letterReadGuard` | Letter detail (out-of-scope → 404; same guard on html/pdf/docx/activity/duplicate/workflow routes) |
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
| GET/POST | `/api/letters/[id]/pdf` | `letterReadGuard` | Real PDF (Puppeteer, JS off, request interception) + missing placeholders |
| GET | `/api/letters/[id]/html` | `letterReadGuard` | Sanitised HTML body; `?origin` removed, `?font` validated; CSP `sandbox` |
| GET | `/api/letters/[id]/docx` | Auth | DOCX download |
| POST | `/api/letters/[id]/enclosures` | Letter admin, or `letter.write` + DRAFT + preparer | **Multipart upload** (field `file`), validated, stored under `LETTER_UPLOAD_DIR` |
| GET | `/api/letters/[id]/enclosures/[enclosureId]` | `letterReadGuard` | **New.** Stream the file |
| DELETE | `/api/letters/[id]/enclosures/[enclosureId]` | Same as upload | Remove enclosure + file |
| GET | `/api/letters/reports` | Letter read scope (403 without) | **New (FR-16).** Aggregates by status/type/month/customer, preparers, signatories; ≤20,000 rows |
| GET/POST | `/api/letters/templates` | GET: letter admin / `letter.create` / `letter.read`; POST: letter admin | **New.** List (`?letterType`, admin-only `?includeArchived`) / create template; audited |
| PATCH/DELETE | `/api/letters/templates/[templateId]` | Letter admin | **New.** Update / archive / unarchive; DELETE = soft archive; audited |
| GET | `/api/letters/odoo/contacts` | Auth | Odoo `res.partner` typeahead; mock roster when Odoo env is unset |
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
| POST | `/api/telegram/webhook` | Token (`X-Telegram-Bot-Api-Secret-Token`, timing-safe) | Receive Telegram updates; `/ask` only in `TELEGRAM_ALLOWED_CHAT_IDS`, 20/10 min per chat, 5/10 min per user |
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

### 7.16 Project Management

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/POST | `/api/projects/templates` | Auth / ADMIN+EXECUTIVE+DEPARTMENT_LEAD create | List project templates; create a new custom template |
| GET/PATCH/DELETE | `/api/projects/templates/[id]` | Auth / ADMIN+EXECUTIVE+DEPARTMENT_LEAD write | Template detail, update, and delete (system templates are read-only) |
| POST | `/api/projects/templates/[id]/clone` | ADMIN+EXECUTIVE+DEPARTMENT_LEAD | Clone any template into an editable `isSystem=false` copy |
| PATCH | `/api/projects/[id]/activities/schedule` | Project write | Persist Gantt drag/resize schedule changes, including cascaded successor shifts and C4 slip attribution on baselined projects |
| GET/POST | `/api/projects/[id]/dependencies` | Project read/write | List or create activity dependencies with cycle checks |
| DELETE | `/api/projects/[id]/dependencies/[dependencyId]` | Project write | Delete an activity dependency |
| GET | `/api/projects/[id]/gantt/export?format=pdf\|png\|csv\|xml` | Project read | Download D4 Gantt exports with project header; PDF/PNG use Puppeteer, CSV/XML are generated server-side |
| GET | `/api/projects/workload?weeks=8` | Auth | E1 cross-project workload heatmap across all readable active projects |
| POST | `/api/projects/[id]/ai-assistant` | Project write | J6 constrained AI assistant: generate capped, data-grounded executive summary, risk detection, delay pattern, or estimate suggestion |
| GET | `/api/projects/portfolio/dashboard` | Portfolio read | K2 portfolio dashboard aggregation (RAG/SPI/delays/escalations) |
| GET/POST | `/api/projects/portfolio/report` | Portfolio read | K3 list/generate cross-project performance reports |
| GET | `/api/projects/portfolio/report/[reportId]` | Portfolio read | K3 read a portfolio report |
| GET | `/api/projects/portfolio/report/[reportId]/pdf` | Portfolio read | K3 download portfolio report PDF |
| GET/POST | `/api/projects/[id]/portal-users` | Project write | **New 2026-09-25.** List / grant client-portal accounts (invite link 7 d single-use, or password ≥10); audited |
| PATCH/DELETE | `/api/projects/[id]/portal-users/[portalUserId]` | Project write | **New.** `RESEND_INVITE` / `SET_PASSWORD` (ends that account's portal sessions) / revoke project (deactivate when none left); audited |
| GET/POST | `/api/portal/invite` | Public, rate-limited | **New.** Validate invite token / set password |
| GET | `/api/portal/projects/[id]/attachments` | Portal session + project scope | **New.** Client-visible attachments only (SQL filter, Invariant 5) |
| GET | `/api/portal/projects/[id]/activities/[activityId]/attachments/[attachmentId]` | Portal session + project scope | **New.** Stream one client-visible attachment |
| GET/POST | `/api/cron/project-creation-draft-purge` | `withCronAuth` | **New.** Purge expired project-creation drafts + retained sources |
| PATCH | `/api/projects/creation-drafts/[id]` | Owner | (2026-09-25) Adding, removing or changing a provenance source record → **422** (`lib/projects/creation-provenance.ts`) |
| POST | `/api/projects/creation-drafts` | Capability | AI methods refused while the project-creation AI flag is off |
| POST / GET | `/api/projects/creation-drafts/[id]/upload` | Owner | **POST → 202**: validate, scan (ClamAV), store privately, process in the background; **GET**: processing status (UI polls) |
| POST | `/api/projects/creation-drafts/[id]/upload/retry` | Owner | Reprocess the retained file (idempotent) |
| POST | `/api/projects/creation-drafts/[id]/assumptions/bulk-decision` | Owner | Accept/reject all pending assumptions in a phase or all; atomic, version-checked, audited once |
| PUT | `/api/projects/creation-drafts/[id]/ai-guided/brief` | Owner + AI flag | Save the brief |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/{clarify,answers,generate,revise,undo}` | Owner + AI flag | OpenAI clarifying questions, answers, plan generation (`AI_PLAN_GENERATED`), constrained revision preview/apply (`AI_PLAN_REVISED`, HMAC preview token signed with `NEXTAUTH_SECRET`), undo (`AI_PLAN_REVISION_UNDONE`) |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/tor-upload` | Owner + AI flag | DOCX TOR upload via the import security path; returns extracted text, no AI call |
| PATCH | `/api/projects/[id]/change-requests/[crId]` | Project write | Now also accepts `visibility: 'INTERNAL' \| 'CLIENT_VISIBLE'` |
| GET | `/api/portal/projects/[id]/planned-vs-actual` | Portal session + project scope | Baseline vs current + signed slip per milestone/activity |
| GET | `/api/portal/projects/[id]/change-requests` | Portal session + project scope | `CLIENT_VISIBLE` change requests only (SQL filter); no names or cost |

### 7.17 Misc

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/health` | Public | Health check |
| GET/POST/DELETE | `/api/sprints/[id]/participants` | View gate; `canEditSprint` to change | Invite-only sprint members (one person per call; owner not removable; audited) |
| GET | `/api/link-preview?url=` | Auth | Page metadata for a pasted URL: `{ url, finalUrl, domain, siteName, title, description, image, favicon, ok }`. SSRF-safe (connect-time IP check, ≤3 redirects, 5 s, 512 KB); 400 for disallowed URLs, `ok:false` when the page can't be read. In-process LRU cache |
| POST | `/api/client-errors` | Auth | Browser error reporting |
| GET | `/api/search` | Auth | Global search |
| GET/POST | `/api/watchers` | Auth | Opt-in watchers |
| GET/POST/DELETE | `/api/favorites` | Auth | Starred objectives |
| GET | `/api/okr-hierarchy` | Auth | OKR hierarchy, role/record-scoped via `lib/okr/visibility-scope.ts`; per-KR initiative counts |
| GET | `/api/okr-hierarchy/initiatives?keyResultId=…` | Auth (portal 403) | **New 2026-09-25.** Initiative rows for ≤50 KRs, same visibility rule |
| GET | `/api/org/tree` | Auth | Org tree |
| GET | `/api/org/diagnostics` | Admin | Org structure diagnostics |
| GET | `/api/risks` | Auth + object checks | List risks (only on objectives/KRs the caller can view unredacted) |
| POST | `/api/risks` | Auth + edit on the target | Create risk |
| GET/PUT/DELETE | `/api/risks/[id]` | Auth + object checks | Risk CRUD |

### 7.16a AI Automations

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/automations/compile` | `canAuthorAutomations` | Instruction → PlanSpec + derived grants + notes + diff. Does not save. |
| GET | `/api/automations/tools` | `canAuthorAutomations` | Tool catalog: per-tool `available` (phase) and `configured` (credentials), plus `aiConfigured` |
| GET/POST | `/api/automations` | Auth / `canAuthorAutomations` | List own automations; create (always starts in DRY_RUN) |
| GET/PATCH/DELETE | `/api/automations/[id]` | Owner or admin | Detail (plan, grants, recipients); update (bumps `planVersion`); soft delete |
| POST | `/api/automations/[id]/run` | Owner or admin | Queue a manual run; 409 if one is in flight, 423 if globally paused |
| POST | `/api/automations/[id]/mode` | Owner or admin | Change distribution mode; AUTO refused until one run has succeeded |
| GET | `/api/automations/[id]/runs` | Owner or admin | Run timeline |
| GET | `/api/automations/runs/[runId]` | Owner or admin | Full run detail incl. step transcript (never exposed to recipients) |
| GET | `/api/automations/briefings` | Auth | Briefings the caller owns or has been sent |
| GET | `/api/automations/briefings/[id]` | Owner, admin, or recipient | Rendered Briefing (app HTML + blocks) |
| POST | `/api/automations/briefings/[id]/approve` | Owner or admin | Release a PENDING_REVIEW Briefing to recipients |
| POST | `/api/automations/briefings/[id]/promote` | Owner, admin, or recipient | Turn one Finding into a Todo or Risk (FR-12) — always manual |
| GET | `/api/automations/briefings/[id]/export` | Owner, admin, or recipient | `?format=pdf\|docx` via the Letters PDF/DOCX pipeline |
| GET/PATCH | `/api/automations/settings` | Admin | Org settings: kill switch, caps, allowlist, retention |

### 7.17 Cron Jobs

All cron routes (`GET`/`POST /api/cron/*`) are wrapped in `withCronAuth` (`lib/cron-auth.ts`, 2026-09-25): `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`; `?key=` is ignored; timing-safe compare; **503 `CRON_NOT_CONFIGURED`** when `CRON_SECRET` is unset or shorter than 16 characters; 401 on a wrong token. Full list and schedule: §14.

### 7.18 Performance & Scorecard

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/POST | `/api/performance/templates` | Auth/Admin create | List/create scorecard templates |
| GET/PATCH | `/api/performance/templates/[id]` | Auth/Admin write | Template detail and configuration |
| PUT | `/api/performance/templates/[id]/builder` | Admin | Replace draft tiers and criteria |
| POST | `/api/performance/templates/[id]/{publish,fork,archive,culture-block}` | Admin | Template lifecycle and culture insertion |
| GET/POST | `/api/performance/culture-library` | Admin | List/create reusable criterion-library entries |
| PUT/PATCH | `/api/performance/culture-library/[id]` | Admin | Update/toggle-active a library entry |
| GET/PUT/DELETE | `/api/performance/template-mappings`, `/api/performance/metric-mappings` | Admin | Role and employee metric mappings |
| GET/POST | `/api/performance/cycles` | Auth/Admin create | List/create cycles |
| GET/POST | `/api/performance/cycles/[id]`, `/api/performance/cycles/[id]/{open,close}` | Scoped/Admin | Cycle detail and lifecycle |
| GET | `/api/performance/evaluations`, `/api/performance/evaluations/[id]` | Scoped | Actor-specific queue and sealed detail DTO |
| PUT/POST | `/api/performance/evaluations/[id]/{scores,submit,panel,calibration,share-draft,acknowledge,dispute,finalize}` | Scoped | Evaluation workflow |
| GET | `/api/performance/okr-actual/[criterionId]` | Scoped | Period-bounded live metric actual and computed score |
| GET/PUT | `/api/performance/me`, `/api/performance/focuses/[id]/weekly-step` | Employee | My Performance data and weekly commitment |
| GET/PATCH | `/api/performance/actions`, `/api/performance/actions/[id]` | Admin | Recommendation queue and transitions (audit-logged) |
| POST | `/api/performance/evaluations/[id]/consolidate` | Lead/Admin | Manual consolidation retry — refreshes frozen metric-source snapshots from current mappings, re-runs consolidation (used after fixing an `ACTUAL_UNAVAILABLE` issue) |
| PATCH | `/api/performance/cycles/[id]/issues/[issueId]` | Admin/cycles write | Resolve / waive / reopen a review-cycle issue (`NO_TEMPLATE`, `NO_LEAD`, `AMBIGUOUS_LEAD`, `METRIC_SOURCE_MISSING`, `ACTUAL_UNAVAILABLE`) |
| GET/PATCH | `/api/performance/settings` | Performance admin | PerformanceSettings singleton — `varianceThreshold`, `improvementFocusLimit`, `remarkAttributionEnabled`, `weeklyNudgeDay` (ISO, Monday=1), `recommendationRulesJson`; PATCH is audit-logged (`PERFORMANCE_SETTINGS` / `SETTINGS_UPDATED`) |
| POST | `/api/performance/evaluations/[id]/excuse` | Performance admin | Excuse an evaluation — body `{ reason }` (required); state-machine-validated transition to `EXCUSED`; sets `excusedAt`/`excusedReason`; audit-logged (`EVALUATION_EXCUSED`) |

Cross-cutting (2026-07-12): the module emits `PERFORMANCE`-category notification events — `PERF_CYCLE_OPENED`, `PERF_PANEL_COMPLETE`, `PERF_DRAFT_SHARED`, `PERF_DISPUTE_RAISED`, `PERF_ACTION_RECOMMENDED`, `PERF_WEEKLY_FOCUS` (weekly nudge now goes through the dispatcher, so email delivers) — and writes an audit trail via `recordActivity` (`ActivityLog.evaluationId`; entity types `EVALUATION` / `REVIEW_CYCLE` / `DEVELOPMENT_ACTION`) on every lifecycle transition: cycle open/close, panel updates, consolidation, calibration resolve, share, acknowledge, dispute, finalize, issue resolution, action approve/reject/execute.

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
| `FilterMultiSelect` | `label`, `values[]`, `onValuesChange`, `options[]` ({value,label,hint?,leading?,disabled?}), `placeholder?`, `summary?`, `searchThreshold?`, `renderTrigger?` | Multi-select filter (Radix checkbox menu items). Companion to single-select `FilterSelect` |
| `SettingsSelect` (`components/settings/`) | `value`, `onValueChange`, `options[]` ({value,label,group?,disabled?}), `placeholder?`, `size?` | Labelled form select over Radix Select for Settings screens (replaced native `<select>`, 2026-09-25) |

### 8.2 Shared Components (`components/shared/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `ActivityLogPanel` | `ActivityLogPanel.tsx` | `entityType`, `entityId` | Audit trail for any entity |
| `EntityLink` | `EntityLink.tsx` | `entity`, `type` | Navigation link to entity detail |
| `TimeframeBadge` | `TimeframeBadge.tsx` | `timeframe` | Badge for Q1 2025, etc. |
| `UserAvatar` / `UserAvatarStack` / `PersonTooltip` / `PeopleTooltip` | `UserAvatar.tsx` | `user`, `tooltip?` / `person`, `whenTruncated?` | Avatars and clipped names show the full name in a hover card everywhere (except the client portal) |
| `LinkPreviewList` / `LinkPreviewCard` | `LinkPreview.tsx` | `html`, `className?` / `url` | Preview cards for up to 3 URLs found in rich-text HTML (same-origin, mailto and mentions skipped); skeleton while loading, domain+URL fallback on failure. Used in card comments/description and OKR comments |
| `CopyLinkButton` | `CopyLinkButton.tsx` | `value` \| `getValue`, `label?`, `iconOnly?` | The one copy-to-clipboard control (sprint board share, card modal) |
| `LinkTabs` | `LinkTabs.tsx` | `items`, `activeKey`, `ariaLabel`, `variant?: 'tabs' \| 'segmented'` | **New 2026-09-25.** URL-synced tab strip of plain links (OKR Explorer views/levels, Insights tabs) |
| `OkrComments` | `OkrComments.tsx` | see file | OKR comment thread with link previews, attachments and live refresh (objective + KR pages) |

### 8.3 Layout Components (`components/layout/`)

| Component | Description |
|-----------|-------------|
| `DashboardShell` | Main layout wrapper: sidebar + header + content area |
| `DashboardTitleContext` | Context for setting page titles from child pages |

### 8.4 Objectives (`features/objectives/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateObjectiveModal` | Form modal | Uses Modal + useReferenceData |
| `EditObjectiveModal` | Form modal | Uses Modal + useReferenceData |
| `DeleteObjectiveModal` | Confirm modal | Uses ConfirmDialog |
| `CloneObjectiveModal` | Form modal | Uses Modal |
| `ObjectivesList` | List | Objective list with filters |
| `NestedObjectivesList` | List | Hierarchical objective view |
| `CreateObjectiveButton` | Trigger | Opens CreateObjectiveModal (accepts `level` prop) |
| `EditObjectiveButton` | Trigger | |
| `DeleteObjectiveButton` | Trigger | |
| `CloneObjectiveButton` | Trigger | |
| `ArchiveObjectiveButton` | Action | Direct archive |
| `UnarchiveObjectiveButton` | Action | Direct unarchive |

### 8.5 Key Results (`features/key-results/`)

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

### 8.6 Todos (`features/todos/`)

| Component | Type | Notes |
|-----------|------|-------|
| `EditTodoModal` | Form modal | Uses Modal |
| `DeleteTodoModal` | Confirm modal | Uses ConfirmDialog |
| `AssignUserModal` | Form modal | Uses Modal |
| `SetDueDateModal` | Form modal | Uses Modal |
| `ToDoList` | List | Main todo list with status toggle (`useTodoStatusToggle`; `MyTasksList` deleted 2026-09-25) |
| `LazyTodoCardModal` (`components/todos/`) | Lazy wrapper | `next/dynamic` card modal — use instead of `TodoCardModal`; the modal itself is split into `Card*` sections (Wave 3) |
| `EditTodoButton` | Trigger | |
| `DeleteTodoButton` | Trigger | |
| `AssignUserButton` | Trigger | |
| `SetDueDateButton` | Trigger | |

### 8.7 OKR Explorer & Insights (2026-09-25; replaces Goals)

| Component | Notes |
|-----------|-------|
| `OkrsAllClient` (+ `OkrsAll*` parts) | Explorer List view — KPIs, filters, bulk archive/restore, role-aware Create menu |
| `OkrHierarchyTable` (`components/hierarchy/`) | Explorer Tree view |
| `ExplorerTimelineView` / `ExplorerMapView` / `ExplorerCreateHandoff` | Timeline (`PlansGantt`), strategy map, create hand-offs (Cmd-K, `?createUnder=`) |
| `ProgressDashboardPanel`, `ProgressTrackingPanel`, `ProgressReportWeeklyBars`, `PeriodClosePicker`, `PrintButton` (`components/insights/`) | Insights Progress and Period-close tabs |

`features/goals` (Goals table/feed/team views, `CreateGoalModal`, services) was **deleted** 2026-09-25; `/dashboard/goals` redirects to `/dashboard/okrs-all?level=mine`.

### 8.8 Sprints (`features/sprints/`)

| Component | Notes |
|-----------|-------|
| `SprintBoardClient` | Trello-style kanban board (757 lines after the G1 split) |
| `SprintBoardHeader`, `SprintBoardLane`, `AddTaskInline`, `useBoardKeyboardMove` (internal) | Header + facets, lane, inline composer, keyboard move |
| `SprintMembersDialog` (internal) | Invite-only participants |
| `SprintsListClient` | Sprint list |

### 8.9 Letters (`features/letters/`)

| Component | Notes |
|-----------|-------|
| `LettersPageClient` | Letters list with status tabs + filters |
| `LettersTable` | Table of letters |
| `CreateLetterModal` | Create draft + allocate reference |
| `LetterFormClient` | Full letter editor (body, recipient, signatory) |
| `EnclosuresPanel` | Enclosure management |
| `PdfPreviewPanel` | PDF/print preview (sandboxed iframe) |
| `CustomerLookup` | Odoo contact typeahead |
| `LetterReportsClient` | **New 2026-09-25.** FR-16 report (recharts) |
| `LetterTemplatesClient` | **New 2026-09-25.** Template management (letter admin), `sandbox=""` preview |

### 8.10 Filters Workspace (`features/filters/`)

| Component | Notes |
|-----------|-------|
| `ObjectiveDetailModal` | Objective **quick view** (2026-09-27, QV-3): hero, stat strip (progress · `goalStatus` · confidence 0–100 · KRs), clickable KR list (swaps to KR quick view), `OkrComments`, Details rail; "View full page" → `/dashboard/objectives/[id]`. Props `{ objectiveId, onClose, onOpenKr?, onOpenObjective? }` |
| `KeyResultDetailModal` | KR **quick view** (2026-09-27, QV-2): hero, stat strip (same `cur/target` % as the full page), last 3 check-ins (`CheckInTimeline`), up to 5 initiatives (open the initiative drawer), `OkrComments`, `KrProgressConfidenceCard` + Details rail; "View full page" → `/dashboard/key-results/[id]`. Props `{ krId, onClose, onOpenObjective? }` |
| `quick-view-parts` | Shared shell/pieces for both quick views (`QuickViewShell`, `useQuickViewData` with abort + silent realtime refetch, `StatStrip`, `Section`, `RailCard`, `ViewAllLink`…). Spec `docs/okr_quick_view_modals_REQUIREMENTS.md` |
| `ResultsList` | Grouped results list |
| `FiltersWorkspace` | The workspace itself (Explorer Analyze view, `/dashboard/key-results`); per-tab sort (`features/filters/sort.ts`) and More options menu (2026-09-25) |

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

### 8.11A Daily Scrum (`features/scrum/`)

Import: `import { ScrumHome, serializeScrumUpdate } from '@/features/scrum'`

| Component / Service | Purpose |
|---------------------|---------|
| `ScrumHome` | `/dashboard/scrum` — submit, wall (month/week/day/streak/analytics), saved views, blockers, celebrate, absences |
| `ScrumWinsPage`, `ScrumSettingsPage`, `ScrumActivityPanel` | Wins feed, settings, OKR/project activity panel |
| `ScrumUpdateCard`, `ScrumCalendarViews`, `ScrumBlockerDialogs`, `ScrumAbsenceModal`, `ScrumSavedViewsMenu` (internal) | F4 UI pieces (2026-09-25) |
| `serializeScrumUpdate()` | Mood privacy choke point: mood is present only for the subject or active direct manager |
| `drafts` (`SUBMITTED_SCRUM_UPDATE_WHERE`, `excludeScrumDrafts`, `isScrumDraft`) | Server-side drafts (2026-09-25); spread into every counting read |
| Working-day utilities | Timezone-aware date keys, previous working day, business-day counts, lateness checks |

### 8.11B Performance & Scorecard (`features/performance/`)

| Component | Purpose |
|-----------|---------|
| `PerformanceHome` | Employee focus, weekly step, and review history |
| `TemplatesWorkspace`, `TemplateBuilder` | Template/version management and builder |
| `CultureLibraryManager` | Admin editor for reusable criterion-library entries |
| `RoleMappingManager`, `MetricMappingManager` | Template resolution and employee KR source mapping |
| `CyclesWorkspace`, `CycleIssuesModal`, `EvaluatorQueue` | Cycle administration (create with validation, open, close with incomplete-evaluation override), per-cycle issue resolve/waive, and evaluator work queue |
| `ScoringWorkspace`, `PanelManager`, `CalibrationPanel` | Scoring, live metric actuals, evaluator panel management, consolidation retry, and side-by-side calibration |
| `PerformanceReport` | Employee-safe shared/final report and response |
| `ActionsWorkspace` | Development/reward recommendation queue |

### 8.12 Settings Components (`components/settings/`)

| Component | Notes |
|-----------|-------|
| `UserManagement` | User CRUD (uses useState — inconsistent); ADMIN-only create/delete |
| `UserDetail` | User detail page section |
| `TimeframeManagement` | react-hook-form + zod (2026-09-25) |
| `permissions/RecordScopingTab`, `permissions/UserRolesPanel` | Add-rule form on react-hook-form + zod; destructive role/override actions confirm via `ConfirmDialog` (2026-09-25) |
| `SettingsSelect` | Settings form select (Radix) |
| `TeamsManagement` | Team CRUD |
| `OKRRulesManagement` | react-hook-form |
| `BrandingManagement` | react-hook-form |
| `IntegrationsManagement` | react-hook-form |
| `AuditLogsView` | Audit log viewer |
| `LetterPermissionsManagement` | 3-tab: Role Matrix / User Overrides / Letter Types |

### 8.13 Plans Components (`components/plans/`)

| Component | Notes |
|-----------|-------|
| `PlansGantt` | OKR Explorer Timeline view (`PlansList` deleted 2026-09-25). DHTMLX-Gantt. Objective→KR hierarchy, dependency arrows, status/confidence pills, zoom (Week/Month/Quarter/Year) |

### 8.14 Project Management Components (`features/projects/components/`)

| Component | Notes |
|-----------|-------|
| `ProjectWorkspaceClient` | Full-screen project workspace at `/projects/[id]` (the old `ProjectDetailClient` was dead code and was deleted 2026-09-25) |
| `ProjectDeliveryControlCenter` | Team/governance/delivery/reports/integrations/settings drawer; mounts `PortalAccessPanel` |
| `PortalAccessPanel` | **New 2026-09-25.** Portal on/off + client accounts (invite, resend, set password, revoke) |
| `creation/ai-guided/{AiGuidedFlow,AiBriefStep,ClarifyQuestions,AiRevisionPanel,useAiGuided}` | **New 2026-09-25 (G5/C5).** AI-guided creation: brief (+ optional DOCX TOR), clarifying questions, generated plan, constrained revision preview/apply/undo |
| `TextPromptDialog`, `CommitBaselineDialog`, `RebaselineDialog` | **New 2026-09-25.** Replace `window.prompt/confirm`; re-baseline requires a ≥20-char reason |
| `RouteStates` (`ProjectRouteError`, `ProjectListSkeleton`, `ProjectWorkspaceSkeleton`, `ProjectDashboardSkeleton`, `PortalSkeleton`) | **New.** Route loading/error bodies |
| `TemplateListClient` | A2 project template directory: searchable card grid, create/clone/delete modals, and navigation to the builder |
| `TemplateBuilderClient` | A2 template builder: name/description editor, left phase→milestone→activity tree, right properties panel, native HTML5 drag-and-drop reorder, validation, save/create, and system-template clone |
| `DelayLedgerTable` | C5 filtered delay ledger with server totals, inline recovery editing, CSV export, and PDF export |
| `GanttChart` | P3 custom React Gantt using `@tanstack/react-virtual`: split task/timeline panes, virtual rows, persisted columns/width, search, sort, scales, zoom, today marker, minimap, status-colored bars, baseline ghost overlays, progress fill, milestone diamonds, phase summary bars, approval-wait badges, drag/resize, dependencies, D4 toolbar/export, column/options persistence, critical path, undo, duplicate |
| `ProjectViewSwitcher` | E1 six-view project surface: Gantt, sortable/editable Table, drag/drop status Board, cross-project Workload heatmap, ReactFlow Mindmap, and Overview ring/registers with persisted Zustand filters |
| `ChartWrapper` | J1 shared chart shell with AP design tokens, responsive/dark styling, and PNG export for Recharts SVGs plus custom chart surfaces |
| `ProjectChartsLibrary` | J1 C1-C24 project chart catalog rendered in the Overview tab, including C24 completion ring/KPI tiles and C18 ranked Pareto with cumulative line |
| `ClientReportsPanel` | J2 PM-facing R2 workflow panel for generating, editing, submitting, approving, sending, and PDF-exporting bi-monthly client reports |
| `PortfolioWbrPanel` | J3 portfolio WBR surface for generating/viewing weekly business review packs, inspecting SPI/red/recovery-plan counts, and downloading PDF |
| `PerformanceReportsPanel` | J4 Jira-gated R3/R4 report surface for generating daily/weekly/sprint/monthly individual and team reports, editing insights, and exporting PDFs |
| `ManagementReportsPanel` | J5 R6/R7/R9/R10 report surface for monthly/quarterly steering, COE, estimation learning, and capacity/bench report generation, PM summary workflow controls, and PDF export |
| `AiAssistantPanel` | J6 constrained AI assistant modal launched from the Gantt toolbar. Intent selector, optional context, capped data-grounded output, grounded-in metadata, PM-approval warning, and copy-to-clipboard only (no send/client/auto-send path) |
| `ProjectObjectiveLinker` | K1 objective selector on project detail; links/unlinks `Project.objectiveId` |
| `MilestoneKeyResultLinker` | K1 KR selector on milestone rows; links/unlinks `Milestone.keyResultId` |
| `ObjectiveDeliveryPanel` | K1 objective-detail panel showing linked projects with RAG, SPI, completion %, and slip days |
| `PortfolioDashboard` | K2 CEO portfolio dashboard with summary KPIs, project table, filters, escalations, and real-data charts |
| `PortfolioFilters` | K2 client/PM filters for the portfolio dashboard |
| `PortfolioChartsLibrary` | K2 real-data portfolio chart catalog: C1 RAG wall, C6 delay by owner, C9 client health, C17 bubble, C18 Pareto, C20 bench forecast |
| `PortfolioReportPanel` | K3 cross-project performance report list/generate/download panel |
| `ActivityDetailPanel` | F1/F2 right-side activity drawer with header actions, editable fields, owner-party radio, approval-clock banner, subtasks, threaded TipTap comments, default-internal visibility, client-visible toggles, client-author badges, undo saves, and C4 slip gate for baselined date edits |
| `RaidRegister` | H1 RAID register with Risks/Assumptions/Issues/Dependencies tabs, type-specific fields, 5×5 risk matrix, days-open display, client-visible toggles, high-risk confidence feed, and overdue client-dependency DelayEvent action |
| `ChangeControlBoard` | H2 change-control register with CR workflow, client sign-off capture, approved scope-addition DelayEvent creation, affected-activity due-date shifting, and scope-volatility total |
| `StageGateRegister` | H3 stage-gate register with per-phase entry/exit/deliverable/approval checklists, pass/waive/fail status controls, waiver reason capture, and reportable gate statuses |
| `ClientObligationsRegister` | H4 client obligations register with named responsible people, SLA business days, contractual/R6 flag, compliance rate, breach count, computed client health score, and CEO warning below 60 |
| `CorrectionOfErrorsRegister` | H5 COE register with milestone/RED auto-prompts, 5-Whys closure guard, root-cause Pareto counts, overdue CEO warning, systemic fix, template feedback, and Lessons Learned rows |
| `PaymentMilestonesRegister` | H6 payment milestone register with linked activity approval trigger, ready-to-invoice state, finance notification path, invoice/paid actions, outstanding days, and CEO overdue warning |

### 8.15 Project Management Services (`features/projects/services/`)

| Service | Notes |
|---------|-------|
| `portal-serializer` | I2 client-portal data path with narrow client DTOs, owner anonymization, forbidden user/cost/Jira key stripping, employee-name redaction, and SQL filter helpers for scoped projects, client-visible comments/attachments, and client-visible RAID |
| `portal-dashboard` | I3 pure portal dashboard helpers for flattening anonymized activity paths, computing client awaiting-action business-day counters, and mapping DelayEvents into honest schedule-change rows |
| `lib/projects/jira-crypto` | P6 6.1 AES-256-GCM Jira token helper using `JIRA_TOKEN_ENCRYPTION_KEY`, versioned ciphertext, random IVs, and strict 32-byte key parsing |
| `jira/connection` | G1 Jira connection service for URL/key normalization, safe metadata serialization, Jira credential testing, issue/sprint counts, and 401/403/404/429 error mapping |
| `jira/sync` | G2 Jira sync engine for incremental issue search, board/sprint pulls, worklogs, changelogs, 10 req/sec throttling, 429 backoff, email→User resolution, and `JiraSyncLog` persistence |
| `jira/rollup` | G3 Jira mapping and auto-rollup service for Manual/Epic/Label/Component/Sprint mappings, story-point weighted completion, preview, and same-transaction project rollup after sync |
| `jira/metrics` | G4 developer evidence service for working-day idle detection, per-issue estimate accuracy, median estimator bias, and Performance/R3 reuse |
| `lib/performance/project-jira-metrics` | Performance module import surface for G4 Jira idle/estimate metrics over a review-cycle date window |
| `jira/adoption` | G5 project/team Jira data-quality score for assignees, estimates, recent updates, story-point coverage, and low-quality warnings |
| `scrum-attendance` | G6 project scrum attendance service for quick-log records, attendance percentages, late/absent counts, team rate, and <70% flags |
| `lib/performance/project-jira-adoption` | Performance/R4 import surface for Jira adoption score evidence |
| `lib/performance/project-scrum-attendance` | Performance/R5 import surface for project scrum attendance accountability |
| `lib/portal-auth` | I1 separate client-portal NextAuth config using `ClientPortalUser`, distinct portal cookies, portal-only session fields, projectIds hard-scope helper, and dashboard-block predicate |
| `lib/api/withPortalAuth` | I1 portal API guard wrappers for client-portal session auth and per-project `projectIds` authorization |

### 8.16 Client Portal Pages (`app/portal/`)

| Page | Notes |
|------|-------|
| `/portal/signin` | I1 client portal sign-in page posting to the distinct `/api/portal/auth` NextAuth base path |
| `/portal` | I1 portal shell with scoped project list for client sessions and internal preview banner for internal users |
| `/portal/projects/[id]` | I3 client portal dashboard with "Awaiting Your Action" first, live business-day counters, anonymized schedule bars, honest delay table, published reports, client-visible RAID, and internal preview banner |
| `PortalCommentBox` | I3 client comment reader/writer for awaiting actions; calls portal-only comment APIs that write `isClientAuthor=true` and notify the PM |
| `/portal/accept-invite` | **New 2026-09-25.** Invitee sets a password from a single-use token |
| `PortalSignOutButton`, `PortalProjectSwitcher` | **New 2026-09-25.** Portal sign-out and project switcher |
| `PlannedVsActualTab`, `ChangeRequestsTab` | **New 2026-09-25.** Project page tabs: baseline vs current + slip; client-visible change requests (no names/cost) |

### 8.17 Dashboard Components (`components/dashboard/`)

| Component | Notes |
|-----------|-------|
| `MyOKRsPage` | My OKRs (own + contributed objectives), under `CheckInQueue` |
| `AppleDashboard` | Home; `?checkin=1` opens the check-in picker |
| `CheckInQueue` | **New 2026-09-25.** Due check-ins on My OKRs |
| `SectionError` | **New.** `error.tsx` body: reports, recovers stale chunks, retry |
| `CheckInBanner`, `HeroStats`, `NeedsAttention`, `QuickStats`, `TeamActivityFeed`, `UserOkrTree`, `AppleAnalytics` | Live widgets. Seven orphans (AtAGlanceRow, ConfidenceTracker, DashboardStats, MyActivityFeed, RecentObjectives, SprintWidget, TopSummaryBoxes) deleted 2026-09-25 |

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
| `useOkrOptions(opts)` | `{ objectives, isLoading, … }` | Objectives with nested KRs for OKR pickers |
| `useLinkPreview(url)` | `{ preview, isLoading, isError }` | Link-preview metadata (24 h cache) |
| `useRealtimeRefresh({ channel, events, onRefresh, debounceMs?, maxWaitMs?, ignoreActorId?, shouldDefer?, enabled? })` | `void` | **New 2026-09-25.** Debounced refetch on private Pusher channel events (sprint board); no-op without Pusher |

---

## 10. State Management (Zustand)

| Store | File | State |
|-------|------|-------|
| `useTodoStore` | `lib/stores/todo-store.ts` | Todo filters (`status`, `priority`, `assigneeId`), selected todo IDs |
| `useNotificationStore` | `lib/stores/notification-store.ts` | In-app notification feed + server `unreadCount` (bell, page, sprint Inbox) — not toasts |
| `useUserPrefsStore` | `lib/stores/user-prefs-store.ts` | UI preferences (`todoViewMode`: modal/sidebar) |
| `useThemeStore` | `lib/stores/theme-store.ts` | Light/dark theme selection |
| `useCmdkStore` | `lib/stores/cmdk-store.ts` | Command palette open/close state |
| `useScrumStore` | `lib/stores/scrum-store.ts` | Daily Scrum draft buffer, yesterday-panel collapse state, calendar view, filter state |

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
| Create / delete (anonymise) users | ✅ | ❌ | ❌ | ❌ |
| Edit users (non-admin fields) | ✅ | via `page.settings.users` feature | via feature | via feature |
| Grant/revoke ADMIN, change an admin's status | ✅ (last active ADMIN protected) | ❌ | ❌ | ❌ |
| Integrations settings (`/api/settings/integrations`) | ✅ | ❌ (removed 2026-09-25) | ❌ | ❌ |
| Letter admin (`button.letter.admin` = `letter.view_all`): all letters, templates, enclosure override | ✅ | ❌ | ❌ | ❌ |
| Create to-do label / edit / delete | ✅ / ✅ / ✅ | ✅ / ✅ / ❌ | ✅ / ❌ / ❌ | ✅ / ❌ / ❌ |
| See all sprint boards | ✅ | ✅ | invited only | invited only |
| Sign up (public) | — | — | — | creates inactive EMPLOYEE; admin activates |
| Manage departments | ✅ | view own | view own | view own |
| Manage timeframes | ✅ | ✅ | ❌ | ❌ |
| Set org notification defaults | ✅ | ❌ | ❌ | ❌ |
| Trigger cron | ✅ | ❌ | ❌ | ❌ |
| Approve alignment requests | ✅ | ✅ | own reports | ❌ |
| Comment / mention | ✅ | ✅ | ✅ | ✅ |
| Watch any visible entity | ✅ | ✅ | ✅ | ✅ |

### 11.4 Letter Permissions (DB-driven)

Stored in `LetterRolePermission` (role matrix) and `LetterUserPermission` (per-user overrides). Resolved by `lib/letter-permissions.ts::checkLetterPermission()`. Editable at runtime via Settings > Letter Permissions (Admin only).

Key permissions: `letter.read`, `letter.create`, `letter.edit`, `letter.delete`, `letter.submit`, `letter.approve`, `letter.send`, `letter.archive`, and `letter.view_all` — which since 2026-09-25 maps to the real admin feature key **`button.letter.admin`** (`LETTER_ADMIN_FEATURE_KEY`, seeded ADMIN-only in `scripts/seed-permissions.ts`; `canAdministerLetters()`). `LETTER_PERMISSION_TARGETS` maps each letter permission to its doctype/feature. Every letter read path goes through `letterReadGuard` (`lib/letter-access.ts`), which 404s out-of-scope letters.

### 11.5 DTP Permissions

Role tags: `poolCoordinatorIds` (CSV in DtpSettings), `operationsManagerIds` (CSV in DtpSettings), `primaryCoordinatorId` / `alternateCoordinatorId` (per-department). Coordinators approve/reject plans. Pool coordinators assign drivers.

### 11.6 OKR visibility (2026-09-25)

`lib/okr/visibility-scope.ts` is the single rule, in SQL (`buildObjectiveVisibilityWhere`/`buildKeyResultVisibilityWhere`) and in memory (`canViewObjectiveInMemory`/`canViewKeyResultInMemory`); `canViewObjective`/`canViewKeyResult` in `lib/permissions.ts` delegate to it. Every role may see every non-private objective; a private one is redacted unless the viewer is ADMIN/EXECUTIVE, the owner or the owner's current manager. The objective detail page 404s when the objective is missing, DELETED or not viewable. OKR menu actions use `lib/okr/action-permissions.ts` (`canDeleteObjective`: ADMIN/EXECUTIVE/owner; `canCloneObjective`: ADMIN/EXECUTIVE/DEPARTMENT_LEAD; `canCloneKeyResult`).

### 11.7 Security invariants (2026-09-25 remediation)

| # | Invariant | Where enforced / tested |
|---|-----------|-------------------------|
| S-1 | Every `/api/cron/*` route authenticates with a ≥16-char `CRON_SECRET` in a header, timing-safe, fail-closed (503) | `lib/cron-auth.ts`; `lib/security/cron-auth.test.ts` |
| S-2 | Credentials: one `verifyCredentials`; passwordless/inactive/unknown/wrong all identical; rate-limited | `lib/auth.ts`; `lib/security/auth-hardening.test.ts` |
| S-3 | Reset/activation tokens are CSPRNG and stored hashed; sessions older than `passwordChangedAt` are rejected | `lib/security/auth-tokens.ts`, `lib/auth.ts` |
| S-4 | Public sign-up can never choose a role; accounts start inactive; no email enumeration (register, forgot) | `app/api/auth/register`, `app/api/auth/forgot-password` |
| S-5 | `withFeature` denies when the permission lookup fails | `lib/api/withAuth.ts`; `lib/security/platform-hardening.test.ts` |
| S-6 | Integrations settings ADMIN-only and masked | `app/api/settings/integrations/route.ts` |
| S-7 | Telegram `/ask` only in allowlisted chats, rate-limited, timing-safe secret | `lib/telegram/access.ts` |
| S-8 | CSP + security headers on every response; no wildcard image hosts | `next.config.js` |
| S-9 | Stored HTML is sanitised server-side (letters, scrum remarks/items, retrospectives) and rendered through DOMPurify or a sandboxed iframe | `lib/letter-sanitize.ts`, `features/scrum/services/html.ts`, `lib/okr/retrospective-input.ts`; `lib/letters-security.test.ts` |
| S-10 | Puppeteer renders with JS off and only data:/about:/blob:/Google-Fonts requests | `lib/letter-pdf-puppeteer.ts` |
| S-11 | Uploaded files never live under `public/`; served only through authenticated routes (`/uploads/*` 404 in middleware) | `lib/attachments/*-storage.ts`, `lib/letter-enclosure-storage.ts`; `lib/attachments/project-upload.test.ts` |
| S-12 | Portal: every response through `portal-serializer.ts`; no employee name (incl. inactive users) in comment bodies; attachments filtered by `CLIENT_VISIBLE` in SQL; `callbackUrl` limited to `/portal` | `lib/projects/portal-routes-invariant.test.ts`, `portal-route-guards.test.ts` |
| S-13 | Object-level reads: objective page, card GET (`canReadTodo`), risks, letters, scrum records, sprint boards | `lib/security/{okr,card,sprint}-access-invariants.test.ts` |
| S-14 | Every performance mutation writes `ActivityLog` | `app/api/performance/audit-coverage.test.ts` |
| S-15 | Realtime channels are private and per-viewer: `private-user-<own id>`, `private-sprint-<id>` (`canViewSprint`), `private-objective-/private-keyresult-<id>` (unredacted view only); payloads carry no content | `app/api/pusher/auth`, `lib/okr/realtime.ts` (`lib/okr/realtime.test.ts`) |
| S-16 | OKR comments readable/postable only with an unredacted view of the entity; comment notifications only to recipients who can view it | `lib/okr/comment-access.ts`, `lib/comments.ts` |
| S-17 | Change requests reach the portal only when `CLIENT_VISIBLE` (SQL filter), without names or cost; project creation provenance is server-owned (422 on client edits) | `app/api/portal/projects/[id]/change-requests`, `lib/projects/creation-provenance.ts` |
| S-18 | No `app/**/page.tsx` imports Prisma (thin pages) | `*.server.ts` loaders (§3) |

---

## 12. Notification System

Source: `lib/notifications/` — `events.ts`, `dispatcher.ts`, `jobs.ts`, `preferences.ts`, `recipients.ts`, `redact.ts`, `deep-link.ts`, `row.ts`.

### 12.0 Read side (added 2026-09-18)

The table was write-only over HTTP until this landed — the dispatcher had been
writing rows since it shipped, but the only reader was the server component at
`/dashboard/notifications`.

| Route | Purpose |
|-------|---------|
| `GET /api/notifications` | `{ items, unreadCount, nextCursor }`. `limit` (1-100, default 20), `unreadOnly=1`, `cursor`. Hits `@@index([userId, isRead, createdAt])`. |
| `PATCH /api/notifications/[id]` | Mark read/unread. **Scoped with `updateMany({ where: { id, userId } })`** — a bare `update({ where: { id } })` would let any caller flip another user's row. 404 on a miss so it does not confirm foreign ids. |
| `DELETE /api/notifications/[id]` | Dismiss, same scoping. |
| `POST /api/notifications/mark-all-read` | Clear the user's unread count. |

`lib/notifications/row.ts` → `toNotificationRow()` is the one place a stored row
becomes a UI row. It exists because the four writers disagree about where the
link goes: the dispatcher writes `entityType`/`entityId`, `lib/comments.ts`
writes `href`, `lib/automations/delivery.ts` writes `url`, and some callers
pre-compute `deepLink`. Only same-origin paths are accepted. Consumed by the
page, `GET /api/notifications`, the header bell and `SprintInboxView`.

### 12.0.1 Realtime (added 2026-09-21)

`POST /api/pusher/auth` authorizes private channels. The check that matters is
that a caller may only subscribe to `private-user-<their own id>`; without it,
any signed-in user could subscribe to anyone else's notification feed. Both
write paths — `dispatcher.ts` and `notifications/direct.ts` — call
`broadcastUserNotification()` after the row is persisted, and `Header.tsx`
binds the event and refetches (the payload is only a signal; the server's
unread count is authoritative). Every failure path is silent: realtime is an
enhancement, and `getPusherServer()` returns null under the placeholder
credentials in `env.example`, so dev degrades to the mount-and-open refresh.

Since 2026-09-25 the same route also authorizes `private-sprint-<id>` (`canViewSprint`; `lib/sprints/realtime.ts`,
`broadcastSprintEvent`) and `private-objective-<id>` / `private-keyresult-<id>` (only when the viewer sees the
objective / key result unredacted; `lib/okr/realtime.ts`). Payloads are signals; pages refetch through
`hooks/useRealtimeRefresh.ts` (debounced, skips the actor's own events). Everything else is 403.

### 12.0.2 The preference gate for direct writers (added 2026-09-21)

`emit()` is the path for anything with a declared `EventKey`. Six writers have
their own vocabularies and called `prisma.notification.create*` directly, which
meant they honoured **no** preference at all: `lib/comments.ts`,
`lib/letters-notify.ts`, `lib/dtp/notifier.ts`, `lib/automations/delivery.ts`
and both `request-checkin` routes. They now share
`lib/notifications/direct.ts` → `writeDirectNotifications()`, which applies the
same `inApp` gate `emit()` applies and reports which recipients may still be
emailed so each caller keeps owning its own delivery.

Three categories were added at the same time so those writers have a switch to
respect: **`TRAVEL`** (written all along by `lib/dtp/notifier.ts` as a value
that was not in `ALL_CATEGORIES`, so it never appeared in the preferences UI
and could not be turned off by anyone), **`LETTER`** and **`AUTOMATION`** (both
previously filed under `ADMIN`, so muting admin digests muted them too).
`ensureOrgDefaults()` maps over `ALL_CATEGORIES`, so the new ones seed to
`inApp: true, email: true` and behaviour is unchanged until a user opts out.

`grep -rn "prisma.notification.create" lib/ app/` outside `lib/notifications/`
now returns nothing. Keep it that way.

### 12.0.3 Delivery off the request path + BATCHED default (added 2026-09-25)

`emit()` (`lib/notifications/dispatcher.ts`) now resolves recipients inline and hands delivery (row write, Pusher, email) to `lib/notifications/fanout.ts`, scheduled after the response by `lib/background.ts` `runAfterResponse` (bounded concurrency: 2 deliveries × 5 recipients). ~36 routes stopped awaiting it. Crons, scripts and `lib/projects/{project-digest,approval-escalations}.ts` use **`emitNow()`**, which resolves only after delivery; the automations worker calls `flushBackgroundWork()`. `lib/notifications/direct.ts` gained `writeDirectNotificationsNow`.

Email cadence vocabulary lives in `lib/notifications/cadence.ts`: `BATCHED` (default for new rows — schema default changed from IMMEDIATE), `IMMEDIATE`, `DAILY`, `WEEKLY`, `DISABLED`. BATCHED mail drains every 10 minutes (`/api/cron/notifications?job=batch`). Existing org defaults are moved with `scripts/notifications-set-batched-defaults.ts` (dry-run → apply). The duplicate mention email (IMMEDIATE `emit` + a direct `sendMail`) is gone. Both settings pages render all 15 categories from `CATEGORY_LABEL`.

### 12.1 Flow

```
domain code → emit(eventKey, payload)          (emitNow() in crons/scripts)
  ├─ resolveRecipients()     ← role-based routing per event (inline)
  └─ after the response (fanout.ts):
  ├─ getUserPrefsBulk()      ← per-user override or org default
  ├─ redact()                ← privacy mask for isPrivate entities
  ├─ renderTemplate()        ← subject / text / html
  ├─ write Notification row (in-app)
  └─ email:
       IMMEDIATE → sendMail() now
       BATCHED (default) / DAILY / WEEKLY / MONTHLY → enqueue to EmailDigestQueue
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
| `PERFORMANCE` | PERF_CYCLE_OPENED, PERF_DRAFT_SHARED, PERF_WEEKLY_FOCUS | — |
| `PROJECT` | PROJECT_CREATED, ACTIVITY_BLOCKED, CLIENT_APPROVAL_PENDING | — |
| `SCRUM` | SCRUM_REMINDER, SCRUM_BLOCKER_RAISED, SCRUM_BLOCKER_RECURRING, SCRUM_TEAM_MOOD_ALERT, SCRUM_MANAGER_DIGEST, SCRUM_OBJECTIVE_NEGLECTED | — |
| `TRAVEL` | DTP plan events (`lib/dtp/notifier.ts`) | — |
| `LETTER` | submitted / approved / rejected / sent (`lib/letters-notify.ts`) | — |
| `AUTOMATION` | Briefing delivery (`lib/automations/delivery.ts`) | — |

15 categories in total (`CATEGORY_LABEL`, `lib/notifications/events.ts`); only `ACCOUNT` is mandatory.

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

All cron routes are secured by `withCronAuth` (`lib/cron-auth.ts`) — header-only `CRON_SECRET` (≥16 chars, else every call 503s), timing-safe.

> **`scripts/install-crontab.sh` is the single source of truth for the schedule**, and `docs/CRON.md` documents what it installs. Add a route to the installer and to `docs/CRON.md` together. Since 2026-09-25 the installer refuses to run without a valid `CRON_SECRET` and rewrites legacy `?key=` entries to the `Authorization` header; **re-run it after deploy** so the new jobs are installed. Times are **UTC** (EAT = UTC+3).

| Job | Route | Schedule (UTC) | Purpose |
|-----|-------|----------------|---------|
| Sprint tick | `/api/cron/sprint-tick` | `0 * * * *` | Sprint lifecycle transitions |
| Sprint deadlines | `/api/cron/sprint-deadlines` | `0 9 * * *` | Sprint deadline warnings |
| To-do reminders | `/api/cron/todo-reminders` | `*/5 * * * *` | Per-card reminder lead times |
| Automations tick | `/api/cron/automations-tick` | `* * * * *` | Enqueue due automation slots |
| Automations reap | `/api/cron/automations-reap` | `*/5 * * * *` | Reclaim expired worker leases |
| Automations prune | `/api/cron/automations-prune` | `30 3 * * *` | Automations retention |
| To-do recurrence | `/api/cron/todo-recurrence` | `0 1 * * *` | Next occurrence of recurring cards |
| Approval clock | `/api/cron/approval-clock` | `0 8 * * *` | Client approval SLA escalations (Invariant #3) |
| Project health | `/api/cron/project-health` | `0 2 * * *` | Confidence/RAG/SPI/CPI for active projects |
| Project digest | `/api/cron/project-digest` | `0 7 * * *` | PM digest |
| Client report | `/api/cron/client-report` | `0 3 * * 1` | **Newly scheduled 2026-09-25.** R2 drafts (one per project per semi-monthly period) |
| WBR pack | `/api/cron/wbr-pack` | `0 3 * * 1` | **Newly scheduled.** Weekly Business Review pack |
| Jira sync | `/api/cron/jira-sync` | `*/30 * * * *` | **Newly scheduled.** Jira pull for active connections |
| Notification batch | `/api/cron/notifications?job=batch` | `*/10 * * * *` | BATCHED email drain (default cadence) |
| Notifications daily / weekly / monthly | `?job=daily` / `weekly` / `monthly` | `0 4 * * *` / `5 4 * * 1` / `10 4 1 * *` | Digest drains |
| Check-in escalation | `?job=escalation` | `0 6 * * *` | Missed check-in 7d/14d |
| To-do due sweep | `?job=todos` | `0 5 * * *` | `TODO_DUE_TOMORROW` / `TODO_OVERDUE` |
| Timeframe watcher | `?job=timeframes` | `30 3 * * *` | Timeframe lifecycle events |
| Admin digests | `?job=admin-weekly` / `admin-monthly` | `15 4 * * 1` / `20 4 1 * *` | Admin summaries |
| Weekly digest | `/api/cron/weekly-digest` | `25 4 * * 1` | Weekly OKR digest |
| Auto-confidence | `/api/cron/auto-confidence` | `0 0 * * *` | Confidence recalculation (chunked reads 1000 / writes 100) |
| Prune activity | `/api/cron/prune-activity` | `30 0 * * *` | Old ActivityLog rows |
| Prune notifications + retention | `/api/cron/prune-notifications` | `45 0 * * *` | **Own route since 2026-09-25** (installer migrates the old `?job=prune-notifications` line). Notifications + `pruneRetainedTables()` (EmailDigestQueue 30 d, OutboundEmail 90, ClientErrorLog 30, TelegramMessage 180, AiGenerationLog 180, JiraSyncLog 30; `RETENTION_*` env) |
| Permission cleanup | `/api/cron/permission-cleanup` | `15 0 * * *` | **Newly scheduled.** Expired role/override cleanup |
| Project-creation draft purge | `/api/cron/project-creation-draft-purge` | `40 0 * * *` | **New.** Expired drafts + retained uploads |
| Scrum health / reminder / finalize / nudge / weekly | `/api/cron/scrum-*` | `0 23 * * *` / `0 5 * * 1-5` / `0 6 * * 1-5` / `5 6 * * 1-5` / `0 13 * * 5` | Daily Scrum rhythm; health also emits `SCRUM_TEAM_MOOD_ALERT` |
| Attachment staging cleanup | `/api/cron/attachment-staging-cleanup` | `50 0 * * *` | **New 2026-09-25 (H2).** Deletes staged comment uploads unclaimed for 24 h, then their files (batched, race-safe, idempotent) |
| Performance nudge | `/api/cron/performance-nudge` | `0 5 * * *` | **Newly scheduled.** Sends only on `PerformanceSettings.weeklyNudgeDay`, idempotent per ISO week |

Deliberately **not** scheduled: `confidence-calc`, `daily-digest`, `sprint-migration-check`.

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
| `lib/objectiveProgress.ts` | `recalcNodeAndAncestors()`, `recalcObjectiveStoredProgress()` | LOOSE + STRICT_DEPENDENCY progress recalculation (cycle-guarded `seen` set since 2026-09-25) |
| `lib/confidence-calc.ts` | `runConfidenceCalc()` | Score = time-elapsed vs progress (40%) + velocity (25%) + initiative completion (15%) + staleness (20%) |
| `lib/activity-log.ts` | `recordActivity()` | Append-only audit trail |
| `lib/letters.ts` | `allocateReferenceNumber()` | `360G/LT/{CL\|OF\|GR}/{SEQ}/{YEAR}` allocation |
| `lib/letter-permissions.ts` | `checkLetterPermission()`, `canAdministerLetters()` | Async permission resolver: DB row → static fallback; letter admin = `button.letter.admin` |
| `lib/letter-access.ts` | `letterReadGuard()`, `buildLetterReadWhere()` | Letter read scope (2026-09-25) |
| `lib/letter-sanitize.ts` | `sanitizeLetterBodyHtml()`, `resolveLetterFont()`, `isAllowedPdfRequestUrl()` | Server-side letter HTML allowlist (2026-09-25) |
| `lib/letter-reports.ts` · `lib/letter-templates.ts` · `lib/letter-enclosure-storage.ts` | `buildLetterReport()` · `resolveTemplateBodyForNewLetter()` · `persistEnclosureFile()` | Letters reporting, templates, enclosure files (2026-09-25 G3) |
| `lib/okr/visibility-scope.ts` | `loadViewerContext()`, `buildObjectiveVisibilityWhere()` | OKR visibility (§11.6) |
| `lib/cron-auth.ts` | `withCronAuth()` | Cron route auth (§14) |
| `lib/security/rate-limit.ts` · `lib/security/auth-tokens.ts` | `hitRateLimit()` · `generateAuthToken()`, `hashAuthToken()` | Auth hardening |
| `lib/background.ts` | `runAfterResponse()`, `flushBackgroundWork()` | After-response work |
| `lib/retention/prune-tables.ts` | `pruneRetainedTables()` | Table retention |
| `lib/users/deleted-account.ts` | `deletedAccountData()` | Admin delete = anonymise |
| `lib/projects/portal-accounts.ts` | `grantPortalAccess()`, `acceptPortalInvite()` | Client-portal accounts |
| `lib/sprints/board-filters.ts` · `lib/sprints/realtime.ts` | `compileBoardFilter()` · `sprintRealtimeChannel()` | Sprint board facets and realtime |
| `lib/attachments/todo-comments.ts` | `hydrateTodoCommentAttachments()` | To-do comment files on `CommentAttachment` |
| `lib/attachments/{access,activity-comments,staging-cleanup,parent-delete}.ts` | `COMMENT_SCOPES`, `withActivityCommentAttachments()`, `sweepAbandonedStagedAttachments()`, `purgeCommentAttachmentsAfterParentDelete()` | Comment-attachment scopes, activity files (internal), nightly staged sweep, cleanup after a parent delete (2026-09-25) |
| `lib/okr/realtime.ts` · `lib/okr/comment-access.ts` | `objectiveRealtimeChannel()`, `canSubscribeToOkrChannel()` · `canAccessOkrComments()` | OKR private channels; OKR comment gate |
| `lib/okr/explorer-params.ts` · `lib/okr/insights-data.ts` · `lib/retired-routes.js` | `parseExplorerView()`, `scopeForLevel()`, `parseInsightsTab()` · `loadAnalyticsOverview()`, `loadProgressDashboard()`, `loadProgressTracking()` · `retiredRouteRedirects()` | OKR Explorer / Insights params and loaders; retired-route redirects |
| `features/scrum/services/drafts.ts` | `SUBMITTED_SCRUM_UPDATE_WHERE`, `excludeScrumDrafts()` | Keep scrum drafts out of counting reads |
| `lib/projects/creation-{docx-schedule,provenance,processing}.ts` · `lib/projects/project-docx-template.ts` | — | DOCX → schedule, server-owned provenance, background upload processing, Word TOR template |
| `lib/projects/ai-guided-*.ts` | `ai-guided-service.ts`, `ai-guided-openai.ts`, `ai-guided-revise.ts` | AI-guided creation (OpenAI only, schema-forced, signed revision previews) |
| `lib/dtp/ec-calendar.ts` · `lib/dtp/api-helpers.ts` | Ethiopian ↔ Gregorian conversion · transition helpers | Leap-year fix; atomic plan transitions → 409 on conflict |
| `lib/chart-colors.ts` | `chartColors`, `chartAlpha()` | Chart colours from tokens |
| `features/scrum/services/working-days.ts` | `previousScrumWorkingDay()`, `isLateSubmission()` | Daily Scrum timezone, working-day, holiday, and cutoff math |
| `features/scrum/services/scrum-serializer.ts` | `serializeScrumUpdate()` | Removes `mood` unless viewer is subject or active direct manager |
| `lib/view-tracking.ts` | `trackView()` | One row per (user, entity, day) |
| `lib/pusher.ts` | `pushToUser()`, `broadcastUserNotification()`, `broadcastSprintEvent()`, OKR objective/key-result broadcast helpers | Real-time Pusher push; `private-sprint-<id>` board events (2026-09-25) |
| `lib/dashboard-navigation.ts` | `navGroups` | Sidebar nav structure |
| `lib/profileMetrics.ts` | `getUserMetrics()` | User activity metrics |
| `lib/reportDashboard.ts` | `loadDashboardPayload()` | CEO + personal dashboard data |
| `lib/keyResultChart.ts` | `buildChartData()` | KR progress chart data |
| `lib/timeframe-utils.ts` | `isTimeframeActive()`, `getTimeframeDates()` | Date range utilities |
| `lib/check-in-cadence.ts` | `isCheckinDue()` | Validate check-in frequency |
| `lib/projects/delay-ledger.ts` | `applyApprovalClock()`, `decideApprovalClockTransition()`, `recordSlipDelayEvent()`, `computeSlipDaysLost()`, `listDelayLedger()`, `computeDelayOwnerTotals()`, `delaysToCsv()` | Approval Clock (C3): starts/stops on APPROVAL_REQUESTED transitions, auto-creates `DelayEvent` + `ApprovalSlaBreach` in-txn; returns notification intents for the caller to `emit()` **post-commit**. Slip attribution (C4): PM-tagged `BASELINE_SLIP` DelayEvent on gated baselined date moves (daysLost = slip increase, never negative). Delay Ledger (C5): filtered query with server-side owner totals + facets, CSV rendering |
| `lib/projects/delay-ledger-pdf.ts` | `renderDelayLedgerPdfHtml()` | Trusted HTML renderer for Delay Ledger PDF export; uses the same filtered rows and server-side totals as C5 |
| `lib/letter-pdf-puppeteer.ts` | `renderLetterToPdf()`, `renderHtmlToPdf()`, `renderHtmlToPng()` | Shared warm Puppeteer browser pool for letter PDFs and trusted HTML/PDF/PNG exports such as the Delay Ledger PDF and Gantt exports |
| `lib/projects/baseline.ts` | `commitBaseline()`, `rebaseline()`, `computeRebaselineDiff()`, `hasBaselineFieldWrite()` | Baseline commit (C1) + formal re-baseline (C2, versioned — prior snapshots preserved, diff preview old→new per activity); the guard rejects raw baseline-field writes (403) on every schedule PATCH route (Invariant #1) — only this module may write them |
| `lib/projects/business-days.ts` | `businessDaysBetween()`, `addBusinessDays()` | Business-day math (weekend/holiday aware) for the approval clock, SLA, idle days |
| `lib/projects/scheduling.ts` | `shiftSuccessors()`, `wouldCreateDependencyCycle()`, `criticalPath()` | Gantt D3 scheduling logic: transitive successor shifts, dependency cycle detection, and CPM-style critical path calculation |

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

**Since 2026-09-25 (U1):** the Tailwind palette (`surface-*`, `ink-*`, `primary/success/warning/danger-*`) reads CSS-variable channels — `rgb(var(--rgb-*) / <alpha-value>)` — defined in `app/globals.css` `:root` and overridden under `:root.dark` (class toggled by `app/theme-body-class.tsx`; follows the OS only when appearance is `system`). One accent, `--ap-accent-lch` (`primary.500/600`). `primary`/`secondary` have `DEFAULT` + `foreground`, so `bg-primary` and default `<Button>`s fill. Light values are byte-identical to the old hex and dark ink meets WCAG (`lib/design-tokens.test.ts`). Size-only type tokens **`text-caption` (11px)** and **`text-micro` (10px)** replace every `text-[11px]`/`text-[10px]`; `cn()` knows all custom font sizes (`extendTailwindMerge`). Charts use `lib/chart-colors.ts`. Every dashboard/projects/portal route has a `loading.tsx` skeleton and an `error.tsx` boundary (`SectionError`, `RouteStates`). Settings selects use `SettingsSelect`; filter bars use `FilterSelect`/`FilterMultiSelect`; native `window.prompt/confirm` replaced by `Modal`-based dialogs.

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
| Schema changes | `scripts/preflight.sql` runs in deploy before `prisma db push` (must be idempotent — enforced by `test:security`); 18 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` added 2026-09-25 |
| CI secrets | Repo-level GitHub secrets |
| Zero-downtime | PM2 graceful reload |
| Cron | System cron (`scripts/install-crontab.sh`) calling API routes with `Authorization: Bearer $CRON_SECRET` (≥16 chars, else 503) |
| CI | `.github/workflows/ci.yml`: all unit suites → `tsc --noEmit` → `npm run lint` → `next build` (20 min) |
| Background work | `runAfterResponse` relies on the long-lived PM2 process; rate limits are in-memory per process |
| Email | `EMAIL_DRIVER=smtp` + SMTP env vars; falls back to log-only |
| Real-time | Pusher — placeholder creds (`dev-placeholder`) will fail; set real creds in env |
| AI | OpenAI (`OPENAI_API_KEY` or the encrypted in-app key) for project creation, sprint planning (only wired provider), automations and Telegram by default; Anthropic (`ANTHROPIC_API_KEY`) optional for Telegram (`TELEGRAM_AI_PROVIDER=anthropic`) |
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET`; `/ask` needs `TELEGRAM_ALLOWED_CHAT_IDS` |
| Private uploads | `TODO_UPLOAD_DIR` (`var/uploads/todos`), `PROJECT_UPLOAD_DIR` (`var/uploads/project-activities`), `LETTER_UPLOAD_DIR` (`var/uploads/letters`), `PROJECT_CREATION_UPLOAD_DIR` (retained creation sources), comment attachments under `UPLOAD_DIR` — all outside `public/`, must be writable by the app user. Creation uploads are scanned by ClamAV (`PROJECT_CREATION_CLAMAV_HOST`/`_PORT`) and fail closed without it |

### 18.1 Required Environment Variables

```
DATABASE_URL
NEXTAUTH_SECRET                  # also signs AI-guided revision preview tokens
NEXTAUTH_URL, APP_URL
PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER (+ NEXT_PUBLIC_PUSHER_KEY/CLUSTER)
EMAIL_DRIVER (smtp | log), EMAIL_SERVER_HOST/PORT/USER/PASSWORD, EMAIL_FROM, EMAIL_FROM_NAME
CRON_SECRET                      # REQUIRED, ≥16 chars (openssl rand -hex 32) — else every cron 503s
OPENAI_API_KEY, ANTHROPIC_API_KEY (optional), TELEGRAM_AI_PROVIDER
TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_IDS
JIRA_TOKEN_ENCRYPTION_KEY, AI_CREDENTIAL_ENCRYPTION_KEY   # 32-byte keys
TODO_UPLOAD_DIR, PROJECT_UPLOAD_DIR, LETTER_UPLOAD_DIR, UPLOAD_DIR, PROJECT_CREATION_UPLOAD_DIR   # writable
PROJECT_CREATION_CLAMAV_HOST, PROJECT_CREATION_CLAMAV_PORT, PROJECT_CREATION_CLAMAV_TIMEOUT_MS
RETENTION_EMAIL_DIGEST_DAYS, RETENTION_OUTBOUND_EMAIL_DAYS, RETENTION_CLIENT_ERROR_DAYS,
TELEGRAM_MESSAGE_RETENTION_DAYS, RETENTION_AI_GENERATION_DAYS, RETENTION_JIRA_SYNC_LOG_DAYS   # optional
NOTIFICATION_BATCH_MINUTES (informational), AUTH_WALLPAPER_SOURCE
```

### 18.2 Deploy checklist for the 2026-09-25 remediation

One commit/push once both sessions are green (tsc + all suites + `next build`) **and the user approves**. Then, in order:
1. Production env (then restart): `CRON_SECRET` ≥16 chars (else every cron 503s); `TELEGRAM_ALLOWED_CHAT_IDS` (empty = `/ask` refused); `NEXTAUTH_SECRET` (also signs AI revision tokens); `LETTER_UPLOAD_DIR` and `PROJECT_CREATION_UPLOAD_DIR` writable; `PROJECT_CREATION_CLAMAV_HOST` (creation uploads fail closed without clamd); `JIRA_TOKEN_ENCRYPTION_KEY`, `AI_CREDENTIAL_ENCRYPTION_KEY`; **real Pusher credentials** (bell, sprint board and OKR realtime).
2. Deploy code; `scripts/preflight.sql` (indexes pre-created `CONCURRENTLY`) then `prisma db push` — `User.passwordChangedAt`, `emailCadence` default `BATCHED`, `LetterTemplate` table, `ChangeRequest.visibility` (+ index), the P1 indexes, and okr-mgt-e6's `Todo.recurrenceAnchorDay`.
3. One-off scripts, dry-run first, then `--apply`: `scripts/notifications-set-batched-defaults.ts`, `scripts/migrate-project-attachments-private.ts`, `scripts/migrate-todo-comment-attachments.ts`; other session: `scripts/update-employee-todo-scope.ts` (**after** the code is live), `backfill-sprint-participants.ts`, `migrate-todo-attachments-private.ts`.
4. Seeds if not yet on prod: `npm run db:seed:scrum-permissions`, `npm run db:seed:scrum-settings`, `npm run db:seed:culture-library`.
5. Re-run `scripts/install-crontab.sh` — installs `attachment-staging-cleanup` (00:50) and the other newly scheduled jobs, rewrites legacy `?key=` lines.
6. Afterwards: browser/visual QA of the remediated pages (not done yet) — see §20.

---

## 19. Feature Status Summary

| Feature | Status |
|---------|--------|
| Authentication (NextAuth, JWT) | ✅ DONE |
| RBAC (Permissions) | ✅ DONE |
| Objectives CRUD + hierarchy + cloning | ✅ DONE |
| Key Results CRUD + check-ins + archiving | ✅ DONE |
| Progress calculation (LOOSE + STRICT_DEPENDENCY) | ✅ DONE |
| Confidence snapshots (bi-weekly + cron) | ✅ DONE |
| Todos / Initiatives CRUD | ✅ DONE |
| Todo comments, checklists, attachments | ✅ DONE |
| Comment attachments + shared attachment viewer (`useAttachmentViewer`) | ✅ DONE (project activity files excluded pending portal-visibility review) |
| Initiative daily updates | ✅ DONE |
| Sprint board (kanban) | ✅ DONE |
| AI Sprint Planning | 🔄 IN PROGRESS |
| OKR Explorer (list/tree/timeline/map/analyze + levels) | ✅ DONE (2026-09-25) |
| Insights (overview/progress/reports/initiatives/period-close) | ✅ DONE (2026-09-25) |
| Filters Workspace (3-tab analytical, sort) | ✅ DONE |
| Goals view, Plans list, Company/Department OKR pages, alignment-map/analytics/progress/reports pages | ↪ RETIRED 2026-09-25 (14 permanent redirects) |
| Dashboard (home, my-okrs) | ✅ DONE (my-tasks → redirect) |
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
| Letter Management (full workflow, real PDF, Odoo w/ mock fallback) | ✅ DONE |
| Letter Permissions (DB-driven) | ✅ DONE |
| Risk Register | ✅ DONE |
| Activity Logging (audit trail) | ✅ DONE |
| View Tracking | ✅ DONE |
| Client Error Reporting | ✅ DONE |
| AI Generation Logging | ✅ DONE |
| Performance & Scorecard core review lifecycle | 🔄 IN PROGRESS |
| Daily Trip Plan (DTP) — web Phase 1 | 🔄 IN PROGRESS |
| Daily Scrum — S1–S11 built | 🔄 IN PROGRESS (manual QA; server drafts done 2026-09-25) |
| DTP — Distance Matrix / VRP Optimizer | 🗓 PLANNED (Phase 2) |
| DTP — Mobile App (Flutter) | 🗓 PLANNED (Phase 2) |
| Telegram Bot — Stage 1 (Q&A) | 🔄 IN PROGRESS |
| Telegram Bot — Stage 2 (Odoo digests) | ⏸ DEFERRED |
| Telegram Bot — Stage 3 (tool use + admin UI) | ⏸ DEFERRED |
| Letter Reporting view (FR-16) | ✅ DONE (2026-09-25) |
| Letter Notifications on transitions | ✅ DONE |
| Letter Template management screen | ✅ DONE (2026-09-25) |
| Letter enclosures (real files) | ✅ DONE (2026-09-25) |
| Performance Excel scorecard seed | ✅ DONE |
| Sprint board facets + realtime | ✅ DONE (2026-09-25; realtime needs real Pusher creds) |
| To-do comment attachments on `CommentAttachment` | ✅ DONE (2026-09-25) |
| Client-portal account management | ✅ DONE (2026-09-25) |
| Security hardening (auth, cron, CSP, rate limits, uploads, object-level reads) | ✅ DONE (2026-09-25; Next 14.2.35) |
| Project creation: DOCX → schedule, provenance, background processing | ✅ DONE (2026-09-25) |
| AI-guided project creation (P3, OpenAI) | ✅ DONE (2026-09-25; behind the AI flag) |
| Portal Planned vs Actual + client-visible change requests | ✅ DONE (2026-09-25) |
| OKR realtime + live comments | ✅ DONE (2026-09-25; needs real Pusher creds) |
| Comment attachments for project activities + scrum, staging cleanup cron | ✅ DONE (2026-09-25) |
| Thin pages (no Prisma in `page.tsx`) | ✅ DONE (2026-09-25) |
| `test:core` suite (RBAC, progress, API, email, DTP, stores, AI providers) | ✅ DONE (2026-09-25) |
| Design tokens → CSS vars, dark mode, caption/micro tokens | ✅ DONE (2026-09-25) |
| ESLint + CI (tests, tsc, lint, build) | ✅ DONE (2026-09-25) |
| Account deletion | ✅ admin-only anonymise (no self-service) |

---

## 20. Known Issues & Refactor Backlog

Resolved 2026-09-25 and removed from this list: objective/KR modal duplication (all on `Modal`/`ConfirmDialog`), `ToDoList` vs `MyTasksList` toggle duplication (`MyTasksList` deleted), company/department page duplication (`OKRLevelView`), letter PDF (real Puppeteer), letter Odoo integration (real, mock fallback), unbounded `Notification` table (nightly prune + retention), Performance Excel seed, performance report visuals (radar/trend/attainment shipped), performance audit integration (`ActivityLog.evaluationId` + audit-coverage test).

| Area | Issue | Priority |
|------|-------|----------|
| Next.js version | Upgraded to 14.2.35 (2026-09-25). Next 14 is EOL; the remaining advisories are fixed only in 15.5.x — major upgrade, user decision | **High** |
| Rate limiting | In-memory per process — not shared across PM2 instances or restarts | Medium |
| `UserManagement` | Uses `useState` instead of `react-hook-form` — inconsistent | Low |
| Sprint legacy tables | `SprintActivity`, `SprintActivityComment`, `SprintActivityTask` — DEPRECATED, slated for removal | Planned |
| Pusher placeholder creds | Realtime (bell, sprint board, OKR pages) needs real credentials; placeholders are rejected by `isUsableCred()` and the UI degrades to refetch-on-open | Blocker if real-time needed |
| Bundle | P3 partial: no dependencies dropped yet | Low |
| Notification quiet hours | All emails fire in server time — no per-user timezone or quiet hours | Low |
| Watcher UI | `Watcher` rows can only be created programmatically — no Watch button in UI | Low |
| DTP Distance Matrix + optimizer | 10-minute placeholder, no VRP suggestions — needs a Google key | Phase 2 |
| Label rename/recolour + global labels | Blocked on decisions A2/A3 | Blocked |
| Calendar view, recurring sub-tasks | Other session (okr-mgt-e6), after this release | Planned |
| dnd-kit migration + board virtualisation | Needs dependency approval | Blocked |
| Custom fields | Not started | Planned |
| Automations P2b / P3 / P4, Telegram stages 2–3 | Keys + SSRF review | Blocked |
| Browser / visual QA | No browser or visual QA of the 2026-09-25 remediation yet (only tsc, lint, 15 test scripts, `next build`) | **High** before release |
