/**
 * Operating package — the items in scope for review (PKG-2 "m").
 *
 * Items belong to the employee and timeframe directly (D1); the package header
 * is optional (PKG-5). The reviewable set for (userId, timeframeId) is:
 *   OBJECTIVE   objectives the person owns in the timeframe (not archived / deleted)
 *   KEY_RESULT  KRs of those objectives, plus KRs the person owns under another
 *               objective in the timeframe
 *   TODO        milestones (Todo.kind = MILESTONE) under those KRs
 *   KPI         active KPIs
 *   DUTY        recurring duties that are not retired
 *   DEVELOPMENT development items that are not dropped
 *   ROLE_ITEM   items of the current role definition (timeframe-specific first,
 *               then evergreen; latest DRAFT / APPROVED version)
 *   DEPENDENCY  work dependencies in the timeframe the person is a party to
 *               (not dropped)
 *
 * Server-only (Prisma).
 */
import { prisma } from '@/lib/prisma'
import type { PackageReviewEntityType } from '@/types/package'
import { packageItemKey } from './rules'

export interface PackageItemRow {
  entityType: PackageReviewEntityType
  entityId: string
  title: string
  /** OKR visibility inputs (OBJECTIVE / KEY_RESULT / TODO). */
  ownerId: string | null
  isPrivate: boolean
  /** KEY_RESULT / TODO: the parent objective's visibility fields. */
  objective: { ownerId: string; isPrivate: boolean } | null
  /** TODO: the parent KR's visibility fields. */
  keyResult: { ownerId: string; isPrivate: boolean } | null
  /** KPI: quota / commission KPI (KPI-7). */
  isSensitive: boolean
}

type Db = Pick<
  typeof prisma,
  | 'objective'
  | 'keyResult'
  | 'todo'
  | 'kpi'
  | 'recurringDuty'
  | 'developmentItem'
  | 'roleDefinition'
  | 'workDependency'
>

const CLOSED_OKR_STATUSES = ['DELETED', 'ARCHIVED']

function row(partial: Partial<PackageItemRow> & Pick<PackageItemRow, 'entityType' | 'entityId' | 'title'>): PackageItemRow {
  return {
    ownerId: null,
    isPrivate: false,
    objective: null,
    keyResult: null,
    isSensitive: false,
    ...partial,
  }
}

/** Every reviewable item of the person's package for the timeframe. */
export async function loadPackageItems(
  userId: string,
  timeframeId: string,
  db: Db = prisma,
): Promise<PackageItemRow[]> {
  const okrWhere = { timeframeId, status: { notIn: CLOSED_OKR_STATUSES } }
  const [objectives, keyResults, kpis, duties, development, roleDefinitions, dependencies] = await Promise.all([
    db.objective.findMany({
      where: { ...okrWhere, ownerId: userId },
      select: { id: true, title: true, ownerId: true, isPrivate: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.keyResult.findMany({
      where: {
        status: { notIn: CLOSED_OKR_STATUSES },
        objective: okrWhere,
        OR: [{ ownerId: userId }, { objective: { ownerId: userId } }],
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        isPrivate: true,
        objective: { select: { ownerId: true, isPrivate: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.kpi.findMany({
      where: { ownerId: userId, timeframeId, status: 'ACTIVE' },
      select: { id: true, name: true, isSensitive: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.recurringDuty.findMany({
      where: { ownerId: userId, timeframeId, status: { not: 'RETIRED' } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.developmentItem.findMany({
      where: { ownerId: userId, timeframeId, status: { not: 'DROPPED' } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.roleDefinition.findMany({
      where: { userId, status: { in: ['DRAFT', 'APPROVED'] }, OR: [{ timeframeId }, { timeframeId: null }] },
      select: {
        id: true,
        timeframeId: true,
        status: true,
        createdAt: true,
        items: { select: { id: true, label: true, text: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.workDependency.findMany({
      where: { timeframeId, status: { not: 'DROPPED' }, parties: { some: { userId } } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const krIds = keyResults.map((kr) => kr.id)
  const milestones =
    krIds.length === 0
      ? []
      : await db.todo.findMany({
          where: { keyResultId: { in: krIds }, kind: 'MILESTONE', archivedAt: null, recurrenceParentId: null },
          select: { id: true, title: true, keyResultId: true },
          orderBy: { createdAt: 'asc' },
        })
  const krById = new Map(keyResults.map((kr) => [kr.id, kr]))

  const items: PackageItemRow[] = []
  for (const o of objectives) {
    items.push(row({ entityType: 'OBJECTIVE', entityId: o.id, title: o.title, ownerId: o.ownerId, isPrivate: o.isPrivate }))
  }
  for (const kr of keyResults) {
    items.push(
      row({
        entityType: 'KEY_RESULT',
        entityId: kr.id,
        title: kr.title,
        ownerId: kr.ownerId,
        isPrivate: kr.isPrivate,
        objective: kr.objective,
      }),
    )
  }
  for (const m of milestones) {
    const kr = m.keyResultId ? krById.get(m.keyResultId) : undefined
    items.push(
      row({
        entityType: 'TODO',
        entityId: m.id,
        title: m.title,
        objective: kr?.objective ?? null,
        keyResult: kr ? { ownerId: kr.ownerId, isPrivate: kr.isPrivate } : null,
      }),
    )
  }
  for (const k of kpis) items.push(row({ entityType: 'KPI', entityId: k.id, title: k.name, isSensitive: k.isSensitive }))
  for (const d of duties) items.push(row({ entityType: 'DUTY', entityId: d.id, title: d.title }))
  for (const d of development) items.push(row({ entityType: 'DEVELOPMENT', entityId: d.id, title: d.title }))

  const currentRole =
    roleDefinitions.find((r) => r.timeframeId === timeframeId) ?? roleDefinitions.find((r) => r.timeframeId === null)
  for (const item of currentRole?.items ?? []) {
    items.push(row({ entityType: 'ROLE_ITEM', entityId: item.id, title: item.label ? `${item.label} — ${item.text}` : item.text }))
  }
  for (const d of dependencies) items.push(row({ entityType: 'DEPENDENCY', entityId: d.id, title: d.title }))

  return items
}

/** Item keys (`ENTITY_TYPE:id`) only — for counts. */
export async function loadPackageItemKeys(userId: string, timeframeId: string, db: Db = prisma): Promise<Set<string>> {
  const items = await loadPackageItems(userId, timeframeId, db)
  return new Set(items.map((item) => packageItemKey(item.entityType, item.entityId)))
}
