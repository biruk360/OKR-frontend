'use client'

/**
 * PersonDependencyGraph (CON-4, PRF-16 Graph toggle): the person in the
 * centre, inbound providers on the left, outbound needers on the right.
 *
 * Reads GET /api/dependencies/person/[userId] through the dependencies
 * feature's hook with the same parameters as DependenciesProfileTab, so the
 * List and Graph views share one cached request. Mount it as the profile
 * tab's `graphSlot`:
 *
 *   <DependenciesProfileTab userId={id} timeframeId={tf}
 *     graphSlot={<PersonDependencyGraph userId={id} timeframeId={tf} />} />
 */
import { useMemo, useState } from 'react'
import { GitPullRequestArrow } from 'lucide-react'
import { usePersonDependencies } from '@/features/dependencies'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { DependencyGraphCanvas, type DependencyGraphCanvasProps } from './DependencyGraphCanvas'
import { buildPersonDependencyGraph, findPersonInDependencies, type GraphPerson } from './graph-model'

export interface PersonDependencyGraphProps {
  userId: string
  /** Timeframe filter; empty string or null shows every timeframe. */
  timeframeId?: string | null
  /** Canvas height. Default 480px. */
  height?: number | string
  focusedDependencyId?: string | null
  onOpenDependency?: DependencyGraphCanvasProps['onOpenDependency']
  onOpenPerson?: DependencyGraphCanvasProps['onOpenPerson']
  className?: string
}

export function PersonDependencyGraph({
  userId,
  timeframeId,
  height = 480,
  focusedDependencyId,
  onOpenDependency,
  onOpenPerson,
  className,
}: PersonDependencyGraphProps) {
  const [showClosed, setShowClosed] = useState(true)
  // Same key as DependenciesProfileTab's default (closed rows included) → one shared request.
  const query = usePersonDependencies({ userId, timeframeId: timeframeId || null, includeClosed: true })

  const rows = useMemo(() => {
    const data = query.data
    if (!data) return null
    const keep = <T extends { open: boolean }>(list: T[]) => (showClosed ? list : list.filter((r) => r.open))
    return { inbound: keep(data.inbound), outbound: keep(data.outbound), all: [...data.inbound, ...data.outbound] }
  }, [query.data, showClosed])

  const fromRows = useMemo(() => (rows ? findPersonInDependencies(userId, rows.all) : null), [rows, userId])
  // Only look the name up in the directory when the rows do not carry it.
  const { users } = useUsersForSelection({ enabled: !!rows && !fromRows })
  const subject = useMemo<GraphPerson>(() => {
    if (fromRows) return fromRows
    const user = users.find((u) => u.id === userId)
    return { id: userId, name: user?.name ?? user?.email ?? null, avatar: null }
  }, [fromRows, users, userId])

  const layout = useMemo(
    () => (rows ? buildPersonDependencyGraph({ subject, inbound: rows.inbound, outbound: rows.outbound }) : null),
    [rows, subject],
  )

  if (query.isLoading) {
    return (
      <div className={cn('space-y-3 p-4', className)} aria-busy="true" aria-label="Loading dependency graph">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="w-full" style={{ height: typeof height === 'number' ? height - 40 : 400 }} />
      </div>
    )
  }

  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status
    return (
      <EmptyState
        className={className}
        icon={GitPullRequestArrow}
        title={status === 403 ? 'Dependencies are private' : 'Could not load the dependency graph'}
        description={
          status === 403 ? 'You do not have access to this person’s dependencies.' : 'Something went wrong. Try again in a moment.'
        }
        action={status === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  if (!rows || !layout) return null
  const closedCount = rows.all.filter((r) => !r.open).length
  const empty = rows.inbound.length === 0 && rows.outbound.length === 0

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ap-border)] px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {layout.stats.late > 0 && <MiniBadge tone="danger">{layout.stats.late} late</MiniBadge>}
          {layout.stats.dueSoon > 0 && <MiniBadge tone="warn">{layout.stats.dueSoon} due soon</MiniBadge>}
          <MiniBadge>{rows.inbound.length} inbound</MiniBadge>
          <MiniBadge>{rows.outbound.length} outbound</MiniBadge>
          {layout.withoutParties > 0 && (
            <span className="text-caption text-[var(--ap-fg-subtle)]">
              {layout.withoutParties} without visible parties
            </span>
          )}
        </div>
        {closedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-caption text-[var(--ap-fg-subtle)]">
            <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(v === true)} />
            Show done &amp; dropped ({closedCount})
          </label>
        )}
      </div>
      {empty ? (
        <EmptyState
          bare
          icon={GitPullRequestArrow}
          title="Nothing to map"
          description={
            closedCount > 0
              ? 'Every dependency in this timeframe is done or dropped. Tick “Show done & dropped” to see them.'
              : 'This person has no inbound or outbound dependencies in this timeframe.'
          }
          className="py-12"
        />
      ) : (
        <DependencyGraphCanvas
          layout={layout}
          height={height}
          focusedDependencyId={focusedDependencyId}
          onOpenDependency={onOpenDependency}
          onOpenPerson={onOpenPerson}
          ariaLabel={`Dependency graph for ${subject.name ?? 'this person'}`}
        />
      )}
    </div>
  )
}
