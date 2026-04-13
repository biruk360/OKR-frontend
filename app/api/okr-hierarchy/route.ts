import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Server-side filtered OKR hierarchy feed for the tree grid.
 *
 * Query params (all repeatable; comma-separated also accepted):
 *   period[]       Timeframe id
 *   owner[]        User id (objective owner)
 *   team[]         Department id
 *   label[]        Label id
 *   type[]         Objective level (COMPANY|DEPARTMENT|INDIVIDUAL)
 *   status[]       Goal status (ON_TRACK|AT_RISK|OFF_TRACK|CLOSED)
 *   collaborator[] User id (contributor OR KR owner)
 *   progressMin    Number 0-100
 *   progressMax    Number 0-100
 *   q              Free-text search (title contains)
 *
 * Returns rows in a flat list, each carrying its own `path: string[]` so
 * TanStack Table (or any tree renderer) can rebuild the tree without a
 * second fetch. Matching is OR within a param and AND across params.
 */
export const GET = withAuth(async (req) => {
  const url = new URL((req as NextRequest).url)
  const listParam = (key: string): string[] => {
    const values = url.searchParams.getAll(key)
    return values.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  }
  const periodIds = listParam('period')
  const ownerIds = listParam('owner')
  const teamIds = listParam('team')
  const labelIds = listParam('label')
  const levels = listParam('type')
  const statuses = listParam('status')
  const collaboratorIds = listParam('collaborator')
  const progressMin = Number(url.searchParams.get('progressMin') ?? '')
  const progressMax = Number(url.searchParams.get('progressMax') ?? '')
  const q = (url.searchParams.get('q') ?? '').trim()

  const where: any = {
    status: { not: 'DELETED' },
  }
  if (periodIds.length) where.timeframeId = { in: periodIds }
  if (ownerIds.length) where.ownerId = { in: ownerIds }
  if (teamIds.length) where.departmentId = { in: teamIds }
  if (levels.length) where.level = { in: levels }
  if (statuses.length) where.goalStatus = { in: statuses }
  if (Number.isFinite(progressMin)) where.progress = { ...(where.progress ?? {}), gte: progressMin }
  if (Number.isFinite(progressMax)) where.progress = { ...(where.progress ?? {}), lte: progressMax }
  if (labelIds.length) where.objectiveLabels = { some: { labelId: { in: labelIds } } }
  if (collaboratorIds.length) {
    where.OR = [
      { ownerId: { in: collaboratorIds } },
      { contributors: { some: { userId: { in: collaboratorIds } } } },
      { keyResults: { some: { ownerId: { in: collaboratorIds } } } },
    ]
  }
  if (q) where.title = { contains: q, mode: 'insensitive' }

  const objectives = await prisma.objective.findMany({
    where,
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      department: { select: { id: true, name: true } },
      objectiveLabels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
      contributors: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
      keyResults: {
        where: { status: { not: 'DELETED' } },
        orderBy: { createdAt: 'asc' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          todos: {
            where: { status: { not: 'CANCELLED' } },
            select: {
              id: true,
              title: true,
              status: true,
              assigneeId: true,
              dueDate: true,
              progressValue: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, value: true, confidence: true, analysis: true },
          },
          activityLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, action: true },
          },
        },
      },
      activityLogs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, action: true },
      },
    },
  })

  // Load the full set of objectives regardless of filter so that we can walk
  // the ancestor chain and build each matching row's path all the way to root.
  const allObjectivesMin = await prisma.objective.findMany({
    where: { status: { not: 'DELETED' } },
    select: { id: true, title: true, parentObjectiveId: true },
  })
  const byId = new Map(allObjectivesMin.map((o) => [o.id, o]))

  const pathFor = (id: string): string[] => {
    const acc: string[] = []
    let cur: string | null | undefined = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const node = byId.get(cur)
      if (!node) break
      acc.unshift(node.id)
      cur = node.parentObjectiveId
    }
    return acc
  }

  type Row = {
    path: string[]
    rowId: string
    kind: 'OBJ' | 'KR' | 'INIT'
    parentRowId: string | null
    data: Record<string, unknown>
  }

  const rows: Row[] = []
  for (const o of objectives) {
    const idPath = pathFor(o.id)
    const objRowId = `obj:${o.id}`
    const latestOwnUpdate = o.activityLogs[0]?.createdAt ?? null
    const latestChildUpdate = o.keyResults
      .map((k) => k.checkIns[0]?.createdAt ?? k.activityLogs[0]?.createdAt ?? null)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    const lastUpdate =
      [latestOwnUpdate, latestChildUpdate]
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? o.updatedAt

    rows.push({
      path: idPath,
      rowId: objRowId,
      kind: 'OBJ',
      parentRowId: o.parentObjectiveId ? `obj:${o.parentObjectiveId}` : null,
      data: {
        id: o.id,
        title: o.title,
        level: o.level,
        progress: o.progress,
        goalStatus: o.goalStatus,
        weight: o.weight,
        startDate: o.startDate ?? o.timeframe?.startDate ?? null,
        endDate: o.endDate ?? o.timeframe?.endDate ?? null,
        period: o.timeframe ? { id: o.timeframe.id, name: o.timeframe.name } : null,
        owner: o.owner,
        team: o.department,
        labels: o.objectiveLabels.map((l) => l.label),
        collaborators: o.contributors.map((c) => c.user),
        lastUpdate,
        latestUpdateText: o.activityLogs[0]?.action ?? null,
        href: `/dashboard/objectives/${o.id}`,
      },
    })

    for (const kr of o.keyResults) {
      const krRowId = `kr:${kr.id}`
      const ci = kr.checkIns[0] ?? null
      const lastKrUpdate = ci?.createdAt ?? kr.activityLogs[0]?.createdAt ?? kr.updatedAt
      rows.push({
        path: [...idPath, kr.id],
        rowId: krRowId,
        kind: 'KR',
        parentRowId: objRowId,
        data: {
          id: kr.id,
          title: kr.title,
          progress: kr.progress,
          confidence: kr.confidence,
          weight: kr.weight,
          startDate: o.startDate ?? o.timeframe?.startDate ?? null,
          endDate: o.endDate ?? o.timeframe?.endDate ?? null,
          period: o.timeframe ? { id: o.timeframe.id, name: o.timeframe.name } : null,
          owner: kr.owner,
          team: o.department,
          labels: [],
          collaborators: [],
          lastUpdate: lastKrUpdate,
          latestUpdateText: ci?.analysis ?? kr.activityLogs[0]?.action ?? null,
          startValue: kr.startValue,
          currentValue: kr.currentValue,
          targetValue: kr.targetValue,
          unit: kr.unit,
          href: `/dashboard/key-results/${kr.id}`,
        },
      })

      for (const t of kr.todos) {
        rows.push({
          path: [...idPath, kr.id, t.id],
          rowId: `init:${t.id}`,
          kind: 'INIT',
          parentRowId: krRowId,
          data: {
            id: t.id,
            title: t.title,
            status: t.status,
            dueDate: t.dueDate,
            progressValue: t.progressValue,
            assigneeId: t.assigneeId,
            period: o.timeframe ? { id: o.timeframe.id, name: o.timeframe.name } : null,
            href: `/dashboard/key-results/${kr.id}`,
          },
        })
      }
    }
  }

  // Reference data for the filter popovers.
  const [timeframes, owners, teams, labels] = await Promise.all([
    prisma.timeframe.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, startDate: true, endDate: true, type: true },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, avatar: true, email: true },
    }),
    prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.label.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ])

  return apiSuccess({ rows, refs: { timeframes, owners, teams, labels } })
})
