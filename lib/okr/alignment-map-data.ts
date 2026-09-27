/**
 * Server loader for the OKR Explorer's Map view (/dashboard/okrs-all?view=map),
 * moved out of the retired app/dashboard/alignment-map page (no behaviour change).
 *
 * Visibility: every query goes through lib/okr/visibility-scope.ts (not DELETED,
 * objective record scope); private objectives/KRs the viewer may only see
 * redacted keep their shape and progress but lose titles, descriptions and KR
 * values (canViewObjective rule).
 */

import { prisma } from '@/lib/prisma'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import {
  buildObjectiveVisibilityWhere,
  loadViewerContext,
  redactKeyResultForViewer,
  redactObjectiveForViewer,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'

export type AlignmentMapMode = 'strategy' | 'org' | 'combined'

async function getObjectivesWithHierarchy(timeframeId: string, ctx: ViewerContext) {
  const objectives = await prisma.objective.findMany({
    where: {
      AND: [buildObjectiveVisibilityWhere(ctx), { timeframeId, status: 'ACTIVE' }],
    },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
      parentObjective: {
        select: { id: true, title: true, level: true, ownerId: true, isPrivate: true },
      },
      childObjectives: {
        where: { AND: [buildObjectiveVisibilityWhere(ctx), { status: 'ACTIVE' }] },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { keyResults: true } },
        },
        orderBy: { updatedAt: 'desc' },
      },
      keyResults: {
        where: { status: 'ACTIVE' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          todos: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
    orderBy: [{ level: 'asc' }, { createdAt: 'desc' }],
  })

  return objectives.map((o) => {
    const shown = redactObjectiveForViewer(ctx, o)
    return {
      ...shown,
      parentObjective: o.parentObjective ? redactObjectiveForViewer(ctx, o.parentObjective) : null,
      childObjectives: o.childObjectives.map((c) => redactObjectiveForViewer(ctx, c)),
      keyResults: o.keyResults.map((kr) => redactKeyResultForViewer(ctx, kr, o)),
    }
  })
}

/**
 * Default timeframe for the map:
 *   1. one that covers today AND has active objectives
 *   2. any timeframe with active objectives (most recent first)
 *   3. pickCurrentTimeframe() (covers today even if empty)
 * Avoids the "blank canvas" when the current quarter has no data yet.
 */
function pickDefaultTimeframe<T extends { id: string; startDate: Date; endDate: Date }>(
  timeframes: T[],
  countMap: Map<string, number>,
): T | null {
  const now = new Date()
  const coveringToday = timeframes.filter((t) => t.startDate <= now && now <= t.endDate)
  const withData = coveringToday.find((t) => (countMap.get(t.id) ?? 0) > 0)
  if (withData) return withData
  const anyWithData = timeframes.find((t) => (countMap.get(t.id) ?? 0) > 0)
  if (anyWithData) return anyWithData
  return (pickCurrentTimeframe(timeframes) as T | null | undefined) ?? null
}

function hierarchyStats(objectives: Array<{ parentObjectiveId: string | null; progress: number }>) {
  const aligned = objectives.filter((o) => o.parentObjectiveId).length
  const avgProgress =
    objectives.length > 0 ? objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length : 0
  return {
    total: objectives.length,
    aligned,
    unaligned: objectives.length - aligned,
    avgProgress: Math.round(avgProgress),
  }
}

export async function loadAlignmentMapData(
  viewer: { id: string; role: string },
  params: { timeframeId?: string | null; mode?: string | null },
) {
  const ctx = await loadViewerContext({ id: viewer.id, role: viewer.role })
  const [timeframes, perTimeframeCounts] = await Promise.all([
    // Every timeframe: `isActive` is an optional admin flag and is often unset.
    prisma.timeframe.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.objective.groupBy({
      by: ['timeframeId'],
      where: { AND: [buildObjectiveVisibilityWhere(ctx), { status: 'ACTIVE' }] },
      _count: { _all: true },
    }),
  ])
  const countMap = new Map<string, number>()
  for (const row of perTimeframeCounts) countMap.set(row.timeframeId, row._count._all)

  const mode: AlignmentMapMode =
    params.mode === 'org' || params.mode === 'combined' ? params.mode : 'strategy'

  if (timeframes.length === 0) return { kind: 'no-timeframes' as const }

  // Respect ?timeframeId=… when valid, else the smart default.
  const requested = params.timeframeId ? timeframes.find((t) => t.id === params.timeframeId) : undefined
  const currentTimeframe = requested ?? pickDefaultTimeframe(timeframes, countMap) ?? timeframes[0]

  const [objectives, brandingName] = await Promise.all([
    getObjectivesWithHierarchy(currentTimeframe.id, ctx),
    prisma.systemSettings.findUnique({ where: { key: 'branding_workspaceName' }, select: { value: true } }),
  ])
  const workspaceName =
    brandingName?.value?.trim() || process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Company'

  return {
    kind: 'ok' as const,
    mode,
    objectives,
    stats: hierarchyStats(objectives),
    workspaceName,
    currentTimeframe: { id: currentTimeframe.id, name: currentTimeframe.name },
    timeframeOptions: timeframes.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      objectiveCount: countMap.get(t.id) ?? 0,
    })),
  }
}
