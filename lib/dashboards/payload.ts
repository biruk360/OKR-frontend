/**
 * Shared loader for the report-dashboard payloads. Used by:
 *   - app/dashboard/reports/page.tsx (server-rendered first paint)
 *   - app/api/dashboards/ceo (admin/exec live refresh)
 *   - app/api/dashboards/me (per-employee live refresh)
 *
 * Keep the query identical so client-side cache stays consistent across the
 * SSR payload and a refresh fetched by SWR.
 */

import { prisma } from '@/lib/prisma'

export type DashboardScope = 'ceo' | 'me'

export interface DashboardPayload {
  keyResults: KrRow[]
  objectives: ObjectiveRow[]
  todos: TodoRow[]
  filterOptions: {
    users: Array<{ id: string; name: string }>
    departments: Array<{ id: string; name: string }>
    timeframes: Array<{ id: string; name: string }>
  }
  /**
   * Personal-only enrichments — populated for `scope === 'me'`. Used by the
   * Employee super-dashboard for velocity, streaks, and the alignment strip.
   * Empty arrays for `scope === 'ceo'` to keep the type uniform.
   */
  personal: {
    /** ISO date strings (YYYY-MM-DD) when this user marked a KR-linked initiative complete. */
    completionDates: string[]
    /** ISO date strings (YYYY-MM-DD) when this user logged a KR check-in. */
    checkinDates: string[]
    /** Parent-objective chain for objectives owned by this user (for alignment strip). */
    alignmentChains: Array<{
      objectiveId: string
      objectiveTitle: string
      ancestors: Array<{ id: string; title: string; level: string }>
    }>
  }
  /** ISO timestamp the payload was built. Useful for the "live" badge in the UI. */
  generatedAt: string
}

export interface KrRow {
  id: string
  title: string
  progress: number
  confidence: string
  unit: string
  startValue: number
  targetValue: number
  currentValue: number
  objectiveId: string
  objectiveTitle: string
  objectiveProgress: number
  planLabel: string
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  checkInCount: number
  status: string
}

export interface ObjectiveRow {
  id: string
  title: string
  progress: number
  goalStatus: string
  level: string
  planLabel: string
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
  keyResultCount: number
}

export interface TodoRow {
  id: string
  title: string
  status: string
  priority: string
  keyResultId: string
  krTitle: string
  objectiveTitle: string
  /** Optional Trello-style — a card may have no primary assignee. */
  assigneeId: string | null
  assigneeName: string
  dueDate: string | null
}

/**
 * Load the dashboard payload for the given scope + user. CEO scope returns all
 * active OKRs; employee scope is filtered to ones the user owns, contributes
 * to, or has assigned initiatives on.
 */
export async function loadDashboardPayload(
  scope: DashboardScope,
  userId: string
): Promise<DashboardPayload> {
  const baseWhere =
    scope === 'me'
      ? {
          status: 'ACTIVE' as const,
          OR: [
            { ownerId: userId },
            { keyResults: { some: { ownerId: userId, status: { in: ['ACTIVE', 'DRAFT'] } } } },
            { todos: { some: { assigneeId: userId } } },
            { contributors: { some: { userId } } },
          ],
        }
      : { status: 'ACTIVE' as const }

  const objectives = await prisma.objective.findMany({
    where: baseWhere,
    select: {
      id: true,
      title: true,
      progress: true,
      goalStatus: true,
      level: true,
      ownerId: true,
      departmentId: true,
      timeframeId: true,
      timeframe: { select: { name: true } },
      department: { select: { name: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      keyResults: {
        where: { status: { in: ['ACTIVE', 'DRAFT'] } },
        select: {
          id: true,
          title: true,
          progress: true,
          confidence: true,
          unit: true,
          startValue: true,
          targetValue: true,
          currentValue: true,
          ownerId: true,
          status: true,
          owner: { select: { id: true, name: true, avatar: true } },
          _count: { select: { checkIns: true } },
        },
      },
    },
    orderBy: { title: 'asc' },
  })

  const krRows: KrRow[] = []
  const objectiveRows: ObjectiveRow[] = []

  for (const o of objectives) {
    const planLabel =
      [o.department?.name, o.timeframe.name].filter(Boolean).join(' · ') || o.timeframe.name

    objectiveRows.push({
      id: o.id,
      title: o.title,
      progress: o.progress,
      goalStatus: o.goalStatus,
      level: o.level,
      planLabel,
      ownerId: o.ownerId,
      ownerName: o.owner.name,
      ownerAvatar: o.owner.avatar,
      departmentId: o.departmentId,
      departmentName: o.department?.name ?? 'Unassigned',
      timeframeId: o.timeframeId,
      timeframeName: o.timeframe.name,
      keyResultCount: o.keyResults.length,
    })

    for (const kr of o.keyResults) {
      krRows.push({
        id: kr.id,
        title: kr.title,
        progress: kr.progress,
        confidence: kr.confidence,
        unit: kr.unit,
        startValue: kr.startValue,
        targetValue: kr.targetValue,
        currentValue: kr.currentValue,
        objectiveId: o.id,
        objectiveTitle: o.title,
        objectiveProgress: o.progress,
        planLabel,
        departmentId: o.departmentId,
        departmentName: o.department?.name ?? 'Unassigned',
        timeframeId: o.timeframeId,
        timeframeName: o.timeframe.name,
        ownerId: kr.ownerId,
        ownerName: kr.owner.name,
        ownerAvatar: kr.owner.avatar,
        checkInCount: kr._count.checkIns,
        status: kr.status,
      })
    }
  }

  const krIds = krRows.map((k) => k.id)
  const todos =
    krIds.length === 0
      ? []
      : await prisma.todo.findMany({
          where: { keyResultId: { in: krIds } },
          take: 500,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            keyResultId: true,
            assigneeId: true,
            dueDate: true,
            assignee: { select: { id: true, name: true } },
            keyResult: {
              select: {
                id: true,
                title: true,
                objective: { select: { id: true, title: true } },
              },
            },
          },
        })

  const todoRows: TodoRow[] = todos
    .filter((t) => t.keyResultId && t.keyResult)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      keyResultId: t.keyResultId as string,
      krTitle: t.keyResult!.title,
      objectiveTitle: t.keyResult!.objective.title,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? '',
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    }))

  const [allUsers, allDepartments, allTimeframes] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.timeframe.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { startDate: 'desc' },
    }),
  ])

  // ── Personal enrichment (employee scope only). For CEO scope we return empty
  //    arrays so the Employee dashboard can still render against an admin's
  //    payload if they switch modes.
  let personal: DashboardPayload['personal'] = {
    completionDates: [],
    checkinDates: [],
    alignmentChains: [],
  }
  if (scope === 'me') {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 84) // ~12 weeks of history
    const [completedTodos, checkIns, ownedObjectives] = await Promise.all([
      prisma.todo.findMany({
        where: {
          assigneeId: userId,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
        select: { completedAt: true },
      }),
      prisma.keyResultCheckIn.findMany({
        where: { createdById: userId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.objective.findMany({
        where: { ownerId: userId, status: 'ACTIVE' },
        select: { id: true, title: true, parentObjectiveId: true },
      }),
    ])

    const toDay = (d: Date | null): string | null =>
      d ? d.toISOString().slice(0, 10) : null

    // Build a parent-id → ancestor walker to derive each owned objective's
    // alignment chain. Cap at 5 hops to keep payload bounded; cycles are
    // impossible by design but we still guard against them.
    const allParentIds = ownedObjectives
      .map((o) => o.parentObjectiveId)
      .filter((id): id is string => Boolean(id))
    const ancestorRows =
      allParentIds.length === 0
        ? []
        : await prisma.objective.findMany({
            where: {
              OR: [
                { id: { in: allParentIds } },
                { id: { in: await collectAncestorIds(allParentIds, 5) } },
              ],
            },
            select: { id: true, title: true, level: true, parentObjectiveId: true },
          })
    const ancestorById = new Map(ancestorRows.map((r) => [r.id, r]))

    const alignmentChains: DashboardPayload['personal']['alignmentChains'] = ownedObjectives.map((o) => {
      const ancestors: Array<{ id: string; title: string; level: string }> = []
      const seen = new Set<string>([o.id])
      let cursor = o.parentObjectiveId
      let hops = 0
      while (cursor && !seen.has(cursor) && hops < 5) {
        const row = ancestorById.get(cursor)
        if (!row) break
        ancestors.push({ id: row.id, title: row.title, level: row.level })
        seen.add(row.id)
        cursor = row.parentObjectiveId
        hops++
      }
      return { objectiveId: o.id, objectiveTitle: o.title, ancestors }
    })

    personal = {
      completionDates: completedTodos.map((t) => toDay(t.completedAt)).filter((d): d is string => Boolean(d)),
      checkinDates: checkIns.map((c) => toDay(c.createdAt)).filter((d): d is string => Boolean(d)),
      alignmentChains,
    }
  }

  return {
    keyResults: krRows,
    objectives: objectiveRows,
    todos: todoRows,
    filterOptions: { users: allUsers, departments: allDepartments, timeframes: allTimeframes },
    personal,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Walk the parent chain a fixed number of hops, returning every ancestor id
 * encountered. Used so the loader can fetch the entire alignment tree above
 * the user's owned objectives in one extra query.
 */
async function collectAncestorIds(seedIds: string[], maxDepth: number): Promise<string[]> {
  const collected = new Set<string>(seedIds)
  let frontier = seedIds
  for (let i = 0; i < maxDepth && frontier.length > 0; i++) {
    const rows = await prisma.objective.findMany({
      where: { id: { in: frontier } },
      select: { parentObjectiveId: true },
    })
    const next: string[] = []
    for (const r of rows) {
      if (r.parentObjectiveId && !collected.has(r.parentObjectiveId)) {
        collected.add(r.parentObjectiveId)
        next.push(r.parentObjectiveId)
      }
    }
    frontier = next
  }
  return Array.from(collected)
}
