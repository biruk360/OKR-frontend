'use client'

import { useSearchParams } from 'next/navigation'
import { OrgStrategyMap } from './OrgStrategyMap'
import { MapFilterBar, readFilters } from './MapFilterBar'
import type { MapMode } from '../types'

/**
 * Thin client wrapper: reads filters from URL and feeds them to the map.
 * Lives outside the server page so URL filter changes don't trigger
 * a server-side re-render of the entire page.
 */
export function OrgStrategyMapClient({ mode, timeframeId }: { mode: MapMode; timeframeId: string }) {
  const params = useSearchParams()
  const filters = readFilters(new URLSearchParams(params.toString()))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Filters
        </span>
        <MapFilterBar value={filters} />
      </div>
      <div className="min-h-0 flex-1">
        <OrgStrategyMap mode={mode} timeframeId={timeframeId} filters={filters} />
      </div>
    </div>
  )
}
