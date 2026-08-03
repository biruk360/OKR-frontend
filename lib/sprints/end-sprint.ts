/**
 * Sprint close disposition engine — pure functions, no prisma imports.
 *
 * Implements the spec in docs/CLOSED_SPRINT_MANAGEMENT_REQUIREMENTS.md:
 *  - BR-02  computeDispositions (handling modes + per-task fallback)
 *  - BR-03  carryover lineage patches
 *  - BR-04  position normalization math
 *  - BR-07  completion counting (status === COMPLETED is the only truth)
 *  - BR-08  reopen window + bring-back patch
 *  - BR-09  completionRate math
 *
 * Route handlers (app/api/sprints/[id]/end, /reopen, PATCH cancel) call
 * lib/sprints/close-sprint.ts which wires these into a single transaction.
 */

export type DispositionAction = 'next' | 'backlog' | 'cancel'
export type IncompleteHandling = DispositionAction | 'per-task'

export interface IncompleteTodo {
  id: string
  title: string
  status: string
  assigneeId: string | null
  sprintPosition: number
  carryoverCount: number
  originalSprintId: string | null
}

export interface Disposition {
  todoId: string
  title: string
  fromStatus: string
  action: DispositionAction
  toSprintId: string | null
}

export interface CloseWarning {
  todoId: string
  code: 'CARRIED_3_PLUS'
}

/** BR-02 — resolve the action for every incomplete todo. Per-task entries win;
 *  todos missing from the per-task map fall back to 'backlog' (spec: safe default). */
export function computeDispositions(
  todos: IncompleteTodo[],
  handling: IncompleteHandling,
  perTaskActions: { todoId: string; action: DispositionAction }[],
  nextSprintId: string | null,
): Disposition[] {
  const perTaskMap = new Map(perTaskActions.map(a => [a.todoId, a.action]))
  return todos.map(todo => {
    const action: DispositionAction =
      handling === 'per-task' ? (perTaskMap.get(todo.id) ?? 'backlog') : handling
    return {
      todoId: todo.id,
      title: todo.title,
      fromStatus: todo.status,
      action,
      toSprintId: action === 'next' ? nextSprintId : null,
    }
  })
}

/** BR-03 — lineage patch for a todo carried into a next sprint. */
export function buildCarryoverPatch(
  todo: Pick<IncompleteTodo, 'carryoverCount' | 'originalSprintId'>,
  closedSprintId: string,
  now: Date,
): { carryoverCount: number; lastCarriedAt: Date; originalSprintId: string; carryoverDisposition: string } {
  return {
    carryoverCount: todo.carryoverCount + 1,
    lastCarriedAt: now,
    originalSprintId: todo.originalSprintId ?? closedSprintId,
    carryoverDisposition: 'CARRY',
  }
}

/** BR-03 — warnings for tasks carried into their 3rd+ sprint (post-increment count). */
export function computeWarnings(
  todos: IncompleteTodo[],
  dispositions: Disposition[],
): CloseWarning[] {
  const carried = new Set(dispositions.filter(d => d.action === 'next').map(d => d.todoId))
  return todos
    .filter(t => carried.has(t.id) && t.carryoverCount + 1 >= 3)
    .map(t => ({ todoId: t.id, code: 'CARRIED_3_PLUS' as const }))
}

/** BR-04 — target sprintPosition for a carried todo: bottom of the matching
 *  status lane in the destination sprint. `laneMax` is the current max
 *  sprintPosition among destination todos with the same status (0 when empty).
 *  `offset` (0,1,2…) preserves relative order within a batch landing together. */
export function carriedPosition(laneMax: number, offset: number): number {
  return laneMax + (offset + 1) * 1000
}

/** BR-04 — sortOrder for a backlogged todo: bottom of its global kanban column. */
export function backlogSortOrder(columnMax: number, offset: number): number {
  return columnMax + (offset + 1) * 1000
}

/** BR-07 — the one and only definition of "complete": status COMPLETED.
 *  Columns are views; status is truth. */
export function isComplete(status: string): boolean {
  return status === 'COMPLETED'
}

/** BR-07 — todos sitting in the Done lane (column statusKey COMPLETED) whose
 *  status is not COMPLETED — surfaced as a pre-close warning in the UI. */
export function findColumnMismatch<T extends { id: string; title: string; status: string }>(
  todosInDoneLane: T[],
): T[] {
  return todosInDoneLane.filter(t => !isComplete(t.status))
}

/** BR-09 — completion rate rounded to 2dp; null when the sprint had no tasks. */
export function completionRate(completed: number, total: number): number | null {
  if (total === 0) return null
  return Math.round((completed / total) * 100) / 100
}

export const REOPEN_WINDOW_DAYS = 7

/** BR-08 — a completed sprint may be reopened within REOPEN_WINDOW_DAYS of endedAt. */
export function canReopen(endedAt: Date | null, now: Date, windowDays = REOPEN_WINDOW_DAYS): boolean {
  if (!endedAt) return false
  return now.getTime() - endedAt.getTime() <= windowDays * 24 * 60 * 60 * 1000
}

/** BR-08 — patch when a carried todo is "brought back" to the reopened sprint.
 *  Decrements carryoverCount (floor 0); clears CARRY disposition when it hits 0. */
export function buildBringBackPatch(
  todo: Pick<IncompleteTodo, 'carryoverCount'>,
  reopenedSprintId: string,
): { sprintId: string; carryoverCount: number; carryoverDisposition: string | null } {
  const next = Math.max(0, todo.carryoverCount - 1)
  return {
    sprintId: reopenedSprintId,
    carryoverCount: next,
    carryoverDisposition: next === 0 ? null : 'CARRY',
  }
}
