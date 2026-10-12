/**
 * OKR bridge for the Project Management module.
 *
 * Propagates project milestone progress into linked Key Results and up through
 * ancestor objectives, reusing the existing OKR engine (`lib/objectiveProgress.ts`).
 *
 * Design rule: milestones are the source of truth for `currentValue`/`progress`
 * on any Key Result that has milestone links. KRs without milestone links
 * continue to be driven by initiatives/todos through `recalcKrFromInitiatives`.
 */

import type { Prisma } from '@prisma/client'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { weightedAverage } from '@/lib/projects/rollup'
import { krProgressFraction, krProgressPercent, normalizeKrDirection } from '@/lib/keyResultNumbers'

export type DbLike = Prisma.TransactionClient

/**
 * Recompute a Key Result's currentValue/progress from all milestones linked to it.
 *
 * The milestone `percentComplete` values (0–100) are weighted by milestone weight
 * and then mapped onto the KR's [startValue, targetValue] span so the KR unit is
 * preserved (%, ETB, users, etc.).
 *
 * Returns the new currentValue, or null if the KR no longer exists.
 */
export async function recalcKrFromMilestones(
  tx: DbLike,
  keyResultId: string,
): Promise<number | null> {
  const kr = await tx.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      id: true,
      objectiveId: true,
      startValue: true,
      targetValue: true,
      currentValue: true,
      direction: true,
    },
  })
  if (!kr) return null

  const milestones = await tx.milestone.findMany({
    where: { keyResultId },
    select: { percentComplete: true, weight: true },
  })

  // No linked milestones → leave the KR unchanged. This preserves initiative-driven
  // KRs and avoids overwriting a KR that was just unlinked.
  if (milestones.length === 0) {
    return kr.currentValue
  }

  const weightedPct = weightedAverage(
    milestones.map((m) => ({ weight: m.weight, percentComplete: m.percentComplete })),
  )

  // KRX-1: map the milestone % onto the KR span in the KR's direction. A degenerate
  // span (legacy rows where the span does not point the KR's way) is left untouched
  // rather than resetting currentValue to the start value.
  if (krProgressFraction({ ...kr, currentValue: kr.startValue }) === null) {
    return kr.currentValue
  }
  const pct = Math.min(100, Math.max(0, weightedPct)) / 100
  const nextCurrent =
    normalizeKrDirection(kr.direction) === 'DECREASE'
      ? Math.min(kr.startValue, Math.max(kr.startValue - pct * (kr.startValue - kr.targetValue), kr.targetValue))
      : Math.max(kr.startValue, Math.min(kr.startValue + pct * (kr.targetValue - kr.startValue), kr.targetValue))
  const progress = krProgressPercent({ ...kr, currentValue: nextCurrent })

  await tx.keyResult.update({
    where: { id: keyResultId },
    data: { currentValue: nextCurrent, progress },
  })

  return nextCurrent
}

/**
 * Recompute one or more Key Results from their linked milestones and roll the
 * resulting progress up through each objective ancestor chain.
 */
export async function recalcKrsAndAncestors(
  tx: DbLike,
  keyResultIds: Iterable<string>,
): Promise<void> {
  const uniqueKrIds = Array.from(new Set(keyResultIds))
  if (uniqueKrIds.length === 0) return

  const objectiveIds = new Set<string>()
  for (const krId of uniqueKrIds) {
    const kr = await tx.keyResult.findUnique({
      where: { id: krId },
      select: { objectiveId: true },
    })
    if (kr?.objectiveId) objectiveIds.add(kr.objectiveId)
  }

  // Recompute every affected KR first (parallel-safe inside the transaction).
  await Promise.all(uniqueKrIds.map((id) => recalcKrFromMilestones(tx, id)))

  // Then roll up each affected objective and its ancestors.
  for (const objectiveId of objectiveIds) {
    await recalcNodeAndAncestors(tx, objectiveId)
  }
}
