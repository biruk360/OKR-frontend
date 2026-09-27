'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, Link2, MoreHorizontal, RotateCcw, Save, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { downloadCsv, toCsv } from '@/components/reports/report-csv'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Skeleton } from '@/components/ui/Skeleton'
import { SegmentsPanel } from './SegmentsPanel'
import { FilterBar } from './FilterBar'
import { KpiTiles } from './KpiTiles'
import { ProgressChart, ConfidenceChart, ProgressTimeseriesChart } from './ProgressChart'
import { ResultsList } from './ResultsList'
import { useFiltersData } from '../hooks/useFiltersData'
import { DEFAULT_SEGMENT_BY_TAB } from '../segments'
import {
  DEFAULT_RESULTS_SORT,
  defaultDirection,
  parseResultsSort,
  resultsCsvTable,
  sortOptionsForTab,
  sortResults,
  type ResultsSort,
  type ResultsSortKey,
} from '../sort'
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

  const [sort, setSortState] = useState<ResultsSort>(() => parseResultsSort(searchParams.get('sort'), searchParams.get('dir')))

  function push(tab: FiltersTab, segment: SegmentId | null, f: FilterState, s: ResultsSort = sort) {
    const p = new URLSearchParams(searchParams.get('view') ? { view: searchParams.get('view')! } : undefined) // keep the OKR Explorer's ?view=analyze
    p.set('tab', tab)
    if (segment) p.set('segment', segment)
    if (f.planStatus?.length) p.set('planStatus', f.planStatus.join(','))
    if (f.confidence?.length) p.set('confidence', f.confidence.join(','))
    if (s.key !== DEFAULT_RESULTS_SORT.key) {
      p.set('sort', s.key)
      p.set('dir', s.dir)
    }
    router.replace(`?${p}`, { scroll: false })
  }

  function setTab(tab: FiltersTab) {
    const seg = DEFAULT_SEGMENT_BY_TAB[tab] as SegmentId
    // Keep the sort across tabs unless the new tab cannot sort by it.
    const nextSort = sortOptionsForTab(tab).some((o) => o.value === sort.key) ? sort : DEFAULT_RESULTS_SORT
    setActiveSegment(seg); setFilters({}); setSortState(nextSort)
    push(tab, seg, {}, nextSort)
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

  function setSort(next: ResultsSort) {
    setSortState(next)
    push(tabParam, activeSegment, filters, next)
  }

  function reset() {
    const seg = DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId
    setFilters({}); setActiveSegment(seg)
    push(tabParam, seg, {})
  }

  function resetAll() {
    const seg = DEFAULT_SEGMENT_BY_TAB[tabParam] as SegmentId
    setFilters({}); setActiveSegment(seg); setSortState(DEFAULT_RESULTS_SORT)
    push(tabParam, seg, {}, DEFAULT_RESULTS_SORT)
  }

  return { tab: tabParam, setTab, activeSegment, selectSegment, filters, changeFilter, reset, resetAll, sort, setSort }
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export function FiltersWorkspace() {
  const { tab, setTab, activeSegment, selectSegment, filters, changeFilter, reset, resetAll, sort, setSort } = useFiltersState()
  const { results, kpi, buckets, confidence, timeseries, isLoading, isTimeseriesLoading } =
    useFiltersData(tab, filters, activeSegment)
  const sortedResults = useMemo(() => sortResults(results, sort), [results, sort])

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
    if (!navigator.clipboard) {
      toast.error('Copying is not available in this browser')
      return
    }
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success('Link copied — it keeps these filters and sort'))
      .catch(() => toast.error('Could not copy the link'))
  }

  function handleExportCsv() {
    if (sortedResults.length === 0) {
      toast.error('Nothing to export — no results match these filters')
      return
    }
    const { header, rows } = resultsCsvTable(sortedResults, tab)
    downloadCsv(`okr-filters-${tab}-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCsv(header, rows))
  }

  function handleResetAll() {
    resetAll()
    setActiveFilterIds([])
  }

  const entityLabel = tab === 'objectives' ? 'objectives' : tab === 'key-results' ? 'key results' : 'initiatives'

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--ap-bg)' }}>
      {/* ── Page header ── */}
      <div
        className="shrink-0 border-b px-6 py-4"
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
      >
        <PageHeader
          className="mb-0"
          title="Filters"
          description="Slice the OKR portfolio by objectives, key results, or initiatives"
          actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg-muted)', background: 'var(--ap-bg-raised)' }}
          >
            <Save className="size-3.5" aria-hidden />
            Save segment
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85"
            style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
          >
            <Share2 className="size-3.5" aria-hidden />
            Share
          </button>
          <ActionsMenu
            label="More options"
            className="rounded-lg p-2 transition-colors hover:bg-[var(--ap-bg-hover)]"
            trigger={<MoreHorizontal className="size-4" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />}
            items={[
              {
                key: 'export',
                label: `Export ${sortedResults.length} ${entityLabel} as CSV`,
                icon: Download,
                onSelect: handleExportCsv,
                disabled: isLoading || sortedResults.length === 0,
              },
              { key: 'copy-link', label: 'Copy link to this view', icon: Link2, onSelect: handleShare },
              { key: 'sep', label: '', onSelect: () => {}, divider: true },
              { key: 'reset', label: 'Reset filters and sort', icon: RotateCcw, onSelect: handleResetAll },
            ]}
          />
        </div>
          }
        />
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
              <div className="flex items-center gap-2" aria-busy="true">
                <Skeleton className="h-4 w-40" />
                <span className="sr-only">Loading…</span>
              </div>
            ) : (
              <span className="text-body-sm" style={{ color: 'var(--ap-fg-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--ap-fg)' }}>{results.length}</span>{' '}
                {entityLabel} match your filters
              </span>
            )}
            <div className="flex items-center gap-1">
              <FilterSelect
                label="Sort by"
                value={sort.key}
                clearable={false}
                onValueChange={(v) => {
                  if (!v) return
                  const key = v as ResultsSortKey
                  setSort({ key, dir: key === sort.key ? sort.dir : defaultDirection(key) })
                }}
                options={sortOptionsForTab(tab)}
              />
              {sort.key !== 'plan' && (
                <button
                  type="button"
                  onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                  aria-label={sort.dir === 'asc' ? 'Sorted ascending — switch to descending' : 'Sorted descending — switch to ascending'}
                  title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
                  className="rounded-lg p-1.5 transition-colors hover:bg-[var(--ap-bg-hover)]"
                >
                  {sort.dir === 'asc'
                    ? <ArrowUpNarrowWide className="size-4" style={{ color: 'var(--ap-fg-muted)' }} aria-hidden />
                    : <ArrowDownWideNarrow className="size-4" style={{ color: 'var(--ap-fg-muted)' }} aria-hidden />}
                </button>
              )}
            </div>
          </div>

          {/* KPI tiles */}
          <KpiTiles tab={tab} data={kpi} onTileClick={handleTileClick} />

          {/* Insight cards */}
          <div className="grid shrink-0 grid-cols-1 gap-3 px-5 pb-4 lg:grid-cols-3">
            <ProgressChart buckets={buckets} onBucketClick={(b) => handleBucketClick(b.min, b.max)} />
            <ConfidenceChart
              data={confidence}
              tab={tab}
              onSegmentClick={(key) => {
                if (key === 'PENDING') return
                if (!activeFilterIds.includes('confidence')) {
                  setActiveFilterIds((p) => [...p, 'confidence'])
                }
                changeFilter({ confidence: [key] })
              }}
            />
            <ProgressTimeseriesChart data={timeseries} isLoading={isTimeseriesLoading} />
          </div>

          {/* Results */}
          <ResultsList results={sortedResults} tab={tab} onReset={() => { reset(); setActiveFilterIds([]) }} />
        </div>
      </div>
    </div>
  )
}
