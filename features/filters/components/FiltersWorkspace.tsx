'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Share2, Save, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SegmentsPanel } from './SegmentsPanel'
import { FilterBar } from './FilterBar'
import { KpiTiles } from './KpiTiles'
import { ProgressChart } from './ProgressChart'
import { ResultsList } from './ResultsList'
import { useFiltersData } from '../hooks/useFiltersData'
import { DEFAULT_SEGMENT_BY_TAB } from '../segments'
import type { FilterState, FiltersTab, SegmentId } from '../types'

const TABS: { id: FiltersTab; label: string }[] = [
  { id: 'objectives', label: 'Objectives' },
  { id: 'key-results', label: 'Key Results' },
  { id: 'initiatives', label: 'Initiatives' },
]

function useFiltersState() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabParam = (searchParams.get('tab') as FiltersTab) || 'key-results'
  const segmentParam = searchParams.get('segment') as SegmentId | null

  const [filters, setFilters] = useState<FilterState>(() => {
    const planStatus = searchParams.get('planStatus')
    const confidence = searchParams.get('confidence')
    return {
      planStatus: planStatus ? planStatus.split(',') : undefined,
      confidence: confidence ? confidence.split(',') : undefined,
    }
  })

  const [activeSegment, setActiveSegment] = useState<SegmentId | null>(
    segmentParam ?? (DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId)
  )

  function updateURL(tab: FiltersTab, segment: SegmentId | null, f: FilterState) {
    const p = new URLSearchParams()
    p.set('tab', tab)
    if (segment) p.set('segment', segment)
    if (f.planStatus?.length) p.set('planStatus', f.planStatus.join(','))
    if (f.confidence?.length) p.set('confidence', f.confidence.join(','))
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  function setTab(tab: FiltersTab) {
    const seg = DEFAULT_SEGMENT_BY_TAB[tab] as SegmentId
    setActiveSegment(seg)
    setFilters({})
    updateURL(tab, seg, {})
  }

  function selectSegment(id: SegmentId) {
    setActiveSegment(id)
    updateURL(tabParam, id, filters)
  }

  function changeFilter(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch }
    setFilters(next)
    setActiveSegment(null)
    updateURL(tabParam, null, next)
  }

  function reset() {
    const seg = DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId
    setFilters({})
    setActiveSegment(seg)
    updateURL(tabParam, seg, {})
  }

  return { tab: tabParam, setTab, activeSegment, selectSegment, filters, changeFilter, reset }
}

export function FiltersWorkspace() {
  const { tab, setTab, activeSegment, selectSegment, filters, changeFilter, reset } = useFiltersState()
  const { results, kpi, buckets, isLoading } = useFiltersData(tab, filters, activeSegment)

  // Lifted so tile/chart clicks can inject a filter type into the bar
  const [activeFilterIds, setActiveFilterIds] = useState<(keyof FilterState)[]>([])

  function handleTileClick(filterKey: string, value: string) {
    const key = filterKey as keyof FilterState
    if (!activeFilterIds.includes(key)) {
      setActiveFilterIds((prev) => [...prev, key])
    }
    changeFilter({ [key]: [value] })
  }

  function handleBucketClick(min: number, max: number) {
    const hasAbove = activeFilterIds.includes('progressAbove')
    const hasBelow = activeFilterIds.includes('progressBelow')
    const next = [...activeFilterIds]
    if (!hasAbove) next.push('progressAbove')
    if (!hasBelow) next.push('progressBelow')
    setActiveFilterIds(next)
    changeFilter({ progressAbove: min, progressBelow: max })
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href)
  }

  const entityLabel =
    tab === 'objectives' ? 'objectives' : tab === 'key-results' ? 'key results' : 'initiatives'

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">Filters</h1>
          <p className="text-xs text-muted-foreground">
            Slice the OKR portfolio by objectives, key results, or initiatives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Save segment
          </button>
          <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={handleShare}>
            <Share2 className="size-3.5" />
            Share
          </Button>
          <button type="button" className="rounded p-1 hover:bg-muted">
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-border px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setActiveFilterIds([]) }}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Segments left rail */}
        <SegmentsPanel tab={tab} activeSegment={activeSegment} onSegmentSelect={selectSegment} />

        {/* Main area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Filter bar */}
          <FilterBar
            tab={tab}
            filters={filters}
            activeFilterIds={activeFilterIds}
            onActiveFilterIdsChange={setActiveFilterIds}
            onFilterChange={changeFilter}
            onReset={() => { reset(); setActiveFilterIds([]) }}
          />

          {/* Match count + sort */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-1.5">
            {isLoading ? (
              <span className="text-sm text-muted-foreground">Loading…</span>
            ) : (
              <span className="text-sm font-semibold">
                {results.length} {entityLabel} match your filters
              </span>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Sort by
              <select className="rounded border-none bg-transparent text-sm font-medium text-foreground focus:outline-none">
                <option>Plan</option>
                <option>Owner</option>
                <option>Progress</option>
                <option>Confidence</option>
                <option>Updated</option>
              </select>
            </div>
          </div>

          {/* KPI tiles */}
          <KpiTiles tab={tab} data={kpi} onTileClick={handleTileClick} />

          {/* Progress chart */}
          <div className="shrink-0 px-4 pb-3">
            <ProgressChart
              buckets={buckets}
              onBucketClick={(b) => handleBucketClick(b.min, b.max)}
            />
          </div>

          {/* Results list */}
          <ResultsList results={results} tab={tab} onReset={() => { reset(); setActiveFilterIds([]) }} />
        </div>
      </div>
    </div>
  )
}
