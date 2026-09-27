/**
 * Planned vs Actual — pure slip math for the client portal tab.
 *
 * Slip follows the module convention for `Activity.slipDays`
 * (`computeSlipDays` in lib/projects/rollup.ts): **calendar days**, current end
 * minus baseline end, rounded. Unlike the stored `slipDays` (clamped at 0) the
 * portal shows a *signed* variance so a client can also see work that is
 * forecast ahead of the agreed date. A row with no baseline (project never
 * baselined, or item added after commit) has no variance — `null`, never 0, so
 * "not baselined" is not mistaken for "on time".
 *
 * Deliberately free of Prisma / server imports: the portal serializer and its
 * unit tests import this module directly.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type PlannedVsActualSlipState = 'NOT_BASELINED' | 'AHEAD' | 'ON_TIME' | 'SLIPPED'

/** Slips longer than this (calendar days — one working fortnight) render as danger, not warning. */
export const PLANNED_VS_ACTUAL_SEVERE_SLIP_DAYS = 14

/** Signed calendar-day variance (current end − baseline end); null when either date is missing. */
export function plannedVsActualVarianceDays(baselineEnd: Date | null, currentEnd: Date | null): number | null {
  if (!baselineEnd || !currentEnd) return null
  const ms = currentEnd.getTime() - baselineEnd.getTime()
  if (!Number.isFinite(ms)) return null
  const days = Math.round(ms / MS_PER_DAY)
  return days === 0 ? 0 : days // normalise -0
}

export function plannedVsActualSlipState(varianceDays: number | null): PlannedVsActualSlipState {
  if (varianceDays === null) return 'NOT_BASELINED'
  if (varianceDays > 0) return 'SLIPPED'
  if (varianceDays < 0) return 'AHEAD'
  return 'ON_TIME'
}

export interface PlannedVsActualSummary {
  total: number
  notBaselined: number
  ahead: number
  onTime: number
  slipped: number
  /** Largest positive variance among slipped rows; 0 when nothing slipped. */
  maxSlipDays: number
}

export function summarizePlannedVsActual(
  rows: ReadonlyArray<{ varianceDays: number | null }>,
): PlannedVsActualSummary {
  const summary: PlannedVsActualSummary = { total: rows.length, notBaselined: 0, ahead: 0, onTime: 0, slipped: 0, maxSlipDays: 0 }
  for (const row of rows) {
    const state = plannedVsActualSlipState(row.varianceDays)
    if (state === 'NOT_BASELINED') summary.notBaselined += 1
    else if (state === 'AHEAD') summary.ahead += 1
    else if (state === 'ON_TIME') summary.onTime += 1
    else {
      summary.slipped += 1
      summary.maxSlipDays = Math.max(summary.maxSlipDays, row.varianceDays ?? 0)
    }
  }
  return summary
}
