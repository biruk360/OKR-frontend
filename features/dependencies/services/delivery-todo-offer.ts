/**
 * DEP-4 (second half): when a delivery Todo is completed, offer to mark the
 * dependency it delivers DONE. Pure selection — no fetch, unit-tested.
 */
import { isClosedStatus } from './rules'
import type { DependencyDetailRow, DependencyRow } from '../types'

/**
 * The dependency to offer "Mark done?" for, among rows returned by
 * GET /api/dependencies?deliveryTodoId=<todoId>: the first one the viewer can
 * open, that is still open, and whose status the viewer may change.
 */
export function pickDependencyToOfferDone(
  rows: readonly DependencyRow[],
  todoId: string,
): DependencyDetailRow | null {
  for (const row of rows) {
    if (!row.detail) continue
    if (row.deliveryTodoId !== todoId) continue
    if (isClosedStatus(row.status)) continue
    if (!row.permissions.canChangeStatus) continue
    return row
  }
  return null
}

/** Short label used in the prompt: the workbook ref (DEP14) or the title. */
export function dependencyOfferLabel(row: Pick<DependencyRow, 'ref' | 'title'>): string {
  return row.ref?.trim() || `“${row.title}”`
}
