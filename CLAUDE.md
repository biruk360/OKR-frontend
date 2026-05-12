# Project Instructions

> **This file is the single source of truth for any AI assistant working in this repo.**
> Read this FIRST before touching any code. Follow every rule below.

## Architecture Overview

This is a **Next.js 14 OKR Management System** — TypeScript, Tailwind CSS, Prisma/PostgreSQL, TanStack Query, Zustand, Pusher.

### Where things live

| Layer | Path | Rule |
|-------|------|------|
| Routes | `app/` | **Thin composition only.** No business logic, no Prisma queries, no fetch calls. Import from `features/` and `components/`. |
| Shared UI | `components/ui/` | Reusable primitives (Modal, Button, StatCard, EmptyState). **Zero business logic.** |
| Layout | `components/layout/` | Shell, sidebar, header. |
| Shared components | `components/shared/` | Cross-feature UI (ActivityLogPanel, EntityLink, TimeframeBadge). |
| Feature modules | `features/[name]/` | Self-contained: `components/`, `hooks/`, `services/`, `types.ts`, `index.ts` barrel export. |
| Shared hooks | `hooks/` | Cross-feature hooks (useDebounce, useUsersForSelection, useTimeframes, useDepartments). |
| Server utilities | `lib/` | Auth, permissions, Prisma client, progress calc, email, activity logging. |
| Zustand stores | `lib/stores/` | Client-side state (todo-store, notification-store, user-prefs-store). |
| Types | `types/` | **All shared types live here.** Never re-declare types that exist in `types/index.ts`. |
| API routes | `app/api/` | REST endpoints. Use `lib/api/withAuth.ts` for auth. Use standard response envelope. |

### Key files to read first

- `docs/AI_CONTEXT.md` — Architecture summary and entrypoints
- `docs/COMPONENT_CATALOG.md` — Every reusable component and its props
- `docs/FEATURE_STATUS.md` — What's built, what's in progress, what's planned
- `docs/SITEMAP.md` — All routes and their owning feature
- `types/index.ts` — All shared TypeScript types
- `lib/permissions.ts` — Role-based access control (RBAC)
- `lib/dashboard-navigation.ts` — Sidebar navigation structure

## Before Writing Code

1. **Run a reuse audit before implementation.** Check existing packages/libraries (`package.json`), features/modules, routes, UI primitives, shared components, hooks, services/utilities, types, design tokens, and established UI patterns.
2. **Read `docs/COMPONENT_CATALOG.md`** — Check if a reusable component already exists.
3. **Read `docs/FEATURE_STATUS.md`** — Check if the feature or module already exists.
4. **Read `types/index.ts`** — Check if the type is already defined.
5. **Read `hooks/` and `lib/`** — Check if a shared hook, service, utility, or API helper exists for what you need.
6. **REUSE existing code.** Do NOT create a new package dependency, component, hook, type, utility, design token, UI pattern, or feature module if an existing one satisfies the need.
7. **Only build new when there is a real gap.** If existing packages, libraries, components, features, UI, or tokens do not fulfill the requirement, prefer extending the closest existing abstraction and document the gap the new code fills.
8. **Check barrel exports** — Read `features/[name]/index.ts` before creating anything new in a feature.

## After Completing Work

**You MUST update these docs after every code change:**

1. **`docs/CHANGELOG_AI.md`** — Add entry with: date, summary, files changed, tests run (or "not run").
2. **`docs/FEATURE_STATUS.md`** — Update if you completed or changed a feature/module status.
3. **`docs/SITEMAP.md`** — Update if routes changed or new pages were added.
4. **`docs/COMPONENT_CATALOG.md`** — Update if a reusable component was added or changed.
5. **If no files were changed, do not update logs.**

## Rules (Non-Negotiable)

### Modularity
- **Features never import from other features directly.** Shared needs go into `components/`, `hooks/`, `lib/`, or `types/`.
- **All modules use barrel exports** (`index.ts`) — import from the barrel, not internal files.
- **Shared type contracts live in `types/`** — never re-declare `UserRole`, `ObjectiveLevel`, or any Prisma model type in a component file.
- **One source of truth for permissions** — use `lib/permissions.ts`. Do NOT add permission logic to `lib/utils.ts` or inline in components.

### UI Components
- **Use `components/ui/Modal`** for all modal dialogs — do NOT build custom modal wrappers.
- **Use `components/ui/ConfirmDialog`** for all delete/archive confirmations.
- **Use `components/ui/EmptyState`** for all empty-data displays.
- **Use `components/ui/StatCard`** for all dashboard stat displays.
- **Use shared data-fetch hooks** (`useUsersForSelection`, `useTimeframes`, `useDepartments`) — do NOT write inline fetch logic for reference data.

### API Routes
- **Use `lib/api/withAuth.ts`** for session checks — do NOT manually call `getServerSessionSafe()` + return 401.
- **Use standard response envelope:** `{ success: boolean, data?: T, error?: string, pagination?: {...} }`.
- **Never use** `{ todos: [...] }` or `{ items: [...] }` or `{ ok: true }` — always use `{ data: [...] }`.

### Forms
- **Standardize on `react-hook-form`** — do NOT use raw `useState` for form state.
- **Validation with Zod schemas** (when added) — do NOT inline validation logic in submit handlers.

### Styling
- **Use `cn()` from `lib/utils`** for conditional Tailwind classes.
- **Use design tokens** (success-*, primary-*, warning-*, danger-*) — do NOT hardcode hex colors.
- **Use `getProgressColor()` / `getConfidenceColor()`** from `lib/utils.ts` — do NOT reimplement color logic.

## Tech Stack Reference

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14 | App Router, API routes |
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Prisma | Latest | ORM (PostgreSQL) |
| TanStack Query | Latest | Server state + caching |
| Zustand | Latest | Client-side stores |
| Tailwind CSS | 3 | Styling |
| react-hook-form | Latest | Form handling |
| Pusher | Latest | Real-time notifications |
| date-fns | Latest | Date formatting |
| Lucide React | Latest | Icons |

## Data Model (Core Entities)

| Entity | Key Fields |
|--------|------------|
| User | email, role (ADMIN/EXECUTIVE/DEPARTMENT_LEAD/EMPLOYEE), departments |
| Objective | title, level (COMPANY/DEPARTMENT/INDIVIDUAL), status, progress, owner, timeframe, parent |
| KeyResult | title, startValue/targetValue/currentValue, confidence, owner, objective |
| Todo | title, status (PENDING/IN_PROGRESS/COMPLETED/CANCELLED), assignee, keyResult |
| Comment | content, author, objectiveId/keyResultId, nested replies |
| Sprint | name, columns (dynamic), activities (kanban cards) |
| Timeframe | name (Q1 2025), type, startDate, endDate |
| Department | name, members via DepartmentMembership |
| ActivityLog | entityType, action, actor, changes (JSON) — append-only audit trail |

## Roles & Permissions

| Role | Can Do |
|------|--------|
| ADMIN | Everything |
| EXECUTIVE | Same as ADMIN for most operations |
| DEPARTMENT_LEAD | Department + individual level objectives, team management |
| EMPLOYEE | Own individual objectives, assigned todos |

See `lib/permissions.ts` for the full matrix.
