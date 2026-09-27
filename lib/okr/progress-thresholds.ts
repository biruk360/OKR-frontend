/**
 * One definition of "on track", "complete" and the progress colour bands for OKR
 * summary surfaces (Progress, Progress report, Analytics).
 *
 * Before this module, Progress Tracking called an objective "on track" at ≥75%
 * progress while Analytics counted ≥75% as "completed", and both disagreed with
 * the status pill shown on the same row (which reads `goalStatus`).
 *
 * Rules:
 *   - Health (on track / at risk / off track) is the objective's `goalStatus`
 *     (ON_TRACK / AT_RISK / OFF_TRACK), the same field every StatusPill renders.
 *     Progress percentage is NOT a health signal.
 *   - Complete = `goalStatus === 'CLOSED'` or progress ≥ 100%.
 *   - Progress colour bands match `getProgressColor` / `getProgressBarColor` in
 *     lib/utils.ts: ≥70 healthy, ≥40 warning, else critical.
 */

export const PROGRESS_HEALTHY_MIN = 70
export const PROGRESS_WARNING_MIN = 40
export const PROGRESS_COMPLETE = 100

export type ProgressBand = 'healthy' | 'warning' | 'critical'

export function progressBand(progress: number): ProgressBand {
  if (progress >= PROGRESS_HEALTHY_MIN) return 'healthy'
  if (progress >= PROGRESS_WARNING_MIN) return 'warning'
  return 'critical'
}

export interface GoalHealthFields {
  progress: number
  goalStatus?: string | null
}

export function isObjectiveComplete(o: GoalHealthFields): boolean {
  return o.goalStatus === 'CLOSED' || o.progress >= PROGRESS_COMPLETE
}

export interface GoalStatusCounts {
  onTrack: number
  atRisk: number
  offTrack: number
  closed: number
}

/** Counts objectives by `goalStatus`. Unknown/empty statuses are not counted. */
export function countByGoalStatus(rows: ReadonlyArray<{ goalStatus?: string | null }>): GoalStatusCounts {
  const out: GoalStatusCounts = { onTrack: 0, atRisk: 0, offTrack: 0, closed: 0 }
  for (const r of rows) {
    switch (r.goalStatus) {
      case 'ON_TRACK': out.onTrack++; break
      case 'AT_RISK': out.atRisk++; break
      case 'OFF_TRACK': out.offTrack++; break
      case 'CLOSED': out.closed++; break
    }
  }
  return out
}

/** Completion rate (0–100, rounded) using `isObjectiveComplete`. */
export function completionRate(rows: ReadonlyArray<GoalHealthFields>): number {
  if (rows.length === 0) return 0
  return Math.round((rows.filter(isObjectiveComplete).length / rows.length) * 100)
}
