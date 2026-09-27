import { Suspense } from 'react'
import { AlertCircle, Target, TrendingUp, Users } from 'lucide-react'
import OKRHierarchy from '@/components/hierarchy/OKRHierarchy'
import TimeframeDropdown from '@/components/hierarchy/TimeframeDropdown'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { DiagnosticsTray, ModeToggle, OrgStrategyMapClient } from '@/features/strategy-map'
import { loadAlignmentMapData } from '@/lib/okr/alignment-map-data'

/**
 * OKR Explorer — Map view (was /dashboard/alignment-map). Strategy / Org /
 * Combined modes; `?timeframeId=` and `?mode=` stay URL-synced (TimeframeDropdown
 * and ModeToggle keep the Explorer's `view=map` param when they rewrite the URL).
 */
export default async function ExplorerMapView({
  viewer,
  timeframeId,
  mode,
}: {
  viewer: { id: string; role: string }
  timeframeId?: string
  mode?: string
}) {
  const data = await loadAlignmentMapData(viewer, { timeframeId, mode })

  if (data.kind === 'no-timeframes') {
    return (
      <EmptyState
        icon={<AlertCircle className="size-8 text-muted-foreground" aria-hidden="true" />}
        title="No timeframes"
        description="Create a timeframe to view the strategy map."
      />
    )
  }

  const { objectives, stats, currentTimeframe } = data

  return (
    <div
      className="flex h-[calc(100dvh-220px)] min-h-[560px] flex-col overflow-hidden rounded-[var(--ap-radius-md)] border bg-muted"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <TimeframeDropdown timeframes={data.timeframeOptions} selectedId={currentTimeframe.id} />
        <ModeToggle value={data.mode} />
        <span className="hidden sm:inline text-muted-foreground">|</span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-primary-600" />
          {stats.total} objectives
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-success-600" />
          {stats.aligned} aligned
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 text-warning-600" />
          {stats.unaligned} unaligned
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-primary-600" />
          {stats.avgProgress}% avg
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {data.mode === 'strategy' ? (
            objectives.length === 0 ? (
              <EmptyState
                bare
                icon={<AlertCircle className="size-8 text-muted-foreground" aria-hidden="true" />}
                title={`No objectives in ${currentTimeframe.name}`}
                description="Use the timeframe dropdown above to pick another period, or create an objective for this cycle."
              />
            ) : (
              <Suspense
                fallback={
                  <div className="h-64 p-4" aria-busy="true" aria-label="Loading alignment map">
                    <Skeleton className="h-full w-full rounded-lg" />
                  </div>
                }
              >
                <OKRHierarchy
                  objectives={objectives}
                  currentTimeframeId={currentTimeframe.id}
                  timeframeName={currentTimeframe.name}
                  workspaceName={data.workspaceName}
                  layout="fullscreen"
                />
              </Suspense>
            )
          ) : (
            <OrgStrategyMapClient mode={data.mode} timeframeId={currentTimeframe.id} />
          )}
        </div>

        <DiagnosticsTray />

        <div className="shrink-0 border-t border-border bg-card px-3 py-1.5 text-caption leading-snug text-muted-foreground">
          {data.mode === 'strategy' ? (
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
