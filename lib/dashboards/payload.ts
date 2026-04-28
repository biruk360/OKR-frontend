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
  assigneeId: string
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
      assigneeName: t.assignee.name,
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

  return {
    keyResults: krRows,
    objectives: objectiveRows,
    todos: todoRows,
    filterOptions: { users: allUsers, departments: allDepartments, timeframes: allTimeframes },
    generatedAt: new Date().toISOString(),
  }
}
