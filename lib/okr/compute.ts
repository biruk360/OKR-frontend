/**
 * Pure computation functions for OKR metrics.
 * These derive client-side values that are NOT stored in the database.
 */

import { cycleElapsedFraction, daysSince } from './dates'
import type { ComputedStatus } from './status'

/** Expected progress based on how far we are through the cycle (0–100). */
export function computeExpectedProgress(
  cycleStart: Date,
  cycleEnd: Date,
  now: Date = new Date()
): number {
  return Math.round(cycleElapsedFraction(cycleStart, cycleEnd, now) * 100)
}

/** Gap between expected and actual progress (negative = behind pace). */
export function computeGap(actual: number, expected: number): number {
  return actual - expected
}

/** Derive computed status from objective/KR metrics. */
export function computeStatus(params: {
  progress: number       // 0–100
  expectedProgress: number // 0–100
  hasOwner: boolean
  stalledDays: number
  lastUpdatedDays: number
}): ComputedStatus {
  if (!params.hasOwner) return 'no-owner'
  if (params.progress >= 100) return 'completed'
  const gap = params.expectedProgress - params.progress
  if (gap > 20 || params.stalledDays > 21) return 'off-track'
  if (gap > 10 || params.stalledDays > 14) return 'at-risk'
  return 'on-track'
}

/** Count of KRs that have no owner assigned. */
export function countUnassignedKRs(
  keyResults: Array<{ ownerId?: string | null; owner?: { id: string } | null }>
): number {
  return keyResults.filter(kr => !kr.ownerId && !kr.owner?.id).length
}
