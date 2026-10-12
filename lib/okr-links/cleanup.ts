import type { Prisma } from '@prisma/client'

/**
 * Hard-delete cleanup for OKR nodes (server only).
 *
 * OkrLink, DecisionLink and WorkDependencyLink are polymorphic (no FKs), and
 * `lineageRootId` is a plain column, so deleting an objective or key result
 * leaves them dangling unless the delete path removes them. Every hard-delete
 * route (KR DELETE, objective DELETE — which cascades its KRs) calls this inside
 * its transaction, before the row itself is deleted.
 */

export type OkrNodeType = 'OBJECTIVE' | 'KEY_RESULT'

type Tx = Prisma.TransactionClient

interface LineageRow {
  id: string
  rolledFromId: string | null
}

/**
 * LNK-2 lineage repair for one deleted node: direct successors become roots of
 * their own chain; deeper descendants re-root onto the successor they descend
 * from. Pure planner — returns the updates to apply.
 */
export function planLineageReRoot(
  deletedId: string,
  lineage: readonly LineageRow[],
): { detach: string[]; reRoot: Array<{ root: string | null; ids: string[] }> } {
  const parentOf = new Map(lineage.map((k) => [k.id, k.rolledFromId]))
  const newRootOf = (nodeId: string): string | null => {
    let cur = nodeId
    for (let hops = 0; hops < lineage.length + 1; hops++) {
      const parent = parentOf.get(cur)
      if (parent === deletedId) return cur === nodeId ? null : cur
      if (!parent || !parentOf.has(parent)) return null
      cur = parent
    }
    return null
  }
  const detach = lineage.filter((k) => k.rolledFromId === deletedId).map((k) => k.id)
  const byRoot = new Map<string | null, string[]>()
  for (const k of lineage) {
    if (k.rolledFromId === deletedId) continue
    const root = newRootOf(k.id)
    byRoot.set(root, [...(byRoot.get(root) ?? []), k.id])
  }
  return { detach, reRoot: Array.from(byRoot.entries()).map(([root, ids]) => ({ root, ids })) }
}

async function reRootLineage(tx: Tx, type: OkrNodeType, deletedId: string): Promise<void> {
  const where = { OR: [{ rolledFromId: deletedId }, { lineageRootId: deletedId }] }
  const select = { id: true, rolledFromId: true } as const
  const lineage: LineageRow[] =
    type === 'OBJECTIVE'
      ? await tx.objective.findMany({ where, select })
      : await tx.keyResult.findMany({ where, select })
  if (lineage.length === 0) return
  const plan = planLineageReRoot(deletedId, lineage)
  const update = (ids: string[], data: { rolledFromId?: null; lineageRootId: string | null }) =>
    type === 'OBJECTIVE'
      ? tx.objective.updateMany({ where: { id: { in: ids } }, data })
      : tx.keyResult.updateMany({ where: { id: { in: ids } }, data })
  if (plan.detach.length > 0) await update(plan.detach, { rolledFromId: null, lineageRootId: null })
  for (const { root, ids } of plan.reRoot) await update(ids, { lineageRootId: root })
}

/** Drops every polymorphic link naming the nodes and repairs their lineage. */
export async function cleanupOkrNodeReferences(tx: Tx, type: OkrNodeType, ids: readonly string[]): Promise<void> {
  const list = Array.from(new Set(ids))
  if (list.length === 0) return
  await tx.okrLink.deleteMany({
    where: { OR: [{ fromType: type, fromId: { in: list } }, { toType: type, toId: { in: list } }] },
  })
  await tx.decisionLink.deleteMany({ where: { entityType: type, entityId: { in: list } } })
  await tx.workDependencyLink.deleteMany({ where: { entityType: type, entityId: { in: list } } })
  for (const id of list) await reRootLineage(tx, type, id)
}

/**
 * Objective hard delete: the objective's own links/lineage plus those of the KRs
 * that cascade-delete with it.
 */
export async function cleanupObjectiveDeleteReferences(tx: Tx, objectiveId: string): Promise<void> {
  const krs = await tx.keyResult.findMany({ where: { objectiveId }, select: { id: true } })
  await cleanupOkrNodeReferences(tx, 'KEY_RESULT', krs.map((k) => k.id))
  await cleanupOkrNodeReferences(tx, 'OBJECTIVE', [objectiveId])
}
