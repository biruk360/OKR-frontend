# AI Context — OKR Management System

> **Purpose:** This file gives AI assistants enough context to work in this repo without scanning the entire codebase. Read this + CLAUDE.md before doing anything.

## What This App Does

A full-stack OKR (Objectives & Key Results) management platform. Users set company/department/individual objectives, track key results with check-ins, manage to-do initiatives, run sprint boards, and view analytics/reports. Role-based access (ADMIN → EXECUTIVE → DEPARTMENT_LEAD → EMPLOYEE).

## Project Structure

```
OKR-frontend/
├── app/                          # Next.js App Router (routes + API)
│   ├── api/                      # REST API endpoints
│   │   ├── objectives/           # CRUD + children, labels, activity, views, clone, alignment
│   │   ├── keyresults/           # CRUD + check-ins, activity, views, archive, clone, todos
│   │   ├── todos/                # CRUD for initiatives
│   │   ├── sprints/              # CRUD + columns, activities, comments, tasks
│   │   ├── users/                # CRUD + for-selection, direct-reports, departments
│   │   ├── departments/          # CRUD
│   │   ├── timeframes/           # CRUD
│   │   ├── settings/             # okr-rules, branding, integrations
│   │   ├── initiatives/          # Daily initiative updates
│   │   ├── labels/               # Label management
│   │   ├── cron/                 # confidence-calc, weekly-digest
│   │   └── health/               # Health check
│   ├── auth/                     # Sign-in, sign-up pages
│   └── dashboard/                # All authenticated UI pages (see docs/SITEMAP.md)
│
├── components/                   # Shared / cross-cutting React components
│   ├── ui/                       # Shared primitives (Modal, ConfirmDialog, StatCard, EmptyState, PageHeader, ...)
│   ├── layout/                   # DashboardShell, DashboardTitleContext
│   ├── shared/                   # ActivityLogPanel, EntityLink, TimeframeBadge
│   ├── dashboard/                # Dashboard widgets + MyOKRsPage
│   ├── hierarchy/                # Org hierarchy visualization
│   ├── initiative-report/        # Daily updates report grid
│   ├── plans/                    # Planning components
│   ├── profile/                  # User profile components
│   ├── reports/                  # Reporting components
│   ├── settings/                 # Settings panels (users, teams, timeframes, branding, etc.)
│   └── todos-page/               # Dedicated todos page layout
│
├── features/                     # Feature modules — each with barrel + ./components/
│   ├── objectives/               # 18 files + barrel
│   ├── key-results/              # 16 files + barrel
│   ├── todos/                    # 11 files + barrel
│   ├── goals/                    # 9 files + barrel
│   ├── sprints/                  # 3 files + barrel
│   └── index.ts                  # root namespace barrel
│
├── hooks/                        # Shared React hooks
│   └── useDebounce.ts            # Only hook currently
│
├── lib/                          # Server + shared utilities
│   ├── auth.ts                   # NextAuth config (Credentials provider, JWT)
│   ├── prisma.ts                 # Prisma client singleton
│   ├── permissions.ts            # RBAC: canCreateObjective, canEditObjective, etc. (13 functions)
│   ├── utils.ts                  # cn(), formatDate, calculateProgress, getProgressColor, etc.
│   ├── objectiveProgress.ts      # recalcObjectiveStoredProgress, recalcNodeAndAncestors
│   ├── activity-log.ts           # recordActivity() — append-only audit trail
│   ├── confidence-calc.ts        # Bi-weekly confidence snapshots
│   ├── check-in-cadence.ts       # Check-in frequency validation
│   ├── timeframe-utils.ts        # Date range calculations
│   ├── keyResultChart.ts         # Chart data for KR progress
│   ├── keyResultNumbers.ts       # KR value parsing/validation
│   ├── email.ts                  # Email sending (OutboundEmail queue)
│   ├── weekly-digest.ts          # Email digest generation
│   ├── pusher.ts                 # Real-time push notifications
│   ├── view-tracking.ts          # Track who viewed what
│   ├── profileMetrics.ts         # User metrics calculation
│   ├── reportDashboard.ts        # Report data logic
│   ├── dashboard-navigation.ts   # Sidebar nav structure (NavGroup[], NavItem[])
│   ├── dashboard-page-titles.ts  # Page title metadata
│   ├── client-error-report.ts    # Client error logging
│   └── stores/                   # Zustand stores
│       ├── todo-store.ts         # Todo filters, selection
│       ├── notification-store.ts # Notification toasts
│       └── user-prefs-store.ts   # User preferences (sidebar vs modal)
│
├── types/
│   ├── index.ts                  # All shared types (UserRole, ObjectiveLevel, etc.)
│   └── next-auth.d.ts            # Session type augmentation
│
├── prisma/
│   ├── schema.prisma             # Database schema (source of truth)
│   └── seed*.ts                  # Seed scripts
│
└── docs/                         # AI-optimized documentation
    ├── AI_CONTEXT.md             # This file
    ├── COMPONENT_CATALOG.md      # Reusable component inventory
    ├── FEATURE_STATUS.md         # Module status tracker
    ├── SITEMAP.md                # Route map
    ├── CHANGELOG_AI.md           # AI change log
    └── CONVENTIONS.md            # Code conventions
```

## Entrypoints by Task

### "I need to add/modify a UI page"
1. Read `docs/SITEMAP.md` to find the route
2. Read `docs/COMPONENT_CATALOG.md` for available shared components
3. Route file is in `app/dashboard/[page]/page.tsx`
4. Feature components are in `components/[feature]/` (migrating to `features/[feature]/`)

### "I need to add/modify an API endpoint"
1. Route files are in `app/api/[resource]/route.ts`
2. Auth: use `lib/auth.ts` → `getServerSessionSafe()`
3. Permissions: use `lib/permissions.ts`
4. Activity logging: use `lib/activity-log.ts` → `recordActivity()`
5. Types: use `types/index.ts`

### "I need to add/modify a reusable component"
1. Check `docs/COMPONENT_CATALOG.md` first
2. Primitives go in `components/ui/`
3. Cross-feature components go in `components/shared/`
4. Feature-specific components go in `components/[feature]/` or `features/[feature]/components/`

### "I need to work with data/types"
1. All shared types: `types/index.ts`
2. Prisma models: `prisma/schema.prisma`
3. API response types: `ApiResponse<T>`, `PaginatedResponse<T>` in `types/index.ts`

### "I need to understand permissions"
1. `lib/permissions.ts` — 13 permission functions, role hierarchy
2. Roles: ADMIN > EXECUTIVE > DEPARTMENT_LEAD > EMPLOYEE
3. Objective levels: COMPANY > DEPARTMENT > INDIVIDUAL

## Known Duplication (Being Addressed)

See the refactor plan in CLAUDE.md. Key areas:
- 19 modals with identical wrapper structure → consolidating to `components/ui/Modal`
- 20+ action buttons with same pattern → generic ActionButton
- 91+ repeated auth checks → `lib/api/withAuth.ts` middleware
- 4 different API response formats → standard envelope
- Competing permission logic in `lib/utils.ts` vs `lib/permissions.ts`
- Reference data fetched inline in 5+ files each → shared hooks
