# Component Catalog

> **Purpose:** Inventory of all reusable components. AI and developers check this before creating anything new. Updated after every component change.

## OKR Period Close (`components/shared`, `components/period-close-report`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `OkrCloseModal` | `open`, `onClose`, `entityType`, `entity`, `onInitiated?`, `onCommitted?`, `achievedShortcut?` | Shared three-step grade → retrospective → confirm-and-lock flow for Objectives and KRs. |
| `OkrReopenDialog` | `open`, `onClose`, `entity`, `entityType`, `onReopened?` | Reason-required reopen confirmation with permanent-scar and rolled-copy warnings; Objective KRs are opt-in. |
| `OkrLockBanner` | `entityType`, `reopenCount?`, `closedAt?` | Read-only closed-state banner explaining frozen fields and permanent reopen scars. |
| `RolledFromBanner` | `entityType`, `previous?`, `next?`, `lineageDepth?` | Immediate predecessor/successor provenance plus previous-period grade, progress, confidence, check-ins, note, and retrospective panel. |
| `PeriodCloseReportClient` | `report` | Period close KPIs, charts, lessons, ledger, PDF action, and sequenced personal close flow. |

## Daily Trip Plan (`features/daily-trip-plan`)

> Import from the barrel: `import { PlanEditor, CoordinatorConsole, MovementSheetView, RunSheetView, PoolConsole, TravelSettingsForm, TravelHome, dtpApi } from '@/features/daily-trip-plan'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `TravelHome` | — | Employee dashboard surface — recent plans + create-or-open CTA |
| `PlanEditor` | `planId`, `isRequester?` | Two-column plan detail: stops list + status timeline + audit log + sticky footer (submit / withdraw / clone / delete) |
| `StopList` | `planId`, `stops`, `readOnly?`, `showDiff?` | Stop cards with edit / remove + Coordinator-adjustment diff strip |
| `StopEditorModal` | `open`, `onClose`, `initial?`, `onSubmit`, `busy?` | Full stop form (where / when / how / what / logistics) — used for both add and edit |
| `PlanTimeline` | `plan`, `events?` | Vertical state-machine timeline for a plan |
| `StatusBadge` | `status`, `className?` | Pill renderer for the 14 DTP statuses |
| `CoordinatorActions` | `plan` | Approve / Return / Reject action bar — used inside the plan-detail header |
| `CoordinatorConsole` | — | Pending-plans list + KPI strip + filters (date / late / emergency) |
| `MovementSheetView` | `deptId`, `date` (YYYY-MM-DD) | Office-facing Daily Movement Sheet with print CSS + signature blocks |
| `RunSheetView` | `driverId`, `date`, `driverMode?` | Driver-facing Daily Run Sheet — leg cards + confirm-pickup/drop-off buttons |
| `PoolConsole` | — | Pool Coordinator assignment table |
| `TravelSettingsForm` | — | Sectioned admin settings form (SLAs, working hours, traffic, optimization, channels) |
| `dtpApi` | — | Typed fetch client — call from server actions or other features |

Hooks (TanStack Query) exported from the same barrel: `usePlans`, `usePlan`, `useTripTypes`, `useDrivers`, `useVehicles`, `useMovementSheet`, `useRunSheet`, `useDtpSettings`, `useCreateOrOpenPlan`, `useAddStop`, `useUpdateStop`, `useDeleteStop`, `usePlanTransition`, `useAssignDriver`, `useSetLegStatus`, `useUpdateSettings`, `useInvalidatePlan`.

## Daily Scrum (`features/scrum`)

> Import from the barrel: `import { ScrumHome } from '@/features/scrum'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `ScrumHome` | — | P0 foundation page for `/dashboard/scrum`; shows setup status using existing `PageHeader`, `StatCard`, and `EmptyState`. Submission form, calendar wall, and analytics components are pending P1/P2+. |

Services exported from the same barrel: working-day utilities and `serializeScrumUpdate()` mood privacy serializer.

## Performance & Scorecard (`features/performance`)

> Import from the barrel: `import { PerformanceHome, TemplatesWorkspace, TemplateBuilder, CyclesWorkspace, EvaluatorQueue, ScoringWorkspace, ActionsWorkspace } from '@/features/performance'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `PerformanceHome` | — | Employee focus cards, weekly-step entry, sealed reviews, and finalized history |
| `TemplatesWorkspace` | — | Template family/version list, create/publish/fork/archive actions, and role mappings |
| `TemplateBuilder` | `templateId` | Draft tier/criterion editor, rubric anchors, metric rules, culture block insertion, and native drag-drop reordering for tiers/criteria |
| `CultureLibraryManager` | — | Admin editor for reusable criterion-library entries (C1-C6 + custom); bilingual anchor editor; create/toggle-active |
| `RoleMappingManager` | — | Maps normalized employee designations to scorecard families |
| `MetricMappingManager` | `templateId`, `tiers` | Maps employee-owned Key Results to reusable metric criteria |
| `CyclesWorkspace` | — | Review-cycle creation (with inline validation), open/close-cycle actions (close supports incomplete-evaluation override), and issues drill-down |
| `CycleIssuesModal` | `cycleId`, `open`, `onClose` | Per-cycle issue list (type/employee/detail/status) with Resolve/Waive actions |
| `EvaluatorQueue` | — | Evaluator/admin work queue |
| `ScoringWorkspace` | `evaluationId` | Keyboard-driven scoring, live metric actuals, submission, calibration, panel management, consolidation retry, and report access |
| `PanelManager` | `evaluation` | Evaluator panel editor (add/remove evaluators, set lead) with submitted-score discard confirmation |
| `CalibrationPanel` | `evaluation` | Side-by-side evaluator score comparison for calibration, flag-resolution notes, and report/finalization workflow controls |
| `PerformanceReport` | `evaluation` | Employee-safe consolidated report and acknowledgement/dispute actions |
| `ActionsWorkspace` | — | HR recommendation approval/rejection/execution queue |
| `PerformanceStatusBadge` | `status`, `className?` | Status chip in the shared StatusPill visual language (colored dot + humanized label, AP rgba tints); also exports `humanizeEnum()` |
| `SectionCard` (internal) | `title?`, `actions?`, `children`, `className?`, `contentClassName?` | Apple Pro section card (rounded-[14px], `var(--ap-border)`, uppercase kicker header) used across the performance module |
| `NativeSelect` (internal) | native `<select>` props (forwardRef) | Styled native select matching `components/ui/input.tsx`; react-hook-form `register()`-compatible |
| `CompetencyRadar` | `items`, `height?` | Single-series competency radar (% of max per axis); `radarItemsFromTierBreakdown()` derives tier- or criterion-level axes from a report tierBreakdown |
| `PerformanceTrend` | `points`, `height?` | Multi-cycle normalized-score line chart (0-100); single point renders a "more data needed" note |
| `OkrAttainmentSection` | `attainment` | Employee-scoped OKR attainment list (objectives + KRs with progress bars) for the evaluation period |
| `TemplateScoringSettings` | `templateId`, `editable`, `tiers`, `gatekeeperJson`, `bandsJson` | Gatekeeper + decision-bands editor with inline validation, saved via template PATCH |

Hooks and API client are exported from the same barrel. Server-side scoring, policy, cycle-opening, consolidation, report, and finalization services live in `lib/performance/`. Shared anchor helpers (`anchorEn`, `anchorAm`, `buildAnchorValue`) live in `features/performance/components/anchor-helpers.ts`.

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
| `UserManagement` | Page section | User CRUD (uses useState, not react-hook-form — INCONSISTENT). Props: `{ initialUsers, currentUserId, currentUserRole }`. Includes an accessible admin-only Project Manager capability switch backed by `/api/users/[id]/project-manager-capability`, plus a Shield button per row opening a `<Modal size="xl">` with Roles \| Info tab strip and `<UserRolesPanel>`. |
| `AuditLogsView` | Page section | Audit log viewer with empty state (duplicate) |
| `OKRRulesManagement` | Page section | react-hook-form |
| `BrandingManagement` | Page section | react-hook-form |
| `IntegrationsManagement` | Page section | Existing email/Slack react-hook-form settings plus an Administrator-only `AiProviderSettingsPanel` slot. Props: `{ showAiProviderSettings? }`. |
| `AiProviderSettingsPanel` | Page section | Project Creation P0.5–0.7 masked OpenAI credential insert/rotation/removal, approved model, caps, live connection testing, distinct safe outcomes, needs-verification state, last-verified display, and an independent project-creation AI master toggle. Uses react-hook-form/Controller, Skeleton, Checkbox, Button, and ConfirmDialog; full key is write-only and cleared after save. |
| `LetterPermissionsManagement` | Page section | 3-tab component: Role Matrix (toggle grid), User Overrides (per-user grant/revoke), Letter Types (LetterTypeDef CRUD). Consumes `/api/settings/letter-permissions/roles`, `/api/settings/letter-permissions/users`, `/api/letters/types`. ADMIN-only. |

### Permission Manager Tabs (`components/settings/permissions/`)

| Component | Type | Notes |
|-----------|------|-------|
| `UserRolesPanel` | Panel | Props: `{ userId, userName, currentUserId }`. Four sections: Role Profiles (assign/remove), Individually Assigned Roles (assign with optional expiry/revoke), User-Specific Overrides (add/remove with doctypeKey, featureKey, action, overrideType, reason, expiresAt), Effective Permissions (read-only, with "Preview as User" button). Shows self-mod banner and hides all action buttons when `userId === currentUserId`. Uses `/api/permissions/users/{id}`, `.../profiles`, `.../roles`, `.../overrides`. |
| `EffectivePermissionsPreview` | Modal | Props: `{ userId, userName, onClose }`. Full-screen overlay modal. Three sections: (1) Nav Preview — simulated sidebar with green/gray dot per module + collapsible page sub-items; (2) Why can/can't they do X? — DocType + Action selectors with plain-English result (ok/no/warn); (3) DocType Permissions Table — grouped by module, collapsible, shows Read/Write/Create/Delete/Submit columns + Scope. Fetches `GET /api/permissions/preview/{userId}`. |
| `ByDocTypeTab` | Tab panel | Select a DocType (grouped `<optgroup>` by module), fetch all roles + per-doctype role permissions from `GET /api/permissions/doctypes/{key}` + `GET /api/permissions/roles`. Renders Role × 9-Actions grid (checkbox cells) plus a per-row Scope dropdown (own/department/all). Each cell toggle fires `PUT /api/permissions/roles/{roleId}/permissions`. Scope change propagates to all granted actions for that role. Optimistic updates with rollback. |
| `FieldLevelsTab` | Tab panel | Select a DocType, then renders fields table: fieldName, displayLabel, permLevel dropdown (0–3), isSensitive checkbox. Save button fires `PUT /api/permissions/doctypes/{key}/fields`. Preview panel below table shows "Level 0 visibility" and "Level 0+1 visibility" field lists derived from live state. |
| `RecordScopingTab` | Tab panel | Role + DocType dual selectors. Fetches `GET /api/permissions/roles/{id}/scope-rules`, filters by doctypeKey client-side. Rules table: #, Field, Operator, Value Type, Status toggle (`PUT .../scope-rules/{ruleId}`), Delete (`DELETE .../scope-rules/{ruleId}`). Inline Add Rule form (fieldName, operator, valueType, staticValue) submits via `POST .../scope-rules`. Multi-rule AND note shown when >1 rule present. |
| `FeaturesTab` | Tab panel | Role selector; fetches `GET /api/permissions/roles/{id}/features`. Two-panel layout (40/60%). Left: feature tree grouped into Modules, Pages (OKR), Pages (Letters), Pages (DTP), Admin, Widgets; green dot = visible, gray = hidden. Right: visible + enabled toggles with 500ms debounce auto-save via `PUT .../features`; amber banner when parent feature is hidden (inherited OFF). |
| `ExplainPanel` | Tab panel | Self-contained "Permission Check" panel. User dropdown (from `/api/users/for-selection`), DocType selector (8 hardcoded options), Action selector (read/write/create/delete/submit/export). On submit calls `GET /api/permissions/explain?userId=&doctypeKey=&action=`. Displays green/red allowed badge, explanation text, and detail rows (adminBypass, explicitDeny, explicitGrant, roleGrants, scopingApplied, scopeRules). No props. |

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


## Plans

| Component | Purpose |
|-----------|---------|
| `components/plans/PlansList` | Tability-style list view + List/Gantt toggle. Server-rendered rows with aggregated KR/initiative/NCS metrics. |
| `components/plans/PlansGantt` | DHTMLX-Gantt view of all accessible objectives + nested KRs. Columns: title, assignee (avatar+name), status/confidence pill, progress %. Zoom: week/month/quarter/year. Clicking a bar routes to the objective/KR detail page. Data from `GET /api/gantt`. |

## Project Management

> Import from the barrel: `import { TemplateListClient, TemplateBuilderClient } from '@/features/projects'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `features/projects/components/ProjectsListClient` | `{ currentUserId, canCreateProject, aiFeatureEnabled, aiAvailable, initialDraftId }` | Project directory and KPI/search surface plus Story 1.3–1.10 orchestration for the three-method modal, private draft create/resume, URL persistence, confirmed switching/discard, Manual/Import branches, and their shared successful-commit handoff to the created project Gantt. Server-supplied permission and safe AI booleans keep UI aligned with API/configuration state without exposing credentials. |
| `features/projects/components/creation/NewProjectEntry` | `{ aiFeatureEnabled, aiAvailable, savedDraft?, ... }` | Story 1.3/1.5 accessible Manual/Import/AI option cards with exact descriptions and best-for guidance, saved-draft resume, unavailable-AI messaging, flag-off AI hiding, and project-less CSV/XLSX downloads before method selection. |
| `features/projects/components/creation/CreationDraftShell` | `{ draft, progressStep?, children?, onBack, onSaveAndExit, onDiscard, ... }` | Story 1.3–1.4 shared private-draft chrome: always-visible method/version/saved state, Method → Prepare → Review → Create progress driven by an embedded method branch, back without data loss, method change, save/exit, and consequence-specific discard confirmation. |
| `features/projects/components/CreateProjectWizard` | `{ draft, currentUserId, onDraftUpdated, onCreated, onSaveExit, onProgressChange }` | Story 1.4/1.9–1.10 react-hook-form Manual branch: persisted common details and dates, system/custom lifecycle counts, Start blank or template selection, provider-neutral materialization into the shared editable draft review workspace, then the single shared confirmed commit path. |
| `features/projects/components/creation/ImportTemplateDownloads` | `{ context?, onSaveExit? }` | Story 1.5 tokenized CSV/XLSX download surface reused before draft creation and inside the Import branch; explains each format and explicitly disables DOCX until Story 2.5. |
| `features/projects/components/creation/ImportUploadStep` | `{ draft, onDraftUpdated, onCommitted, onSaveExit, onProgressChange }` | Story 1.7–1.10/P2.4 react-hook-form CSV/XLS/XLSX/DOCX creation-draft upload: shared template downloads, spreadsheet file/sheet/mapping/validation flow, DOCX scanning/extraction counts and untrusted-data notice, safe errors, change-file reset, then the shared editable review and confirmed commit path. |
| `features/projects/components/creation/ColumnMappingStep` | `{ inspection, proposedMapping, onApprove, onBack, busy }` | Story 1.7 editable deterministic column-mapping table with required/optional fields, exact/known-alias labels, live source samples, duplicate-source prevention, and explicit approval before normalization. |
| `features/projects/components/creation/ValidationReportPanel` | `{ validation, sourceFileName? }` | Story 1.8 blocking/warning/info counts, exact source-row/field/original-value/issue/correction table, explicit commit-blocked guidance, and client-side downloadable CSV error report using shared tokens, Button, Lucide, and `cn()`. |
| `features/projects/components/creation/DraftReviewWorkspace` | `{ draft, onDraftUpdated, onCommitted, onSaveExit, onRestartSource, onProgressChange }` | Story 1.9–1.10/P2.3 shared Manual/Import seven-panel react-hook-form workspace for complete review/editing, private-draft Gantt, controls, filters, undo/redo, restore/restart, optimistic save, XLSX export, and history-backed explicit cleanup decisions. Its one Create Project action derives actionable commit blockers, saves the current version, and opens the exact final confirmation before calling the dedicated atomic commit endpoint. |
| `features/projects/components/creation/ChangeListPanel` | `{ changes, onAccept, onReject }` | Story 2.3 read-only cleanup evidence and decision surface: target/kind/original/proposed/reason/confidence/status, individual accept/reject, and safe grouped capitalization/whitespace controls with explicit exclusions. Nothing applies while proposed, and completed decisions direct users to Undo before save. |
| `features/projects/components/creation/CommitConfirmDialog` | `{ open, draft, counts, acknowledgedWarnings, busy, error, onBack, onConfirm }` | Story 1.10 final explicit confirmation: repeats exact phase/milestone/activity/deliverable/dependency counts, project context, acknowledged unresolved-warning count, and Planning/unbaselined/no-assignment/client/portal/external-notification consequences with loading, retry, and back-to-review controls. |
| `components/customers/CustomerLookup` | `{ value, onChange, disabled? }` | Shared Odoo-backed customer picker with debounced search, degraded/manual-entry messaging, and tokenized loading/result states; reused by Letters and Manual project creation without a feature-to-feature import. |
| `features/projects/components/TemplateListClient` | `{ user: { id, role } }` | A2 template directory: searchable card grid of system + custom templates, create/clone/delete modals, and navigation to the builder. |
| `features/projects/components/TemplateBuilderClient` | `{ templateId?, userRole }` | A2 template editor: name/description, left phase→milestone→activity tree, right properties panel, native HTML5 drag-and-drop reorder, validation, save/create, and system-template clone. |
| `features/projects/components/activity/ActivityDetailPanel` | — | F1/F2 `SideDrawer` activity panel opened from Gantt/Table/Board, with editable fields, owner-party radio, approval-clock banner, subtasks, threaded TipTap comments, default-internal/client-visible controls, client-author badges, undo saves, and seven header actions. |
| `features/projects/components/views/ProjectViewSwitcher` | E1 six-view project surface with persisted Zustand search/status/view state: Gantt, sortable/editable Table, drag/drop status Board, all-project Workload heatmap, ReactFlow Mindmap, and Overview ring/registers. |
| `features/projects/components/gantt/GanttChart` | Custom PM-module Gantt: virtualized phase/milestone/activity/subactivity rows, synced task/timeline scrolling, persisted split width/columns, search, sort, five scales, zoom, today marker, minimap, status-colored bars, baseline ghost overlays, progress fill, milestone diamonds, phase summary bars, approval-wait badges, drag/resize with C4 reason gate, successor cascade, dependency draw/delete, D4 toolbar/export, options/columns persistence, critical path, undo, duplicate, comments badges. Uses `@tanstack/react-virtual`, not `dhtmlx-gantt`. |
| `features/projects/components/DelayLedgerTable` | C5 Delay Ledger table with server-side totals, filters, inline recovery editing, CSV export, and PDF export through the shared Puppeteer renderer. |
| `features/projects/components/charts/ChartWrapper` | J1 chart shell with AP tokens, responsive/dark frame, and PNG export for Recharts SVGs plus custom chart surfaces. |
| `features/projects/components/charts/ProjectChartsLibrary` | J1 C1-C24 chart catalog rendered in the Overview tab, including C24 completion ring/KPI tiles and C18 ranked Pareto with cumulative line. |
| `features/projects/components/reports/ClientReportsPanel` | J2 R2 client report workflow panel for generate/edit/review/approve/send/PDF with the PM approval hard gate. |
| `features/projects/components/reports/PortfolioWbrPanel` | J3 portfolio WBR panel for generate/view/download with SPI, red item, and no-recovery-plan indicators. |
| `features/projects/components/reports/PerformanceReportsPanel` | J4 Jira-gated R3/R4 performance report panel for cadence selection, generate, PM-editable insights, and PDF export. |
| `features/projects/components/reports/ManagementReportsPanel` | J5 R6/R7/R9/R10 management report panel for monthly/quarterly generation, KPI review, PM summary edit/workflow controls, and PDF export. |
| `features/projects/components/ai/AiAssistantPanel` | J6 constrained AI assistant modal launched from the Gantt toolbar. Intent selector, optional context, capped data-grounded output, grounded-in metadata, and PM-approval warning. Copy-to-clipboard only — no send/client/auto-send path. |
| `features/projects/components/okr/ProjectObjectiveLinker` | K1 objective selector on project detail; links/unlinks `Project.objectiveId` via PATCH `/api/projects/[id]`. |
| `features/projects/components/okr/MilestoneKeyResultLinker` | K1 KR selector on each milestone row; links/unlinks `Milestone.keyResultId` via PATCH `/api/projects/[id]/milestones/[milestoneId]`. |
| `features/projects/components/okr/ObjectiveDeliveryPanel` | K1 delivery panel on objective detail showing linked projects with RAG, SPI, completion %, and slip days. |
| `features/projects/components/portfolio/PortfolioDashboard` | K2 CEO portfolio dashboard: summary KPIs, project table, filters, escalations, and real-data charts. |
| `features/projects/components/portfolio/PortfolioFilters` | K2 client/PM filters for the portfolio dashboard. |
| `features/projects/components/portfolio/PortfolioReportPanel` | K3 cross-project performance report list/generate/download panel. |
| `features/projects/components/charts/PortfolioChartsLibrary` | K2 portfolio chart catalog: C1 RAG wall, C6 delay by owner, C9 client health, C17 bubble, C18 Pareto, C20 bench forecast — all driven by real cross-project aggregation. |
| `features/projects/components/registers/RaidRegister` | H1 RAID register with Risks/Assumptions/Issues/Dependencies tabs, type-specific create fields, 5×5 risk matrix, days-open display, client-visible controls, red overdue client dependency flag, and DelayEvent generation. |
| `features/projects/components/registers/ChangeControlBoard` | H2 Change Control Board with CR create form, affected activity selection, workflow actions, rejection reason capture, client sign-off, pending report count, and approved scope-volatility total. |
| `features/projects/components/registers/StageGateRegister` | H3 Stage Gate register with per-phase entry/exit/deliverable/approval checklists, pass/waive/fail controls, waiver reason capture, and reportable gate status display. |
| `features/projects/components/registers/ClientObligationsRegister` | H4 Client Obligations register with named responsible people, SLA business days, contractual/R6 controls, compliance rate, breach count, client health score, and CEO warning below 60. |
| `features/projects/components/registers/CorrectionOfErrorsRegister` | H5 COE register with milestone/RED prompts, 5-Whys entry, root-cause counts, overdue CEO warning, systemic fix, template feedback, and Lessons Learned output. |
| `features/projects/components/registers/PaymentMilestonesRegister` | H6 Payment Milestones register with linked approval trigger, ready-to-invoice state, invoice/paid actions, outstanding days, and overdue CEO warning. |
| `features/projects/components/integrations/JiraIntegrationPanel` | G1/G4/G5 Project Settings integration panel for Jira site URL, email, write-only token, project key, Test Connection, Save, masked-token display, sync controls, developer Jira evidence metrics, and Jira adoption score warnings. |
| `features/projects/components/ScrumLogWidget` | G6 project-page quick-log widget for daily scrum date/time/duration/facilitator, In/Late/Out attendance, blockers/notes, R5 attendance report flags, and C16 people-by-date heatmap. |
| `features/projects/services/portal-serializer` | I2 portal data serializer and SQL filter contract: scoped projects, client-visible comments/attachments/RAID, owner anonymization, forbidden user/cost/Jira key stripping, and employee-name redaction. |
| `features/projects/services/portal-project-query` | Shared portal project Prisma include shape used by portal routes/pages without exporting non-handler values from Next route modules. |
| `features/projects/services/portal-dashboard` | I3 pure portal dashboard helpers for awaiting-action business-day counters, anonymized activity flattening, and delay-row mapping. |
| `lib/projects/jira-crypto` | P6 6.1 AES-256-GCM helper for write-only Jira API tokens, backed by `JIRA_TOKEN_ENCRYPTION_KEY`. |
| `lib/ai/ai-crypto` | Project Creation P0.4 AES-256-GCM helper for server-only AI provider keys, with a distinct authenticated-data domain and `AI_CREDENTIAL_ENCRYPTION_KEY`. |
| `lib/ai/credentials` | Project Creation P0.4 server resolver that forces OpenAI for this feature, prefers the encrypted database credential, and preserves `OPENAI_API_KEY` fallback. |
| `lib/ai/admin-settings` | Project Creation P0.5/P0.7 transaction-safe Administrator service for safe credential metadata, insert/rotation/removal, allowlisted model, cap and independent feature-flag persistence, and required secret-free ActivityLog rows. |
| `app/api/settings/integrations/ai` | Project Creation P0.5/P0.7 `withRole('ADMIN')` GET/PUT/DELETE API exposing only masked OpenAI settings and validating the independent feature toggle through standard envelopes. |
| `lib/ai/connection-test` | Project Creation P0.6 zero-generation-token OpenAI connection probe, safe status/type/code classification, atomic `lastVerifiedAt`, invalid-key revocation, concurrency guard, and required secret-free `KEY_TESTED` audit. |
| `app/api/settings/integrations/ai/test` | Project Creation P0.6 `withRole('ADMIN')` POST API returning fixed connection-test outcomes through the standard envelope without provider/key details. |
| `lib/ai/config` project-creation flag helpers | Project Creation P0.7 dedicated `PROJECT_CREATION_AI` feature key plus an independent default-off flag reader and reusable 404 refusal guard for future project-creation AI endpoints; never reads sprint-planning enablement. |
| `lib/projects/creation-draft` | Project Creation P1.1–P2.3 persistent creator-private draft service: configurable expiry, safe serialization, audited CRUD, owner-only mutation, Administrator inspection, editable-state guards, atomic optimistic version conflicts, confirmed method switching, review saves, atomic normalized import/validation metadata plus clean opaque source-reference persistence, server-enforced cleanup transitions and decision audits, and committed-project serialization. |
| `lib/projects/creation-normalize` | Project Creation P1.2/P2.3 single provider-neutral version-1 Zod contract, typed project/schedule/validation persistence slices, lossless split/combine, safe empty defaults, field provenance, explicit typed replacement/deletion changes, and structural rejection helpers for every future parser/provider. |
| `lib/projects/creation-changes` | Project Creation P2.3 pure cleanup decision and server-transition guard: prototype-safe paths, stable-ID list targets, exact-value conflict detection, immutable/terminal proposal evidence, explicit replace/delete application, and deterministic safe-group discovery limited to approved capitalization/whitespace text fields. |
| `lib/projects/creation-import` | Project Creation P1.7–1.8/P2.4 shared CSV/XLS/XLSX/DOCX file-metadata boundary plus deterministic SheetJS inspector/normalizer/validator: configurable limits, safe filename/MIME checks, `Schedule` preference, sheet/header detection, exact/alias proposals, strict user mapping validation, parser reuse, active-assignee resolution, normalized schedules, exact source-row provenance, and persisted blocking/warning reports. |
| `lib/projects/docx-extract` | Project Creation P2.4 Mammoth-based ordered DOCX extractor and AI-facing data boundary: headings, paragraphs, tables/cells, nested heading context, stable references, candidate categories, configurable page/block/character caps, bounded plain-text normalized sources, credential redaction, external-file denial, and fixed `UNTRUSTED_PROJECT_DATA` JSON framing. |
| `lib/projects/creation-validate` | Project Creation P1.8 deterministic validation and commit-readiness service: converts parser failures into exact structured issues, checks weights/active assignees/dates/parents/predecessors/project constraints, separates blocking errors from warnings, and reuses `wouldCreateDependencyCycle`. |
| `lib/projects/creation-import-api` | Project Creation P1.7/P2.1/P2.4 safe import API error adapter for draft conflicts, bounded spreadsheet/DOCX parsing and mapping failures, unsafe/malware files, and fail-closed scanner/storage availability without internal paths or scanner details. |
| `lib/projects/creation-upload-security` | Project Creation P2.1 server-only file-safety and private-storage boundary: signature/Office-container validation, configurable archive-bomb limits, encrypted/macro/active-content/path rejection, ClamAV INSTREAM scanning, generated opaque references, 0600 file storage outside `public/`, safe reads, and deletion. |
| `lib/projects/creation-ai-mapping` | Project Creation P2.2 OpenAI-only proposal service: minimum/redacted prompt data, strict structured mapping schema, output cap, exact-match preservation, known/unique source validation, original/proposed/reason/confidence evidence, and no persistence. |
| `lib/projects/manual-creation` | Project Creation P1.4/1.9 normalized Manual template-choice encoder/decoder and materializer: Start blank remains truly empty; a selected lifecycle is retained as a `TEMPLATE` decision, then copied to provider-neutral phases/milestones/activities before shared review. |
| `lib/projects/creation-review` | Project Creation P1.9 pure review helpers for deterministic schedule position renumber/reorder and seven-sheet XLSX draft export covering project, schedule, deliverables, dependencies, assumptions/questions, validation, and source/changes. |
| `lib/projects/creation-commit-shared` | Project Creation P1.10 client-safe pure commit counts, acknowledged-warning counting, and actionable readiness blockers covering validation, warnings, unresolved review decisions, metadata, hierarchy, dates, references, and dependency cycles. |
| `lib/projects/creation-commit` | Project Creation P1.10 atomic/idempotent server coordinator: private draft lookup, version/state claim, commit-time scope reauthorization, deterministic readiness, existing project-service reuse, complete normalized hierarchy/dependency creation, rollup, required audits, and committed-project reference with full rollback on failure and no external side effects. |
| `app/api/projects/creation-drafts` | Project Creation P1.1–1.3 authenticated, capability-gated draft creation plus private GET/PATCH/DELETE endpoints with exact normalized-slice validation, 1 MB bounds, standard envelopes, optimistic version conflicts, and explicit discard confirmation for source-method changes. |
| `app/api/projects/creation-drafts/[id]/upload` | Project Creation P1.7–P2.4 authenticated owner-only CSV/XLS/XLSX/DOCX endpoint that scans and privately retains safe bytes before spreadsheet inspection or ordered DOCX extraction, persists safe audited metadata/typed source references, and never creates a production project. |
| `app/api/projects/creation-drafts/[id]/analyze` | Project Creation P1.7–P2.1 authenticated owner-only mapping-approval endpoint that rehashes, re-scans, privately replaces, reinspects, validates, and saves the normalized schedule/report with a required safe audit. |
| `app/api/projects/creation-drafts/[id]/mapping-proposal` | Project Creation P2.2 authenticated owner-only optional AI mapping endpoint with capability/version/hash/flag/credential/model/cap/cooldown guards, safe generation/activity logs, and a proposal-only response that cannot mutate the draft. |
| `app/api/projects/creation-drafts/[id]/commit` | Project Creation P1.10 authenticated owner-only POST accepting only the expected positive version, delegating all reauthorization/readiness/transaction/idempotency work to the commit service, and returning standard 201/200/error envelopes. |
| `lib/projects/schedule-import` | Project Creation P1.6–1.8 backward-compatible 24-column schedule contract and parser: retains the original 21 header positions, parses optional metadata, preserves legacy behavior, and additionally emits structured exact-row/field/value/correction issues alongside legacy error strings. |
| `lib/projects/schedule-import-template` | Project Creation P1.5–1.6 shared CSV/XLSX generator for the creation and project-scoped endpoints: 24 schedule headers, examples and controlled-value guidance, widths, filters, Instructions/Schedule sheets, and a serialized OOXML frozen header. |
| `app/api/projects/creation-templates` | Project Creation P1.5 authenticated, capability-gated project-less CSV/XLSX download route with strict format validation, attachment metadata, and no project/draft lookup. |
| `app/api/projects/[id]/schedule-import` | Existing authorized transactional schedule importer, extended in Project Creation P1.6 to map optional deliverables to key milestones, persist activity estimates, and preserve source notes while retaining rollup and audit behavior. |
| `features/projects/services/jira/connection` | G1 Jira connection service for credential testing, issue/sprint counts, safe serialization, and Jira status error mapping. |
| `features/projects/services/jira/sync` | G2 Jira sync service for incremental issue/sprint/worklog/changelog ingestion, throttling/backoff, email→User resolution, and per-run `JiraSyncLog` writes. |
| `features/projects/services/jira/rollup` | G3 Jira mapping and auto-rollup service for Manual/Epic/Label/Component/Sprint mappings, preview filtering, and story-point weighted activity completion. |
| `features/projects/services/jira/metrics` | G4 Jira developer metrics service for working-day idle days, per-issue estimate accuracy, median estimate bias, and Performance/R3 reuse. |
| `features/projects/services/jira/adoption` | G5 Jira adoption service for assignee, estimate, recent-update, and story-point data-quality scoring per project/team. |
| `features/projects/services/scrum-attendance` | G6 scrum attendance service for project scrum logs, attendance rates, late/absent counts, team rate, and <70% flags. |
| `app/api/cron/jira-sync` | G2 `CRON_SECRET`-protected 30-minute Jira sync route for all active connections. |
| `app/api/projects/[id]/jira/sync` | G2 manual Sync Now route for a project's linked Jira connection. |
| `app/api/projects/[id]/jira/mapping-preview` | G3 scoped mapping preview route returning matched Jira issue counts, completion percent, weighting mode, and sample issue keys. |
| `app/api/projects/[id]/jira/metrics` | G4 scoped metrics route returning Jira-linked status, working days, idle days, issue estimate accuracy, and per-developer estimator bias. |
| `app/api/projects/[id]/jira/adoption` | G5 scoped adoption route returning project/team Jira data-quality scores and warning state. |
| `app/api/projects/[id]/scrum-log` | G6 scoped scrum log route for listing attendance evidence and upserting a date's scrum log by `projectId+scrumDate`. |
| `app/portal/signin` | I1 client portal sign-in surface wired to the separate `/api/portal/auth` NextAuth provider. |
| `app/portal` | I1 portal shell with client-scoped project list and internal preview banner. |
| `app/portal/projects/[id]` | I3 client dashboard with Awaiting Your Action first, anonymized Gantt bars, delay table, published reports, visible RAID, and internal preview banner. |
| `app/portal/projects/[id]/PortalCommentBox` | I3 client-visible comment reader/writer for awaiting actions; posts through the portal API with `isClientAuthor=true`. |
| `lib/portal-auth` | I1 portal auth config/helpers with distinct cookies, `ClientPortalUser` credentials, hard project scoping, and dashboard-block predicate. |
