'use client'

/**
 * CompanyDependencyGraph (CON-4, DEP-6): the company version of the
 * dependency graph — providers │ dependencies │ needers. Presentational: the
 * Dependency Map page passes the rows it already loaded with its filters, so
 * the table and the graph always show the same set.
 *
 * Summary rows (`detail: false`, §8 "titles + status") are drawn without
 * person edges, and the node count is capped (`max`) to keep the canvas fast.
 */
import { useMemo } from 'react'
import { GitPullRequestArrow, Info } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { cn } from '@/lib/utils'
import { DependencyGraphCanvas, type DependencyGraphCanvasProps } from './DependencyGraphCanvas'
import { buildCompanyDependencyGraph, COMPANY_GRAPH_DEFAULT_MAX, type GraphDependency } from './graph-model'

export interface CompanyDependencyGraphProps {
  /** Rows to draw (e.g. `useDependencies(filters).data.dependencies`). */
  dependencies: readonly GraphDependency[]
  /** Most dependencies drawn at once. Default 400. */
  max?: number
  /** Canvas height. Default 620px. */
  height?: number | string
  focusedDependencyId?: string | null
  onOpenDependency?: DependencyGraphCanvasProps['onOpenDependency']
  onOpenPerson?: DependencyGraphCanvasProps['onOpenPerson']
  className?: string
}

export function CompanyDependencyGraph({
  dependencies,
  max = COMPANY_GRAPH_DEFAULT_MAX,
  height = 620,
  focusedDependencyId,
  onOpenDependency,
  onOpenPerson,
  className,
}: CompanyDependencyGraphProps) {
  const layout = useMemo(() => buildCompanyDependencyGraph(dependencies, { max }), [dependencies, max])

  if (dependencies.length === 0) {
    return (
      <EmptyState
        bare
        className={cn('py-12', className)}
        icon={GitPullRequestArrow}
        title="Nothing to map"
        description="No dependencies match these filters."
      />
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ap-border)] px-4 py-2 text-caption text-[var(--ap-fg-subtle)]">
        <span className="font-medium text-[var(--ap-fg)]">Providers → dependencies → needers</span>
        {layout.stats.late > 0 && <MiniBadge tone="danger">{layout.stats.late} late</MiniBadge>}
        {layout.stats.dueSoon > 0 && <MiniBadge tone="warn">{layout.stats.dueSoon} due soon</MiniBadge>}
        <MiniBadge>{layout.stats.open} open</MiniBadge>
        {layout.withoutParties > 0 && (
          <span className="inline-flex items-center gap-1">
            <Info className="size-3.5" aria-hidden />
            {layout.withoutParties} shown without parties (you are not a party)
          </span>
        )}
        {layout.truncated > 0 && (
          <span className="inline-flex items-center gap-1 text-[var(--ap-warn-fg)]">
            <Info className="size-3.5" aria-hidden />
            Showing the first {max}; {layout.truncated} more — narrow the filters to see them
          </span>
        )}
      </div>
      <DependencyGraphCanvas
        layout={layout}
        height={height}
        focusedDependencyId={focusedDependencyId}
        onOpenDependency={onOpenDependency}
        onOpenPerson={onOpenPerson}
        ariaLabel="Company dependency graph"
      />
    </div>
  )
}
