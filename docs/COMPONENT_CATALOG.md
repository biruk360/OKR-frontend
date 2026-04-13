# Component Catalog

> **Purpose:** Inventory of all reusable components. AI and developers check this before creating anything new. Updated after every component change.

## Shared UI Primitives (`components/ui/`)

> Import from the barrel: `import { Modal, ConfirmDialog, EmptyState, StatCard, StatGrid, PageHeader } from '@/components/ui'`

| Component | Props | Replaces | Status |
|-----------|-------|----------|--------|
| `Modal` | `open`, `onClose`, `title`, `icon?`, `iconClassName?`, `size?` (sm/md/lg/xl/2xl), `children`, `footer?`, `closeOnBackdrop?`, `closeOnEsc?`, `hideHeader?`, `scrollBehavior?` ('outside'/'internal'), `stickyHeader?` | 19 duplicate modal wrappers (all migrated including CreateCheckInModal) | DONE |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm`, `title`, `message`, `description?`, `variant?` (danger/warning/info), `icon?`, `confirmLabel?`, `cancelLabel?`, `isLoading?`, `disabled?`, `bullets?`, `bulletsTitle?`, `details?`, `extraContent?` | Delete/Archive modals for Objectives, KRs, Todos, Teams | DONE |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` (ReactNode), `bare?`, `className?` | 8+ identical empty-state blocks | DONE |
| `StatCard` | `label`, `value`, `icon?`, `iconText?`, `tone?` (blue/green/yellow/red/purple/gray/indigo), `trend?` {value, direction}, `helperText?`, `onClick?` | Repeated stat cards across 8+ pages | DONE — adopted in 7 dashboard pages |
| `StatGrid` | `children`, `columns?` (2/3/4/5) | Repeated grid layouts for stat cards | DONE |
| `PageHeader` | `title`, `description?`, `actions?` (ReactNode), `breadcrumb?` | Repeated page header + action bar patterns | DONE |

### Usage Examples

**Modal with form content:**
```tsx
import { Modal } from '@/components/ui'
import { Target } from 'lucide-react'

<Modal
  open={open}
  onClose={onClose}
  title="Create Objective"
  icon={Target}
  size="md"
  footer={
    <>
      <button className="btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={handleSubmit}>Create</button>
    </>
  }
>
  {/* form fields here */}
</Modal>
```

**ConfirmDialog for delete:**
```tsx
import { ConfirmDialog } from '@/components/ui'

<ConfirmDialog
  open={open}
  onClose={onClose}
  onConfirm={handleDelete}
  title="Delete Objective"
  message="This action is permanent and cannot be undone."
  description="You are about to permanently delete this objective and all its associated data."
  variant="danger"
  confirmLabel="Delete Permanently"
  loadingLabel="Deleting..."
  isLoading={isDeleting}
  bullets={[
    'The objective itself',
    `All associated key results (${objective._count?.keyResults || 0})`,
    'All progress tracking data',
    'All comments and activity history',
  ]}
/>
```

**EmptyState:**
```tsx
import { EmptyState } from '@/components/ui'
import { Target } from 'lucide-react'

<EmptyState
  icon={Target}
  title="No objectives yet"
  description="Create your first objective to get started."
  action={<button className="btn-primary" onClick={onCreate}>Create Objective</button>}
/>
```

**StatCard + StatGrid:**
```tsx
import { StatCard, StatGrid } from '@/components/ui'
import { Target, CheckSquare } from 'lucide-react'

<StatGrid columns={4}>
  <StatCard label="Company Objectives" value={objectives.length} icon={Target} tone="blue" />
  <StatCard label="Key Results" value={krCount} iconText="KR" tone="green" />
  <StatCard label="Completed" value={completed} tone="purple" trend={{ value: '+12%', direction: 'up' }} />
  <StatCard label="At Risk" value={atRisk} tone="red" />
</StatGrid>
```

## Shared Components (`components/shared/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `ActivityLogPanel` | `components/shared/ActivityLogPanel.tsx` | `entityType`, `entityId` | Displays activity audit trail for any entity |
| `EntityLink` | `components/shared/EntityLink.tsx` | `entity`, `type` | Navigation link to objective/KR/todo detail |
| `TimeframeBadge` | `components/shared/TimeframeBadge.tsx` | `timeframe` | Badge display for timeframe (Q1 2025, etc.) |

## Layout Components (`components/layout/`)

| Component | File | Description |
|-----------|------|-------------|
| `DashboardShell` | `components/layout/DashboardShell.tsx` | Main dashboard layout wrapper (sidebar + header + content) |

## Feature Components (Current — Pre-Refactor)

> These will be migrated to `features/[name]/` in Phase 5. Listed here for reference.

### Objectives (`components/objectives/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateObjectiveModal` | Form modal | MIGRATED to Modal + useReferenceData (keeps external API) |
| `EditObjectiveModal` | Form modal | MIGRATED to Modal + useReferenceData |
| `DeleteObjectiveModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `CloneObjectiveModal` | Form modal | MIGRATED to Modal |
| `ObjectivesList` | List | Renders objective list with filters |
| `NestedObjectivesList` | List | Hierarchical objective view |
| `CreateObjectiveButton` | Trigger | Opens CreateObjectiveModal |
| `CreateCompanyObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="COMPANY") |
| `CreateDepartmentObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="DEPARTMENT") |
| `CreateIndividualObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="INDIVIDUAL") |
| `EditObjectiveButton` | Trigger | Opens EditObjectiveModal |
| `DeleteObjectiveButton` | Trigger | Opens DeleteObjectiveModal |
| `CloneObjectiveButton` | Trigger | Opens CloneObjectiveModal |
| `ArchiveObjectiveButton` | Action | Direct archive action |
| `UnarchiveObjectiveButton` | Action | Direct unarchive action |

### Key Results (`components/keyresults/`)

| Component | Type | Notes |
|-----------|------|-------|
| `AddKeyResultModal` | Form modal | MIGRATED to Modal |
| `EditKeyResultModal` | Form modal | MIGRATED to Modal |
| `DeleteKeyResultModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `ArchiveKeyResultModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `ArchiveObjectiveButton` | Trigger | MIGRATED — now uses ConfirmDialog (warning variant) instead of `window.confirm()` |
| `OKRLevelView` | Server component | NEW — shared view for Company + Department OKR pages (`level` prop) |
| `CloneKeyResultModal` | Form modal | MIGRATED to Modal |
| `CreateCheckInModal` | Form modal | NOT YET MIGRATED — has sticky header + internal scroll + chart; needs Modal extension |
| `KeyResultsList` | List | KR list under an objective |
| `AddKeyResultButton` | Trigger | Opens AddKeyResultModal |
| `EditKeyResultButton` | Trigger | Opens EditKeyResultModal |
| `DeleteKeyResultButton` | Trigger | Opens DeleteKeyResultModal |
| `CloneKeyResultButton` | Trigger | Opens CloneKeyResultModal |
| `ArchiveKeyResultButton` | Trigger | Opens ArchiveKeyResultModal |
| `UnarchiveKeyResultButton` | Action | Direct unarchive action |

### Todos (`components/todos/`)

| Component | Type | Notes |
|-----------|------|-------|
| `EditTodoModal` | Form modal | MIGRATED to Modal |
| `DeleteTodoModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `AssignUserModal` | Form modal | MIGRATED to Modal |
| `SetDueDateModal` | Form modal | MIGRATED to Modal |
| `ToDoList` | List | Main todo list with status toggle |
| `MyTasksList` | List | User's assigned tasks (DUPLICATES toggle logic from ToDoList) |
| `EditTodoButton` | Trigger | Opens EditTodoModal |
| `DeleteTodoButton` | Trigger | Opens DeleteTodoModal |
| `AssignUserButton` | Trigger | Opens AssignUserModal |
| `SetDueDateButton` | Trigger | Opens SetDueDateModal |

### Dashboard (`components/dashboard/`)

| Component | Type | Notes |
|-----------|------|-------|
| `MyOKRsPage` | Page component | User's OKR overview (has duplicate stat card markup) |
| Various dashboard widgets | Widgets | Stats, charts, quick actions |

### Goals (`components/goals/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateGoalModal` | Form modal | MIGRATED to Modal + useReferenceData |
| `GoalsTable` | List | Table view with empty state (duplicate) |
| `GoalsFeedView` | List | Feed view with empty state (duplicate) |
| `GoalsListView` | List | List view |
| `GoalsFilterBar` | Filter | Filter bar for goals |
| `MyTeamView` | List | Team goals with empty state (duplicate) |

### Sprints (`components/sprints/`)

| Component | Type | Notes |
|-----------|------|-------|
| `SprintBoardClient` | Board | Trello-style kanban board |
| `SprintCardModal` | Form modal | Card detail/edit (has duplicate Owner, KrOption types) |

### Settings (`components/settings/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateTeamModal` | Form modal | MIGRATED to Modal |
| `EditTeamModal` | Form modal | MIGRATED to Modal |
| `DeleteTeamModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `TeamsManagement` | Page section | Team CRUD with empty state (duplicate) |
| `UserManagement` | Page section | User CRUD (uses useState, not react-hook-form — INCONSISTENT) |
| `AuditLogsView` | Page section | Audit log viewer with empty state (duplicate) |
| `OKRRulesManagement` | Page section | react-hook-form |
| `BrandingManagement` | Page section | react-hook-form |
| `IntegrationsManagement` | Page section | react-hook-form |

## Feature Barrels (`features/`)

Strangler-pattern barrels. Import from these for new code:

| Feature | Path | Contents |
|---|---|---|
| Objectives | `@/features/objectives` | 18 exports: modals, buttons, lists, `OKRLevelView`, + shared form/filter types |
| Key Results | `@/features/key-results` | 16 exports: modals, buttons, chart, `KeyResultsList`, + confidence/form types |
| Todos | `@/features/todos` | 11 exports: modals, buttons, `ToDoList`, `MyTasksList`, + form types |
| Goals | `@/features/goals` | 9 exports: `GoalsListView`, `GoalsTable`, `GoalsFeedView`, filter bar, tabs |
| Sprints | `@/features/sprints` | 3 exports: `SprintBoardClient`, `SprintCardModal`, `SprintsListClient` |

Root barrel: `@/features` exposes namespace objects (`objectives`, `keyResults`, `todos`, `goals`, `sprints`) if a consumer needs multiple features.

## Shared Hooks (`hooks/`)

> Import from the barrel: `import { useDebounce, useUsersForSelection, useTimeframes, useDepartments, useReferenceData } from '@/hooks'`

| Hook | File | Returns | Description |
|------|------|---------|-------------|
| `useDebounce(value, delay)` | `hooks/useDebounce.ts` | `T` | Debounce any value by delay |
| `useUsersForSelection()` | `hooks/useUsersForSelection.ts` | `{ users, isLoading, isError, error, refetch }` | Fetch active users for owner/assignee dropdowns (React Query cached) |
| `useTimeframes({ activeOnly? })` | `hooks/useTimeframes.ts` | `{ timeframes, isLoading, isError, error, refetch }` | Fetch timeframes for dropdowns (React Query cached) |
| `useDepartments()` | `hooks/useDepartments.ts` | `{ departments, isLoading, isError, error, refetch }` | Fetch departments with counts (React Query cached) |
| `useReferenceData({ users?, timeframes?, departments?, activeTimeframesOnly? })` | `hooks/useReferenceData.ts` | `{ users, timeframes, departments, isLoading, isError, errors, refetch }` | Combined hook for forms needing all three (parallel fetch) |

### Usage Examples

**Single reference data source:**
```tsx
import { useUsersForSelection } from '@/hooks'

const { users, isLoading } = useUsersForSelection()
```

**All three (forms):**
```tsx
import { useReferenceData } from '@/hooks'

const { users, timeframes, departments, isLoading } = useReferenceData()
// replaces: Promise.all([fetch('/api/users/for-selection'), fetch('/api/timeframes'), fetch('/api/departments')])
```

**Caching:** All hooks share the React Query cache with a 1-minute staleTime (set in `app/providers.tsx`). Opening the same modal twice in under a minute will NOT trigger a refetch — one of the main token/network savings.

## Zustand Stores (`lib/stores/`)

| Store | File | Description |
|-------|------|-------------|
| `useTodoStore` | `lib/stores/todo-store.ts` | Todo filters, selection state |
| `useNotificationStore` | `lib/stores/notification-store.ts` | Notification toast messages |
| `useUserPrefsStore` | `lib/stores/user-prefs-store.ts` | User preferences (sidebar vs modal view) |

## API Helpers (`lib/api/`)

> Import from the barrel: `import { withAuth, withRole, apiSuccess, apiError, ... } from '@/lib/api'`

### Route Wrappers

| Wrapper | Purpose | Example |
|---------|---------|---------|
| `withAuth(handler)` | Enforces session. Returns 401 envelope if absent. Catches all thrown errors. | `export const GET = withAuth(async (req, { session }) => apiSuccess(data))` |
| `withRole(roles, handler)` | Enforces session + role whitelist. Returns 403 if role not allowed. | `export const POST = withRole(['ADMIN','EXECUTIVE'], async (req, { session }) => ...)` |

Handler signature: `(req: NextRequest, ctx: { session: Session, params: P }) => Promise<NextResponse>`

### Response Helpers

| Function | Status | Envelope |
|----------|--------|----------|
| `apiSuccess(data, { status?, message? })` | 200 default | `{ success: true, data }` |
| `apiPaginated(data, pagination, opts?)` | 200 | `{ success: true, data, pagination: { page, limit, total, totalPages } }` |
| `apiError(error, { status?, code?, details? })` | 500 default | `{ success: false, error, code?, details? }` |
| `apiUnauthorized(msg?)` | 401 | error envelope with `code: UNAUTHORIZED` |
| `apiForbidden(msg?)` | 403 | error envelope with `code: FORBIDDEN` |
| `apiNotFound(msg?)` | 404 | error envelope with `code: NOT_FOUND` |
| `apiBadRequest(msg, details?)` | 400 | error envelope with `code: BAD_REQUEST` |
| `apiValidationError(msg, details?)` | 422 | error envelope with `code: VALIDATION_ERROR` |
| `apiConflict(msg, details?)` | 409 | error envelope with `code: CONFLICT` |

### Error Handler

`handleApiError(error, context?)` — auto-called by `withAuth`/`withRole`. Detects Prisma codes (P2002 → 409, P2025 → 404) and falls back to 500.

### Example Migration

**Before (16 lines):**
```ts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const users = await prisma.user.findMany(...)
    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**After (4 lines):**
```ts
export const GET = withAuth(async () => {
  const users = await prisma.user.findMany(...)
  return apiSuccess(users)
})
```

## Utilities (`lib/utils.ts`)

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + twMerge) |
| `formatDate(date, format?)` | Format date string (date-fns) |
| `formatRelativeTime(date)` | "3 hours ago" format |
| `calculateProgress(current, target, start?)` | Progress percentage (0-100) |
| `getProgressColor(progress)` | Tailwind classes for progress color |
| `getProgressBarClass(progress)` | Solid bar fill class |
| `getConfidenceColor(confidence)` | Tailwind classes for ON_TRACK/AT_RISK/OFF_TRACK |
| `truncateText(text, maxLength)` | Truncate with ellipsis |
| `capitalizeFirst(str)` | Capitalize first letter |
| `isValidEmail(email)` | Email regex validation |
| `getErrorMessage(error)` | Extract error message from unknown |
| `hasPermission(userRole, requiredRole)` | **DEPRECATED** — use `lib/permissions.ts` instead |
| `canEditObjective(userRole, level)` | **DEPRECATED** — use `lib/permissions.ts` instead |
