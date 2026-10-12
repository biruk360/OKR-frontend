/**
 * Batched loader that turns objective / key-result references into connection
 * items, redacted per lib/okr/visibility-scope.ts (CON-8).
 *
 *   - DELETED objectives / KRs (or KRs under a DELETED objective) are dropped.
 *   - An objective outside the viewer's `objective` record scope, or one the
 *     in-memory verdict redacts, comes back as `{ redacted: true }` (no title).
 *   - A KR follows `canViewKeyResultInMemory` given its objective's verdict.
 *
 * Two queries for the rows plus one for the record-scope check, whatever the
 * number of references. Used by `getConnections` and `listLinksFor`.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  buildObjectiveVisibilityWhere,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  type ViewerContext,
  type VisibilityVerdict,
} from '@/lib/okr/visibility-scope'
import { keyResultHref, objectiveHref } from './flags'
import type { ConnectionFinal, ConnectionItem, ConnectionRelation } from './types'

export type ConnectionsDb = PrismaClient | Prisma.TransactionClient

export interface OkrRef extends ConnectionRelation {
  type: 'OBJECTIVE' | 'KEY_RESULT'
}

const PERSON = { select: { id: true, name: true, avatar: true } } as const

const OBJECTIVE_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  status: true,
  goalStatus: true,
  progress: true,
  ownerId: true,
  isPrivate: true,
  level: true,
  departmentId: true,
  endDate: true,
  closureStatus: true,
  outcome: true,
  finalGrade: true,
  finalProgress: true,
  owner: PERSON,
  timeframe: { select: { id: true, name: true } },
} as const

const KEY_RESULT_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  status: true,
  confidence: true,
  progress: true,
  ownerId: true,
  isPrivate: true,
  dueDate: true,
  closureStatus: true,
  outcome: true,
  finalGrade: true,
  finalProgress: true,
  owner: PERSON,
  objective: {
    select: {
      id: true,
      title: true,
      externalRef: true,
      ownerId: true,
      isPrivate: true,
      level: true,
      departmentId: true,
      status: true,
      timeframe: { select: { id: true, name: true } },
    },
  },
} as const

function finalOf(row: {
  closureStatus: string
  outcome: string | null
  finalGrade: number | null
  finalProgress: number | null
}): ConnectionFinal | null {
  if (row.closureStatus === 'OPEN' && row.finalGrade == null && row.outcome == null) return null
  return {
    closureStatus: row.closureStatus,
    outcome: row.outcome,
    finalGrade: row.finalGrade,
    finalProgress: row.finalProgress,
  }
}

function relationOf(ref: OkrRef): ConnectionRelation {
  const rel: ConnectionRelation = { type: ref.type, id: ref.id, via: ref.via }
  if (ref.linkId) {
    rel.linkId = ref.linkId
    rel.linkKind = ref.linkKind
    rel.subKind = ref.subKind ?? null
    rel.isPrimary = ref.isPrimary ?? false
  }
  return rel
}

/** Objective ids (of `ids`) that pass the viewer's visibility where (status + record scope). */
export async function objectiveIdsInScope(
  db: ConnectionsDb,
  ctx: ViewerContext,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db.objective.findMany({
    where: { AND: [{ id: { in: Array.from(new Set(ids)) } }, buildObjectiveVisibilityWhere(ctx)] },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}

/** Resolve references in order; missing / deleted targets are dropped. */
export async function resolveOkrItems(
  db: ConnectionsDb,
  ctx: ViewerContext,
  refs: readonly OkrRef[],
): Promise<ConnectionItem[]> {
  if (refs.length === 0) return []
  const objectiveIds = Array.from(new Set(refs.filter((r) => r.type === 'OBJECTIVE').map((r) => r.id)))
  const keyResultIds = Array.from(new Set(refs.filter((r) => r.type === 'KEY_RESULT').map((r) => r.id)))

  const [objectives, keyResults] = await Promise.all([
    objectiveIds.length
      ? db.objective.findMany({ where: { id: { in: objectiveIds } }, select: OBJECTIVE_SELECT })
      : Promise.resolve([]),
    keyResultIds.length
      ? db.keyResult.findMany({ where: { id: { in: keyResultIds } }, select: KEY_RESULT_SELECT })
      : Promise.resolve([]),
  ])

  const inScope = await objectiveIdsInScope(db, ctx, [
    ...objectives.map((o) => o.id),
    ...keyResults.map((k) => k.objective.id),
  ])

  const objectiveVerdict = (o: { id: string; ownerId: string; isPrivate: boolean }): VisibilityVerdict =>
    inScope.has(o.id) ? canViewObjectiveInMemory(ctx, o) : { canView: true, isRedacted: true }

  const byObjective = new Map(objectives.map((o) => [o.id, o]))
  const byKeyResult = new Map(keyResults.map((k) => [k.id, k]))

  const out: ConnectionItem[] = []
  for (const ref of refs) {
    const rel = relationOf(ref)
    if (ref.type === 'OBJECTIVE') {
      const o = byObjective.get(ref.id)
      if (!o || o.status === 'DELETED') continue
      const verdict = objectiveVerdict(o)
      if (!verdict.canView) continue
      if (verdict.isRedacted) {
        out.push({ ...rel, redacted: true })
        continue
      }
      out.push({
        ...rel,
        redacted: false,
        title: o.title,
        ref: o.externalRef,
        href: objectiveHref(o.id),
        status: o.closureStatus === 'CLOSED' ? 'CLOSED' : o.goalStatus,
        progress: o.progress,
        owner: o.owner,
        level: o.level,
        timeframe: o.timeframe,
        dueDate: o.endDate ? o.endDate.toISOString() : null,
        final: finalOf(o),
      })
      continue
    }
    const k = byKeyResult.get(ref.id)
    if (!k || k.status === 'DELETED' || k.objective.status === 'DELETED') continue
    const verdict = canViewKeyResultInMemory(ctx, k, objectiveVerdict(k.objective))
    if (!verdict.canView) continue
    if (verdict.isRedacted) {
      out.push({ ...rel, redacted: true })
      continue
    }
    const parentVisible = !objectiveVerdict(k.objective).isRedacted
    out.push({
      ...rel,
      redacted: false,
      title: k.title,
      ref: k.externalRef,
      href: keyResultHref(k.id),
      status: k.closureStatus === 'CLOSED' ? 'CLOSED' : k.confidence,
      progress: k.progress,
      owner: k.owner,
      level: k.objective.level,
      timeframe: k.objective.timeframe,
      dueDate: k.dueDate ? k.dueDate.toISOString() : null,
      final: finalOf(k),
      parentLabel: parentVisible ? k.objective.externalRef ?? k.objective.title : null,
    })
  }
  return out
}
