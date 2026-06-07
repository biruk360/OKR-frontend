/**
 * Root barrel for all feature modules.
 *
 * Typical usage:
 *   import { CreateObjectiveModal, ObjectivesList } from '@/features/objectives'
 *   import { AddKeyResultModal } from '@/features/key-results'
 *   import { ToDoList } from '@/features/todos'
 *
 * Cross-feature imports (e.g. `@/features/objectives` importing from `@/features/todos`)
 * are disallowed — if logic is shared, promote it to `components/`, `hooks/`, or `lib/`.
 * See docs/CONVENTIONS.md for the full rule set.
 */

export * as objectives from './objectives'
export * as keyResults from './key-results'
export * as todos from './todos'
export * as goals from './goals'
export * as sprints from './sprints'
export * as performance from './performance'
