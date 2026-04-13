# Code Conventions

> **Purpose:** Rules for where new code goes, how to name things, and how to import. All AI assistants and developers follow these rules. If unsure, check this file.

## File & Folder Conventions

### New UI Components

| What you're building | Where it goes |
|---------------------|---------------|
| Reusable primitive (Modal, Button, Input, Badge) | `components/ui/` |
| Layout component (Shell, Header, Sidebar) | `components/layout/` |
| Cross-feature shared component | `components/shared/` |
| Feature-specific component | `features/[feature]/components/` or `components/[feature]/` (pre-refactor) |

### New Pages / Routes

| What | Where |
|------|-------|
| Dashboard page | `app/dashboard/[section]/page.tsx` |
| API endpoint | `app/api/[resource]/route.ts` |
| Settings page | `app/dashboard/settings/[section]/page.tsx` |

**Rule:** Route files (page.tsx) must be thin — import from features/components and compose. No Prisma queries, no business logic, no fetch calls in page files.

### New Hooks

| What | Where |
|------|-------|
| Shared/cross-feature hook | `hooks/` |
| Feature-specific hook | `features/[feature]/hooks/` |

### New Types

| What | Where |
|------|-------|
| Shared types (UserRole, ObjectiveLevel, API types) | `types/index.ts` |
| Feature-specific types | `features/[feature]/types.ts` |
| Component props | Co-located in the component file |
| **NEVER** re-declare types that exist in `types/index.ts` | |

### New API Logic

| What | Where |
|------|-------|
| Auth middleware | `lib/api/withAuth.ts` |
| Response helpers | `lib/api/apiResponse.ts` |
| Error handling | `lib/api/handleError.ts` |
| Feature-specific data access | `features/[feature]/services.ts` |

## Naming Conventions

### Files
- **Components:** PascalCase — `StatCard.tsx`, `CreateObjectiveModal.tsx`
- **Hooks:** camelCase with `use` prefix — `useDebounce.ts`, `useTimeframes.ts`
- **Utilities:** camelCase — `utils.ts`, `permissions.ts`
- **Types:** camelCase — `types.ts`, `index.ts`
- **API routes:** lowercase kebab — `route.ts` inside `app/api/[resource]/`

### Components
- **Modal components:** `[Action][Entity]Modal` — `CreateObjectiveModal`, `DeleteTeamModal`
- **Button triggers:** `[Action][Entity]Button` — `CreateObjectiveButton`, `DeleteKeyResultButton`
- **List components:** `[Entity]List` or `[Entity]Table` — `ObjectivesList`, `GoalsTable`
- **Page sections:** `[Entity]Management` or `[Entity]View` — `UserManagement`, `GoalsFeedView`

### Types
- **Prisma model extensions:** `[Model]WithRelations` — `ObjectiveWithRelations`, `UserWithRelations`
- **Form types:** `Create[Entity]Form`, `Update[Entity]Form` — `CreateObjectiveForm`
- **Filter types:** `[Entity]Filters` — `ObjectiveFilters`, `KeyResultFilters`
- **API responses:** Use `ApiResponse<T>` and `PaginatedResponse<T>` from `types/index.ts`

### Hooks
- **Data fetching:** `use[Entity]` or `use[Entity]ForSelection` — `useTimeframes`, `useUsersForSelection`
- **UI state:** `use[Feature]Store` — `useTodoStore`, `useNotificationStore`

## Import Conventions

### Order (top to bottom)
1. React / Next.js imports
2. Third-party libraries
3. `@/types/` — shared types
4. `@/lib/` — utilities
5. `@/hooks/` — shared hooks
6. `@/components/ui/` — UI primitives
7. `@/components/shared/` — shared components
8. `@/features/[feature]` — feature barrel imports
9. Relative imports (same feature/folder)

### Feature Barrels (Phase 5 — strangler pattern)

The `features/` directory holds barrel `index.ts` files that are the **public API** for each feature:

- [features/objectives](../features/objectives/index.ts)
- [features/key-results](../features/key-results/index.ts)
- [features/todos](../features/todos/index.ts)
- [features/goals](../features/goals/index.ts)
- [features/sprints](../features/sprints/index.ts)

Physical files live under `features/[feature]/components/`. The barrel re-exports them with named exports. Consumers import from the barrel; internal feature files use relative paths (`./components/Foo`). Cross-feature imports MUST go through the sibling feature's barrel (`@/features/todos`), never via `../todos/...`.

**New code must import from the feature barrel:**

```ts
// GOOD — survives the eventual file move
import { CreateObjectiveModal, ObjectivesList } from '@/features/objectives'
import { AddKeyResultModal } from '@/features/key-results'
import { ToDoList } from '@/features/todos'

// AVOID — brittle, will break when files move
import CreateObjectiveModal from '@/components/objectives/CreateObjectiveModal'
```

**Cross-feature imports are forbidden.** If `features/objectives` needs something from `features/todos`, promote the shared code to `components/`, `hooks/`, or `lib/` instead.

### Barrel Exports
Every module folder MUST have an `index.ts` that exports its public API:

```typescript
// features/objectives/index.ts
export { ObjectivesList } from './components/ObjectivesList'
export { CreateObjectiveModal } from './components/CreateObjectiveModal'
export { useObjectives } from './hooks/useObjectives'
export type { ObjectiveFormData } from './types'
```

**Import from the barrel, not internal files:**
```typescript
// GOOD
import { ObjectivesList, useObjectives } from '@/features/objectives'

// BAD
import { ObjectivesList } from '@/features/objectives/components/ObjectivesList'
```

## Component Patterns

### Modals
Always use the shared Modal shell:
```tsx
import { Modal } from '@/components/ui/Modal'

<Modal open={open} onClose={onClose} title="Create Objective" icon={Target}>
  {/* form content */}
  <Modal.Footer>
    <Button variant="outline" onClick={onClose}>Cancel</Button>
    <Button onClick={handleSubmit}>Create</Button>
  </Modal.Footer>
</Modal>
```

### Delete / Archive Confirmations
Always use ConfirmDialog:
```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

<ConfirmDialog
  open={open}
  onClose={onClose}
  onConfirm={handleDelete}
  title="Delete Objective"
  message="This action cannot be undone."
  variant="danger"
  confirmLabel="Delete"
  isLoading={isDeleting}
/>
```

### Empty States
Always use the shared EmptyState:
```tsx
import { EmptyState } from '@/components/ui/EmptyState'

<EmptyState
  icon={Target}
  title="No objectives yet"
  description="Create your first objective to get started."
  action={<Button onClick={onCreate}>Create Objective</Button>}
/>
```

### Reference Data in Forms
Always use shared hooks — never inline fetch:
```tsx
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useTimeframes } from '@/hooks/useTimeframes'
import { useDepartments } from '@/hooks/useDepartments'

const { data: users } = useUsersForSelection()
const { data: timeframes } = useTimeframes()
const { data: departments } = useDepartments()
```

### API Responses
Always use the standard envelope:
```typescript
// GOOD
return NextResponse.json({ success: true, data: objectives })
return NextResponse.json({ success: true, data: objectives, pagination: { page, limit, total, totalPages } })
return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

// BAD — never use entity-specific keys
return NextResponse.json({ success: true, todos })
return NextResponse.json({ items: rows })
return NextResponse.json({ ok: true })
```

## What NOT To Do

1. **Don't create a new component** if one exists in `docs/COMPONENT_CATALOG.md`
2. **Don't re-declare types** that exist in `types/index.ts`
3. **Don't add permission logic** to `lib/utils.ts` — use `lib/permissions.ts`
4. **Don't build custom modal wrappers** — use `components/ui/Modal`
5. **Don't inline fetch logic** for users/timeframes/departments — use shared hooks
6. **Don't use raw useState for forms** — use react-hook-form
7. **Don't hardcode colors** — use design tokens (success-*, primary-*, etc.)
8. **Don't put business logic in page.tsx files** — keep routes thin
9. **Don't import from another feature's internals** — use barrel exports or lift to shared
10. **Don't skip updating docs** after making changes — see CLAUDE.md "After Completing Work"
