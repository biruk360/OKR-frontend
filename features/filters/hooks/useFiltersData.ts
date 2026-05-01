'use client'

import { useQuery } from '@tanstack/react-query'
import type { FiltersTab, FilterState, FilteredResult, KpiData, ProgressBucket } from '../types'
import { buildProgressBuckets } from '../components/ProgressChart'

async function fetchObjectives(filters: FilterState): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('limit', '200')
  if (filters.confidence?.length) params.set('confidence', filters.confidence.join(','))
  if (filters.planStatus?.length) params.set('status', filters.planStatus[0])
  const res = await fetch(`/api/objectives?${params}`)
  if (!res.ok) throw new Error('Failed to fetch objectives')
  const json = await res.json()
  const items = json.data ?? []
  return items.map((o: any) => ({
    id: o.id,
    title: o.title,
    planId: o.timeframeId ?? o.id,
    planName: o.timeframe?.name ?? 'No Plan',
    progress: Math.round(o.progress ?? 0),
    confidence: o.confidence,
    ownerName: o.owner?.name,
    entityType: 'objectives' as FiltersTab,
  }))
}

async function fetchKeyResults(filters: FilterState): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('limit', '200')
  if (filters.confidence?.length) params.set('confidence', filters.confidence.join(','))
  const res = await fetch(`/api/keyresults?${params}`)
  if (!res.ok) throw new Error('Failed to fetch key results')
  const json = await res.json()
  const items = json.data ?? []
  return items.map((kr: any) => ({
    id: kr.id,
    title: kr.title,
    planId: kr.objective?.timeframeId ?? kr.objectiveId,
    planName: kr.objective?.timeframe?.name ?? kr.objective?.title ?? 'No Plan',
    progress: Math.round(kr.progress ?? 0),
    confidence: kr.confidence,
    ownerName: kr.owner?.name,
    entityType: 'key-results' as FiltersTab,
  }))
}

async function fetchInitiatives(filters: FilterState): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('mine', 'all')
  params.set('limit', '200')
  if (filters.workStatus?.length) {
    const raw = filters.workStatus.map(reverseMapWorkStatus).filter(Boolean)
    if (raw.length === 1) params.set('status', raw[0]!)
  }
  const res = await fetch(`/api/todos?${params}`)
  if (!res.ok) return []
  const json = await res.json()
  const items = json.data ?? []
  return items.map((t: any) => ({
    id: t.id,
    title: t.title,
    planId: t.keyResult?.objective?.timeframeId ?? t.keyResultId ?? 'none',
    planName: t.keyResult?.objective?.timeframe?.name ?? t.keyResult?.objective?.title ?? 'No Plan',
    progress: t.status === 'COMPLETED' ? 100 : t.status === 'IN_PROGRESS' ? 50 : 0,
    workStatus: mapTodoStatus(t.status),
    ownerName: t.assignee?.name,
    entityType: 'initiatives' as FiltersTab,
  }))
}

function mapTodoStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Backlog',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Done',
    CANCELLED: 'Abandoned',
  }
  return map[status] ?? status
}

function reverseMapWorkStatus(label: string): string | undefined {
  const map: Record<string, string> = {
    Backlog: 'PENDING',
    'In Progress': 'IN_PROGRESS',
    Done: 'COMPLETED',
    Abandoned: 'CANCELLED',
  }
  return map[label]
}

function computeKpi(results: FilteredResult[], tab: FiltersTab): KpiData {
  if (tab === 'key-results') {
    return {
      pending: results.filter((r) => !r.confidence).length,
      onTrack: results.filter((r) => r.confidence === 'ON_TRACK').length,
      atRisk: results.filter((r) => r.confidence === 'AT_RISK').length,
      offTrack: results.filter((r) => r.confidence === 'OFF_TRACK').length,
      notMeasurable: 0,
    }
  }
  if (tab === 'objectives') {
    const avgNcs =
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + (r.progress ?? 0), 0) / results.length)
        : 0
    return {
      avgNcs,
      lowConfidence: results.filter((r) => r.confidence === 'OFF_TRACK').length,
      moderateConfidence: results.filter((r) => r.confidence === 'AT_RISK').length,
      highConfidence: results.filter((r) => r.confidence === 'ON_TRACK').length,
    }
  }
  const completed = results.filter((r) => r.workStatus === 'Done').length
  const avgCompletion =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.progress ?? 0), 0) / results.length)
      : 0
  return {
    avgCompletion,
    dueThisWeek: 0,
    overdue: 0,
    completedOnTime: completed,
  }
}

export interface FiltersDataResult {
  results: FilteredResult[]
  kpi: KpiData
  buckets: ProgressBucket[]
  isLoading: boolean
  error: Error | null
}

export function useFiltersData(tab: FiltersTab, filters: FilterState): FiltersDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['filters', tab, filters],
    queryFn: async () => {
      if (tab === 'objectives') return fetchObjectives(filters)
      if (tab === 'key-results') return fetchKeyResults(filters)
      return fetchInitiatives(filters)
    },
    staleTime: 30_000,
  })

  const results = data ?? []
  const kpi = computeKpi(results, tab)
  const buckets = buildProgressBuckets(results.map((r) => r.progress ?? 0))

  return { results, kpi, buckets, isLoading, error: error as Error | null }
}
