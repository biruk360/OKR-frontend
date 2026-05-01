'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Share2, Save, MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SegmentsPanel } from './SegmentsPanel'
import { FilterBar } from './FilterBar'
import { KpiTiles } from './KpiTiles'
import { ProgressChart } from './ProgressChart'
import { ResultsList } from './ResultsList'
import { useFiltersData } from '../hooks/useFiltersData'
import { DEFAULT_SEGMENT_BY_TAB } from '../segments'
import type { FilterState, FiltersTab, SegmentId } from '../types'

const TABS: { id: FiltersTab; label: string; icon: string }[] = [
  { id: 'objectives',  label: 'Objectives',  icon: '🎯' },
  { id: 'key-results', label: 'Key Results',  icon: '#' },
  { id: 'initiatives', label: 'Initiatives',  icon: '✓' },
]

// ─── URL-synced filter state ──────────────────────────────────────────────────

function useFiltersState() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabParam = (searchParams.get('tab') as FiltersTab) || 'key-results'
  const segmentParam = searchParams.get('segment') as SegmentId | null

  const [filters, setFilters] = useState<FilterState>(() => ({
    planStatus: searchParams.get('planStatus')?.split(','),
    confidence: searchParams.get('confidence')?.split(','),
  }))

  const [activeSegment, setActiveSegment] = useState<SegmentId | null>(
    segmentParam ?? (DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId)
  )

  function push(tab: FiltersTab, segment: SegmentId | null, f: FilterState) {
    const p = new URLSearchParams()
    p.set('tab', tab)
    if (segment) p.set('segment', segment)
    if (f.planStatus?.length) p.set('planStatus', f.planStatus.join(','))
    if (f.confidence?.length) p.set('confidence', f.confidence.join(','))
    router.replace(`?${p}`, { scroll: false })
  }

  function setTab(tab: FiltersTab) {
    const seg = DEFAULT_SEGMENT_BY_TAB[tab] as SegmentId
    setActiveSegment(seg); setFilters({})
    push(tab, seg, {})
  }

  function selectSegment(id: SegmentId) {
    setActiveSegment(id)
    push(tabParam, id, filters)
  }

  function changeFilter(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch }
    setFilters(next); setActiveSegment(null)
    push(tabParam, null, next)
  }

  function reset() {
    const seg = DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId
    setFilters({}); setActiveSegment(seg)
    push(tabParam, seg, {})
  }

  return { tab: tabParam, setTab, activeSegment, selectSegment, filters, changeFilter, reset }
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export function FiltersWorkspace() {
  const { tab, setTab, activeSegment, selectSegment, filters, changeFilter, reset } = useFiltersState()
  const { results, kpi, buckets, isLoading } = useFiltersData(tab, filters, activeSegment)

  const [activeFilterIds, setActiveFilterIds] = useState<(keyof FilterState)[]>([])

  function handleTileClick(filterKey: string, value: string) {
    const key = filterKey as keyof FilterState
    if (!activeFilterIds.includes(key)) setActiveFilterIds((p) => [...p, key])
    changeFilter({ [key]: [value] })
  }

  function handleBucketClick(min: number, max: number) {
    const next = [...activeFilterIds]
    if (!next.includes('progressAbove')) next.push('progressAbove')
    if (!next.includes('progressBelow')) next.push('progressBelow')
    setActiveFilterIds(next)
    changeFilter({ progressAbove: min, progressBelow: max })
  }

  function handleShare() {
    navigator.clipboard?.writeText(window.location.href)
  }

  const entityLabel = tab === 'objectives' ? 'objectives' : tab === 'key-results' ? 'key results' : 'initiatives'

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--ap-bg)' }}>
      {/* ── Page header ── */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-6 py-4"
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--ap-accent)', color: '#fff' }}
          >
            <SlidersHorizontal className="size-4" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--ap-fg)' }}>
              Filters
            </h1>
            <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              Slice the OKR portfolio by objectives, key results, or initiatives
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg-muted)', background: 'var(--ap-bg-raised)' }}
          >
            <Save className="size-3.5" />
            Save segment
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-85"
            style={{ background: 'var(--ap-accent)' }}
          >
            <Share2 className="size-3.5" />
            Share
          </button>
          <button type="button" className="rounded-lg p-2 transition-colors hover:bg-black/5">
            <MoreHorizontal className="size-4" style={{ color: 'var(--ap-fg-subtle)' }} />
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div
        className="flex shrink-0 items-center border-b px-6"
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
      >
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setActiveFilterIds([]) }}
              className={cn(
                'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-[var(--ap-duration-base)]',
                active
                  ? 'after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full'
                  : 'opacity-60 hover:opacity-100'
              )}
              style={active
                ? { color: 'var(--ap-accent)', '--tw-after-bg': 'var(--ap-accent)' } as any
                : { color: 'var(--ap-fg-muted)' }
              }
            >
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'var(--ap-accent)' }}
                />
              )}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Body: left segments + main ── */}
      <div className="flex min-h-0 flex-1">
        <SegmentsPanel tab={tab} activeSegment={activeSegment} onSegmentSelect={selectSegment} />

        {/* Main area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Filter bar */}
          <div style={{ background: 'var(--ap-bg-raised)', borderBottom: '1px solid var(--ap-border)' }}>
            <FilterBar
              tab={tab}
              filters={filters}
              activeFilterIds={activeFilterIds}
              onActiveFilterIdsChange={setActiveFilterIds}
              onFilterChange={changeFilter}
              onReset={() => { reset(); setActiveFilterIds([]) }}
            />
          </div>

          {/* Match count + sort */}
          <div
            className="flex shrink-0 items-center justify-between border-b px-5 py-2"
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="size-3.5 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
                <span className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Loading…</span>
              </div>
            ) : (
              <span className="text-[13px]" style={{ color: 'var(--ap-fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--ap-fg)' }}>{results.length}</span>{' '}
                {entityLabel} match your filters
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              Sort by
              <select
                className="rounded-md border-none bg-transparent text-xs font-medium focus:outline-none"
                style={{ color: 'var(--ap-fg-muted)' }}
              >
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
          <div className="shrink-0 px-5 pb-4">
            <ProgressChart buckets={buckets} onBucketClick={(b) => handleBucketClick(b.min, b.max)} />
          </div>

          {/* Results */}
          <ResultsList results={results} tab={tab} onReset={() => { reset(); setActiveFilterIds([]) }} />
        </div>
      </div>
    </div>
  )
}
