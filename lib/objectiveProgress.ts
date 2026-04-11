import type { Prisma, PrismaClient } from '@prisma/client'

export type DbLike = Prisma.TransactionClient | PrismaClient

/**
 * Recompute stored progress for one objective: strict roll-up from active children when enabled,
 * otherwise average of active key results (capped 0–100 per KR).
 */
export async function recalcObjectiveStoredProgress(tx: DbLike, objectiveId: string): Promise<number> {
  const obj = await tx.objective.findUnique({
    where: { id: objectiveId },
    select: {
      alignmentType: true,
      rollupCalculation: true,
    },
  })
  if (!obj) return 0

  const children = await tx.objective.findMany({
    where: { parentObjectiveId: objectiveId, status: 'ACTIVE' },
    select: { progress: true },
  })

  let progress: number
  if (
    obj.alignmentType === 'STRICT_DEPENDENCY' &&
    obj.rollupCalculation !== 'NONE' &&
    children.length > 0
  ) {
    if (obj.rollupCalculation === 'AVERAGE') {
      progress = children.reduce((s, c) => s + c.progress, 0) / children.length
    } else {
      progress = Math.min(100, children.reduce((s, c) => s + c.progress, 0))
    }
  } else {
    const krs = await tx.keyResult.findMany({
      where: { objectiveId, status: 'ACTIVE' },
      select: { currentValue: true, targetValue: true, progress: true },
    })
    if (krs.length === 0) {
      progress = 0
    } else {
      const total = krs.reduce((sum, kr) => {
        const p =
          kr.targetValue > 0
            ? Math.min((kr.currentValue / kr.targetValue) * 100, 100)
            : Math.min(kr.progress, 100)
        return sum + p
      }, 0)
      progress = total / krs.length
    }
  }

  const rounded = Math.round(Math.min(100, Math.max(0, progress)))
  await tx.objective.update({
    where: { id: objectiveId },
    data: { progress: rounded },
  })
  return rounded
}

/** Recompute this objective, then each ancestor up to the root (e.g. after KR change or moving alignment). */
export async function recalcNodeAndAncestors(tx: DbLike, startObjectiveId: string): Promise<void> {
  let cur: string | null = startObjectiveId
  while (cur !== null) {
    const id: string = cur
    await recalcObjectiveStoredProgress(tx, id)
    const nextParent = await tx.objective.findUnique({
      where: { id },
      select: { parentObjectiveId: true },
    })
    cur = nextParent?.parentObjectiveId ?? null
  }
}

/** True if `ancestorId` appears when walking parents upward from `startId`. */
export async function isAncestorOf(
  tx: DbLike,
  ancestorId: string,
  startId: string
): Promise<boolean> {
  let cursor: string | null = startId
  const seen = new Set<string>()
  while (cursor !== null) {
    const id: string = cursor
    if (id === ancestorId) return true
    if (seen.has(id)) return true
    seen.add(id)
    const nextParent = await tx.objective.findUnique({
      where: { id },
      select: { parentObjectiveId: true },
    })
    cursor = nextParent?.parentObjectiveId ?? null
  }
  return false
}

/**
 * Setting objective `childId` parent to `proposedParentId` would create a cycle.
 * (Walk up from proposed parent; if we hit childId, child would become its own ancestor.)
 */
export async function wouldCreateAlignmentCycle(
  tx: DbLike,
  childId: string | null,
  proposedParentId: string
): Promise<boolean> {
  if (childId && proposedParentId === childId) return true
  if (!childId) return false
  return isAncestorOf(tx, childId, proposedParentId)
}

/** All objectives in the subtree under rootId (not including rootId). */
export async function getDescendantObjectiveIds(tx: DbLike, rootId: string): Promise<string[]> {
  const out: string[] = []
  let frontier: string[] = [rootId]
  while (frontier.length > 0) {
    const children = await tx.objective.findMany({
      where: { parentObjectiveId: { in: frontier } },
      select: { id: true },
    })
    frontier = children.map((c) => c.id)
    out.push(...frontier)
  }
  return out
}
