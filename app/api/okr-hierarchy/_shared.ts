/**
 * Shared pieces of the OKR hierarchy feed (`GET /api/okr-hierarchy`) and its
 * lazy initiative loader (`GET /api/okr-hierarchy/initiatives`). Not a route.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sprintVisibilityWhere } from '@/lib/permissions'
import { buildKeyResultVisibilityWhere, type ViewerContext } from '@/lib/okr/visibility-scope'

export type HierarchyRow = {
  path: string[]
  rowId: string
  kind: 'OBJ' | 'KR' | 'INIT'
  parentRowId: string | null
  data: Record<string, unknown>
}

export interface HierarchyViewer {
  id: string
  role: string
  userType?: string | null
}

/**
 * Initiatives (to-dos) the viewer may see under OKR rows: non-cancelled cards on
 * key results the viewer sees UNREDACTED (a redacted KR never exposes its cards).
 * ADMIN/EXECUTIVE see every card; others see non-sprint cards, cards on sprints
 * they can view (invite-only, `sprintVisibilityWhere`), and cards they take part
 * in — the same shape as the card read rule in lib/todos/access.ts.
 */
export function initiativeVisibilityWhere(
  viewer: HierarchyViewer,
  ctx: ViewerContext,
  keyResultIds: string[],
): Prisma.TodoWhereInput {
  const and: Prisma.TodoWhereInput[] = [
    { keyResultId: { in: keyResultIds } },
    { status: { not: 'CANCELLED' } },
    { keyResult: buildKeyResultVisibilityWhere(ctx, { includeRedacted: false }) },
  ]
  if (!ctx.seesAll) {
    and.push({
      OR: [
        { sprintId: null },
        { sprint: sprintVisibilityWhere(viewer) },
        { assigneeId: viewer.id },
        { creatorId: viewer.id },
        { members: { some: { userId: viewer.id } } },
      ],
    })
  }
  return { AND: and }
}

/** Initiative counts per KR (visible cards only), in one grouped query. */
export async function initiativeCountsByKr(
  viewer: HierarchyViewer,
  ctx: ViewerContext,
  keyResultIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>()
  if (keyResultIds.length === 0) return out
  const groups = await prisma.todo.groupBy({
    by: ['keyResultId', 'status'],
    where: initiativeVisibilityWhere(viewer, ctx, keyResultIds),
    _count: { _all: true },
  })
  for (const g of groups) {
    if (!g.keyResultId) continue
    const cur = out.get(g.keyResultId) ?? { total: 0, done: 0 }
    cur.total += g._count._all
    if (g.status === 'COMPLETED') cur.done += g._count._all
    out.set(g.keyResultId, cur)
  }
  return out
}

/** INIT rows for the given KRs; `krPath` maps KR id → its row path (objective ids + KR id). */
export async function loadInitiativeRows(
  viewer: HierarchyViewer,
  ctx: ViewerContext,
  krPath: Map<string, { path: string[]; period: { id: string; name: string } | null }>,
): Promise<HierarchyRow[]> {
  const ids = Array.from(krPath.keys())
  if (ids.length === 0) return []
  const todos = await prisma.todo.findMany({
    where: initiativeVisibilityWhere(viewer, ctx, ids),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      dueDate: true,
      progressValue: true,
      keyResultId: true,
    },
  })
  const rows: HierarchyRow[] = []
  for (const t of todos) {
    if (!t.keyResultId) continue
    const kr = krPath.get(t.keyResultId)
    if (!kr) continue
    rows.push({
      path: [...kr.path, t.id],
      rowId: `init:${t.id}`,
      kind: 'INIT',
      parentRowId: `kr:${t.keyResultId}`,
      data: {
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
        progressValue: t.progressValue,
        assigneeId: t.assigneeId,
        period: kr.period,
        href: `/dashboard/key-results/${t.keyResultId}`,
      },
    })
  }
  return rows
}

/**
 * Ancestor chain (root → objective) for every objective id, walking parents in
 * batched queries — one per tree level — instead of loading every objective.
 */
export async function ancestorPaths(
  objectives: Array<{ id: string; parentObjectiveId: string | null }>,
): Promise<Map<string, string[]>> {
  // parentOf only holds existing, non-deleted objectives; the walk stops at the
  // first id it does not know (deleted or missing parent), as before.
  const parentOf = new Map<string, string | null>()
  for (const o of objectives) parentOf.set(o.id, o.parentObjectiveId)
  const tried = new Set<string>()
  const unknownParents = (list: Array<{ parentObjectiveId: string | null }>) => {
    const s = new Set<string>()
    for (const o of list) {
      const p = o.parentObjectiveId
      if (p && !parentOf.has(p) && !tried.has(p)) s.add(p)
    }
    return s
  }
  let missing = unknownParents(objectives)
  for (let depth = 0; missing.size > 0 && depth < 32; depth++) {
    const ids = Array.from(missing)
    ids.forEach((id) => tried.add(id))
    const found = await prisma.objective.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      select: { id: true, parentObjectiveId: true },
    })
    for (const f of found) parentOf.set(f.id, f.parentObjectiveId)
    missing = unknownParents(found)
  }
  const out = new Map<string, string[]>()
  for (const o of objectives) {
    const acc: string[] = []
    const seen = new Set<string>()
    let cur: string | null | undefined = o.id
    while (cur && !seen.has(cur) && parentOf.has(cur)) {
      seen.add(cur)
      acc.unshift(cur)
      cur = parentOf.get(cur)
    }
    out.set(o.id, acc)
  }
  return out
}
