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

  const span = kr.targetValue - kr.startValue
  let nextCurrent = kr.startValue
  let progress = 0
  if (span > 0) {
    nextCurrent = Math.max(
      kr.startValue,
      Math.min(kr.startValue + (weightedPct / 100) * span, kr.targetValue),
    )
    progress = ((nextCurrent - kr.startValue) / span) * 100
  }

  await tx.keyResult.update({
    where: { id: keyResultId },
    data: {
      currentValue: nextCurrent,
      progress: Math.round(Math.min(100, Math.max(0, progress))),
    },
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
