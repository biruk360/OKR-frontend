import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OKRHierarchy from '@/components/hierarchy/OKRHierarchy'
import TimeframeDropdown from '@/components/hierarchy/TimeframeDropdown'
import { Target, Users, TrendingUp, AlertCircle } from 'lucide-react'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { ModeToggle, OrgStrategyMapClient, DiagnosticsTray, type MapMode } from '@/features/strategy-map'

async function getObjectivesWithHierarchy(timeframeId: string) {
  const objectives = await prisma.objective.findMany({
    where: {
      timeframeId,
      status: 'ACTIVE',
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      parentObjective: {
        select: {
          id: true,
          title: true,
          level: true,
        },
      },
      childObjectives: {
        where: {
          status: 'ACTIVE',
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              keyResults: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
      keyResults: {
        where: {
          status: 'ACTIVE',
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          todos: {
            select: {
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      _count: {
        select: {
          keyResults: true,
          childObjectives: true,
        },
      },
    },
    orderBy: [
      { level: 'asc' },
      { createdAt: 'desc' },
    ],
  })

  return objectives
}

/**
 * Pick the best default timeframe for the strategy map.
 *
 * Priority:
 *   1. One that *covers today* AND has active objectives in it
 *   2. Any timeframe that has active objectives (most recent first)
 *   3. Fall back to `pickCurrentTimeframe()` (covers today even if empty)
 *
 * This avoids the "blank canvas" bug where the current quarter has no data yet.
 */
async function pickDefaultTimeframe() {
  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })

  // Objective counts per timeframe for ACTIVE only.
  const counts = await prisma.objective.groupBy({
    by: ['timeframeId'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  })
  const countMap = new Map<string, number>()
  for (const c of counts) countMap.set(c.timeframeId, c._count._all)

  const now = new Date()
  const coveringToday = timeframes.filter((t) => t.startDate <= now && now <= t.endDate)

  // 1. Covers today AND has objectives
  const withData = coveringToday.find((t) => (countMap.get(t.id) ?? 0) > 0)
  if (withData) return { timeframes, selected: withData }

  // 2. Any timeframe with objectives, most-recent-start first
  const anyWithData = timeframes.find((t) => (countMap.get(t.id) ?? 0) > 0)
  if (anyWithData) return { timeframes, selected: anyWithData }

  // 3. Fall back to the "current" timeframe per pickCurrentTimeframe (even if empty)
  const fallback = pickCurrentTimeframe(timeframes)
  return { timeframes, selected: fallback }
}

async function getHierarchyStats(objectives: any[]) {
  const companyObjectives = objectives.filter((obj) => obj.level === 'COMPANY')
  const departmentObjectives = objectives.filter((obj) => obj.level === 'DEPARTMENT')
  const individualObjectives = objectives.filter((obj) => obj.level === 'INDIVIDUAL')

  const alignedObjectives = objectives.filter((obj) => obj.parentObjectiveId)
  const unalignedObjectives = objectives.filter((obj) => !obj.parentObjectiveId)

  const avgProgress =
    objectives.length > 0
      ? objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length
      : 0

  return {
    total: objectives.length,
    company: companyObjectives.length,
    department: departmentObjectives.length,
    individual: individualObjectives.length,
    aligned: alignedObjectives.length,
    unaligned: unalignedObjectives.length,
    avgProgress: Math.round(avgProgress),
  }
}

interface PageProps {
  searchParams?:
    | { timeframeId?: string; mode?: string }
    | Promise<{ timeframeId?: string; mode?: string }>
}

export default async function AlignmentMapPage({ searchParams }: PageProps) {
  const session = await getServerSessionSafe()

  if (!session?.user) {
    redirect('/auth/signin')
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {})

  const { timeframes, selected: defaultTimeframe } = await pickDefaultTimeframe()

  if (timeframes.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-muted px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-2 text-sm font-medium text-foreground">No timeframes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a timeframe to view the strategy map.
          </p>
        </div>
      </div>
    )
  }

  // Respect ?timeframeId=... from URL if valid, else use the smart default.
  const requestedId = resolvedSearchParams.timeframeId
  const currentTimeframe =
    (requestedId && timeframes.find((t) => t.id === requestedId)) ||
    defaultTimeframe ||
    timeframes[0]

  if (!currentTimeframe) {
    return null
  }

  const rawMode = (resolvedSearchParams as any).mode
  const mode: MapMode =
    rawMode === 'org' || rawMode === 'combined' ? rawMode : 'strategy'

  const objectives = await getObjectivesWithHierarchy(currentTimeframe.id)
  const stats = await getHierarchyStats(objectives)

  const brandingName = await prisma.systemSettings.findUnique({
    where: { key: 'branding_workspaceName' },
    select: { value: true },
  })
  const workspaceName =
    brandingName?.value?.trim() || process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Company'

  // Pre-compute objective counts per timeframe so the dropdown can show a hint
  // next to each option ("Q1 2026 · 10 objectives").
  const perTimeframeCounts = await prisma.objective.groupBy({
    by: ['timeframeId'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  })
  const countsByTimeframe: Record<string, number> = {}
  for (const row of perTimeframeCounts) {
    countsByTimeframe[row.timeframeId] = row._count._all
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <TimeframeDropdown
          timeframes={timeframes.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            startDate: t.startDate.toISOString(),
            endDate: t.endDate.toISOString(),
            objectiveCount: countsByTimeframe[t.id] ?? 0,
          }))}
          selectedId={currentTimeframe.id}
        />
        <ModeToggle value={mode} />
        <span className="hidden sm:inline text-muted-foreground">|</span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-blue-600" />
          {stats.total} objectives
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-green-600" />
          {stats.aligned} aligned
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
          {stats.unaligned} unaligned
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-purple-600" />
          {stats.avgProgress}% avg
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {mode === 'strategy' ? (
            objectives.length === 0 ? (
              <div className="flex h-full min-h-[240px] items-center justify-center px-4">
                <div className="text-center max-w-md">
                  <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-2 text-sm font-medium text-foreground">
                    No objectives in {currentTimeframe.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the timeframe dropdown above to pick another period, or create an objective for this cycle.
                  </p>
                </div>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-blue-600" />
                  </div>
                }
              >
                <OKRHierarchy
                  objectives={objectives}
                  currentTimeframeId={currentTimeframe.id}
                  timeframeName={currentTimeframe.name}
                  workspaceName={workspaceName}
                  layout="fullscreen"
                />
              </Suspense>
            )
          ) : (
            <OrgStrategyMapClient mode={mode} timeframeId={currentTimeframe.id} />
          )}
        </div>

        <DiagnosticsTray />

        <div className="shrink-0 border-t border-border bg-card px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {mode === 'strategy' ? (
            <>
              <span className="font-medium text-muted-foreground">Legend:</span> Strategy view —
              objective parent/child alignment. Solid edges = formal alignment. Use the mode toggle
              for Org or Combined views.
            </>
          ) : (
            <>
              <span className="font-medium text-muted-foreground">Legend:</span> Solid edges =
              strategic alignment (parent → child OKR). Dashed = ownership / containment.
              Dotted = manager / reporting. Crown = department head.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
