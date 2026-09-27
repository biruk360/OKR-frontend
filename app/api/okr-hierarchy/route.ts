import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import {
  buildObjectiveVisibilityWhere,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  REDACTED_KEY_RESULT_TITLE,
  REDACTED_OBJECTIVE_TITLE,
} from '@/lib/okr/visibility-scope'
import { ALL_TIMEFRAMES, resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import {
  ancestorPaths,
  initiativeCountsByKr,
  loadInitiativeRows,
  type HierarchyRow,
} from './_shared'

export const dynamic = 'force-dynamic'

/**
 * Server-side filtered OKR hierarchy feed for the tree grid.
 *
 * Query params (all repeatable; comma-separated also accepted):
 *   period[]       Timeframe id. Omitted → the active timeframe
 *                  (lib/okr/active-timeframe.ts); `period=all` → every timeframe.
 *   owner[]        User id (objective owner)
 *   team[]         Department id
 *   label[]        Label id
 *   type[]         Objective level (COMPANY|DEPARTMENT|INDIVIDUAL)
 *   status[]       Goal status (ON_TRACK|AT_RISK|OFF_TRACK|CLOSED)
 *   collaborator[] User id (contributor OR KR owner)
 *   progressMin    Number 0-100
 *   progressMax    Number 0-100
 *   q              Free-text search (title contains; only matches objectives the
 *                  viewer sees unredacted)
 *   refs           `0` → skip the reference tables (timeframes/owners/teams/labels);
 *                  clients fetch them once and pass `refs=0` on refetches.
 *   initiatives    `1` → also return INIT rows. Default: KR/OBJ rows carry
 *                  `initiativeCount` / `initiativeDoneCount` and the tree loads a
 *                  KR's initiatives on demand from `/api/okr-hierarchy/initiatives`.
 *
 * Visibility (lib/okr/visibility-scope.ts): every objective the viewer may see
 * (canViewObjective), minus DELETED, within the viewer's objective record scope;
 * private objectives/KRs the viewer may only see redacted come back with the
 * `[Private …]` title, no values, no update text and `isRedacted: true`.
 *
 * Returns rows in a flat list, each carrying its own `path: string[]` so
 * TanStack Table (or any tree renderer) can rebuild the tree without a
 * second fetch. Matching is OR within a param and AND across params.
 */
export const GET = withAuth(async (req, { session }) => {
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden('Forbidden')

  const url = new URL((req as NextRequest).url)
  const listParam = (key: string): string[] => {
    const values = url.searchParams.getAll(key)
    return values.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  }
  const requestedPeriods = listParam('period')
  const ownerIds = listParam('owner')
  const teamIds = listParam('team')
  const labelIds = listParam('label')
  const levels = listParam('type')
  const statuses = listParam('status')
  const collaboratorIds = listParam('collaborator')
  const progressMin = Number(url.searchParams.get('progressMin') ?? '')
  const progressMax = Number(url.searchParams.get('progressMax') ?? '')
  const q = (url.searchParams.get('q') ?? '').trim()
  const includeRefs = url.searchParams.get('refs') !== '0'
  const includeInitiatives = url.searchParams.get('initiatives') === '1'

  const viewer = { id: session.user.id, role: session.user.role, userType: session.user.userType }
  const [ctx, defaultTimeframe] = await Promise.all([
    loadViewerContext(viewer),
    requestedPeriods.length === 0 ? resolveDefaultTimeframe() : Promise.resolve(null),
  ])

  const allPeriods = requestedPeriods.includes(ALL_TIMEFRAMES)
  const periodIds = allPeriods
    ? []
    : requestedPeriods.length > 0
      ? requestedPeriods
      : defaultTimeframe
        ? [defaultTimeframe.id]
        : []

  const filters: Prisma.ObjectiveWhereInput[] = [buildObjectiveVisibilityWhere(ctx)]
  if (periodIds.length) filters.push({ timeframeId: { in: periodIds } })
  if (ownerIds.length) filters.push({ ownerId: { in: ownerIds } })
  if (teamIds.length) filters.push({ departmentId: { in: teamIds } })
  if (levels.length) filters.push({ level: { in: levels } })
  if (statuses.length) filters.push({ goalStatus: { in: statuses } })
  if (Number.isFinite(progressMin) && url.searchParams.get('progressMin')) filters.push({ progress: { gte: progressMin } })
  if (Number.isFinite(progressMax) && url.searchParams.get('progressMax')) filters.push({ progress: { lte: progressMax } })
  if (labelIds.length) filters.push({ objectiveLabels: { some: { labelId: { in: labelIds } } } })
  if (collaboratorIds.length) {
    filters.push({
      OR: [
        { ownerId: { in: collaboratorIds } },
        { contributors: { some: { userId: { in: collaboratorIds } } } },
        { keyResults: { some: { ownerId: { in: collaboratorIds } } } },
      ],
    })
  }
  if (q) {
    // A redacted title must not be matchable — search only what the viewer can read.
    filters.push(buildObjectiveVisibilityWhere(ctx, { includeRedacted: false }))
    filters.push({ title: { contains: q, mode: 'insensitive' } })
  }

  const objectives = await prisma.objective.findMany({
    where: { AND: filters },
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

  const paths = await ancestorPaths(objectives)
  const krIds = objectives.flatMap((o) => o.keyResults.map((k) => k.id))
  const initCounts = await initiativeCountsByKr(viewer, ctx, krIds)
  const krPathForInits = new Map<string, { path: string[]; period: { id: string; name: string } | null }>()

  const rows: HierarchyRow[] = []
  for (const o of objectives) {
    const idPath = paths.get(o.id) ?? [o.id]
    const objRowId = `obj:${o.id}`
    const objVerdict = canViewObjectiveInMemory(ctx, o)
    const objRedacted = objVerdict.isRedacted
    const period = o.timeframe ? { id: o.timeframe.id, name: o.timeframe.name } : null
    const latestOwnUpdate = o.activityLogs[0]?.createdAt ?? null
    const latestChildUpdate = o.keyResults
      .map((k) => k.checkIns[0]?.createdAt ?? k.activityLogs[0]?.createdAt ?? null)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    const lastUpdate =
      [latestOwnUpdate, latestChildUpdate]
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? o.updatedAt

    let objInitTotal = 0
    let objInitDone = 0
    for (const kr of o.keyResults) {
      const c = initCounts.get(kr.id)
      if (c) { objInitTotal += c.total; objInitDone += c.done }
    }

    rows.push({
      path: idPath,
      rowId: objRowId,
      kind: 'OBJ',
      parentRowId: o.parentObjectiveId ? `obj:${o.parentObjectiveId}` : null,
      data: {
        id: o.id,
        title: objRedacted ? REDACTED_OBJECTIVE_TITLE : o.title,
        isRedacted: objRedacted,
        level: o.level,
        progress: o.progress,
        goalStatus: o.goalStatus,
        weight: o.weight,
        startDate: o.startDate ?? o.timeframe?.startDate ?? null,
        endDate: o.endDate ?? o.timeframe?.endDate ?? null,
        period,
        owner: o.owner,
        team: o.department,
        labels: objRedacted ? [] : o.objectiveLabels.map((l) => l.label),
        collaborators: objRedacted ? [] : o.contributors.map((c) => c.user),
        lastUpdate,
        latestUpdateText: objRedacted ? null : o.activityLogs[0]?.action ?? null,
        keyResultCount: o.keyResults.length,
        initiativeCount: objInitTotal,
        initiativeDoneCount: objInitDone,
        href: `/dashboard/objectives/${o.id}`,
      },
    })

    for (const kr of o.keyResults) {
      const krRowId = `kr:${kr.id}`
      const krRedacted = canViewKeyResultInMemory(ctx, kr, objVerdict).isRedacted
      const ci = kr.checkIns[0] ?? null
      const lastKrUpdate = ci?.createdAt ?? kr.activityLogs[0]?.createdAt ?? kr.updatedAt
      const counts = initCounts.get(kr.id) ?? { total: 0, done: 0 }
      if (!krRedacted && counts.total > 0) krPathForInits.set(kr.id, { path: [...idPath, kr.id], period })
      rows.push({
        path: [...idPath, kr.id],
        rowId: krRowId,
        kind: 'KR',
        parentRowId: objRowId,
        data: {
          id: kr.id,
          title: krRedacted ? REDACTED_KEY_RESULT_TITLE : kr.title,
          isRedacted: krRedacted,
          progress: kr.progress,
          confidence: kr.confidence,
          weight: kr.weight,
          startDate: o.startDate ?? o.timeframe?.startDate ?? null,
          endDate: o.endDate ?? o.timeframe?.endDate ?? null,
          period,
          owner: kr.owner,
          team: o.department,
          labels: [],
          collaborators: [],
          lastUpdate: lastKrUpdate,
          latestUpdateText: krRedacted ? null : ci?.analysis ?? kr.activityLogs[0]?.action ?? null,
          startValue: krRedacted ? 0 : kr.startValue,
          currentValue: krRedacted ? 0 : kr.currentValue,
          targetValue: krRedacted ? 0 : kr.targetValue,
          unit: krRedacted ? '' : kr.unit,
          initiativeCount: counts.total,
          initiativeDoneCount: counts.done,
          href: `/dashboard/key-results/${kr.id}`,
        },
      })
    }
  }

  if (includeInitiatives) {
    rows.push(...(await loadInitiativeRows(viewer, ctx, krPathForInits)))
  }

  const meta = {
    periodIds,
    defaultedPeriod: requestedPeriods.length === 0 && Boolean(defaultTimeframe),
    initiativesIncluded: includeInitiatives,
  }

  if (!includeRefs) return apiSuccess({ rows, meta })

  // Reference data for the filter popovers — only on the first load (refs != 0).
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

  return apiSuccess({ rows, meta, refs: { timeframes, owners, teams, labels } })
})
