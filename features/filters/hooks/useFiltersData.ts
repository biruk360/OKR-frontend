'use client'

import { useQuery } from '@tanstack/react-query'
import type { FiltersTab, FilterState, FilteredResult, KpiData, ProgressBucket, SegmentId } from '../types'
import { buildProgressBuckets } from '../components/ProgressChart'

// ─── Segment → API params translation ────────────────────────────────────────

function segmentToParams(segmentId: SegmentId | null, userId: string | undefined): Record<string, string> {
  if (!segmentId) return {}
  const p: Record<string, string> = {}
  switch (segmentId) {
    case 'obj-active':     p.status = 'ACTIVE'; break
    case 'obj-draft':      p.status = 'DRAFT'; break
    case 'obj-low-confidence':      p.confidence = 'OFF_TRACK'; break
    case 'obj-moderate-confidence': p.confidence = 'AT_RISK'; break
    case 'obj-high-confidence':     p.confidence = 'ON_TRACK'; break
    case 'kr-active':      p.status = 'ACTIVE'; break
    case 'kr-draft':       p.status = 'DRAFT'; break
    case 'kr-all-off-track': p.confidence = 'OFF_TRACK'; break
    case 'kr-all-at-risk':   p.confidence = 'AT_RISK'; break
    case 'kr-owned':
    case 'kr-owned-off-track':
    case 'kr-owned-at-risk':
      if (userId) p.ownerId = userId
      if (segmentId === 'kr-owned-off-track') p.confidence = 'OFF_TRACK'
      if (segmentId === 'kr-owned-at-risk')   p.confidence = 'AT_RISK'
      break
    case 'kr-not-measurable': p.notMeasurable = 'true'; break
    case 'kr-pending-checkins': p.pendingCheckins = 'true'; break
    case 'kr-without-owner': p.withoutOwner = 'true'; break
    case 'init-active': p.status = 'ACTIVE'; break
    case 'init-draft':  p.status = 'DRAFT'; break
    case 'init-owned':
      if (userId) p.mine = 'assigned'
      break
    case 'init-overdue': p.overdue = 'true'; break
    default: break
  }
  return p
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

async function fetchObjectives(filters: FilterState, segmentParams: Record<string, string>): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('limit', '500')

  // segment-derived params first
  Object.entries(segmentParams).forEach(([k, v]) => params.set(k, v))

  // explicit filter overrides
  if (filters.confidence?.length)  params.set('confidence', filters.confidence.join(','))
  if (filters.planStatus?.length)  params.set('status', mapPlanStatusToApi(filters.planStatus[0]))
  if (filters.owners?.length)      params.set('ownerId', filters.owners[0])
  if (filters.teams?.length)       params.set('departmentId', filters.teams[0])
  if (filters.plans?.length)       params.set('timeframeId', filters.plans[0])

  const res = await fetch(`/api/objectives?${params}`)
  if (!res.ok) throw new Error('Failed to fetch objectives')
  const json = await res.json()
  let items: FilteredResult[] = (json.data ?? []).map((o: any) => ({
    id: o.id,
    title: o.title,
    planId: o.timeframeId ?? o.id,
    planName: o.timeframe?.name ?? o.timeframe?.id ?? 'No Plan',
    timeframeName: o.timeframe?.name,
    progress: Math.round(o.progress ?? 0),
    confidence: o.confidence,
    ownerName: o.owner?.name ?? null,
    ownerId: o.ownerId,
    level: o.level,
    krCount: o._count?.keyResults ?? o.keyResults?.length ?? 0,
    entityType: 'objectives' as FiltersTab,
  }))

  // client-side post-filters
  if (filters.progressAbove !== undefined) items = items.filter((r) => (r.progress ?? 0) >= filters.progressAbove!)
  if (filters.progressBelow !== undefined) items = items.filter((r) => (r.progress ?? 0) <= filters.progressBelow!)

  return items
}

async function fetchKeyResults(filters: FilterState, segmentParams: Record<string, string>): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('limit', '500')

  Object.entries(segmentParams).forEach(([k, v]) => params.set(k, v))

  if (filters.confidence?.length) params.set('confidence', filters.confidence.join(','))
  if (filters.owners?.length)     params.set('ownerId', filters.owners[0])
  if (filters.plans?.length)      params.set('timeframeId', filters.plans[0])

  const res = await fetch(`/api/keyresults?${params}`)
  if (!res.ok) throw new Error('Failed to fetch key results')
  const json = await res.json()
  let items: FilteredResult[] = (json.data ?? []).map((kr: any) => ({
    id: kr.id,
    title: kr.title,
    planId: kr.objective?.timeframeId ?? kr.objectiveId ?? 'unknown',
    planName: kr.objective?.timeframe?.name ?? kr.objective?.title ?? 'No Plan',
    timeframeName: kr.objective?.timeframe?.name,
    progress: Math.round(kr.progress ?? 0),
    confidence: kr.confidence,
    ownerName: kr.owner?.name ?? null,
    ownerId: kr.ownerId,
    objectiveId: kr.objectiveId ?? kr.objective?.id,
    objectiveTitle: kr.objective?.title,
    objectiveConfidence: kr.objective?.confidence,
    objectiveProgress: kr.objective?.progress != null ? Math.round(kr.objective.progress) : undefined,
    currentValue: kr.currentValue,
    targetValue: kr.targetValue,
    startValue: kr.startValue,
    unit: kr.unit,
    initiativeCount: kr._count?.todos ?? 0,
    entityType: 'key-results' as FiltersTab,
  }))

  if (filters.progressAbove !== undefined) items = items.filter((r) => (r.progress ?? 0) >= filters.progressAbove!)
  if (filters.progressBelow !== undefined) items = items.filter((r) => (r.progress ?? 0) <= filters.progressBelow!)

  return items
}

async function fetchInitiatives(filters: FilterState, segmentParams: Record<string, string>): Promise<FilteredResult[]> {
  const params = new URLSearchParams()
  params.set('mine', segmentParams.mine ?? 'all')
  params.set('limit', '500')

  if (filters.workStatus?.length) {
    const statuses = filters.workStatus.map(reverseMapWorkStatus).filter(Boolean)
    if (statuses.length === 1) params.set('status', statuses[0]!)
  }
  if (segmentParams.status) params.set('status', segmentParams.status)
  if (filters.owners?.length) params.set('assigneeId', filters.owners[0])

  const res = await fetch(`/api/todos?${params}`)
  if (!res.ok) return []
  const json = await res.json()
  let items: FilteredResult[] = (json.data ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    planId: t.keyResult?.objective?.timeframeId ?? t.keyResultId ?? 'unknown',
    planName: t.keyResult?.objective?.timeframe?.name ?? t.keyResult?.objective?.title ?? 'No Plan',
    progress: t.status === 'COMPLETED' ? 100 : t.status === 'IN_PROGRESS' ? 50 : 0,
    workStatus: mapTodoStatus(t.status),
    ownerName: t.assignee?.name ?? null,
    ownerId: t.assigneeId,
    entityType: 'initiatives' as FiltersTab,
  }))

  if (filters.progressAbove !== undefined) items = items.filter((r) => (r.progress ?? 0) >= filters.progressAbove!)
  if (filters.progressBelow !== undefined) items = items.filter((r) => (r.progress ?? 0) <= filters.progressBelow!)

  return items
}

function mapPlanStatusToApi(label: string): string {
  const m: Record<string, string> = { 'In Progress': 'ACTIVE', Active: 'ACTIVE', Draft: 'DRAFT', Completed: 'COMPLETED', Archived: 'ARCHIVED' }
  return m[label] ?? label.toUpperCase()
}

function mapTodoStatus(status: string): string {
  const map: Record<string, string> = { PENDING: 'Backlog', IN_PROGRESS: 'In Progress', COMPLETED: 'Done', CANCELLED: 'Abandoned' }
  return map[status] ?? status
}

function reverseMapWorkStatus(label: string): string | undefined {
  const map: Record<string, string> = { Backlog: 'PENDING', 'In Progress': 'IN_PROGRESS', Done: 'COMPLETED', Abandoned: 'CANCELLED' }
  return map[label]
}

// ─── KPI computation ──────────────────────────────────────────────────────────

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
    const avgNcs = results.length
      ? Math.round(results.reduce((s, r) => s + (r.progress ?? 0), 0) / results.length)
      : 0
    return {
      avgNcs,
      lowConfidence: results.filter((r) => r.confidence === 'OFF_TRACK').length,
      moderateConfidence: results.filter((r) => r.confidence === 'AT_RISK').length,
      highConfidence: results.filter((r) => r.confidence === 'ON_TRACK').length,
    }
  }
  const avgCompletion = results.length
    ? Math.round(results.reduce((s, r) => s + (r.progress ?? 0), 0) / results.length)
    : 0
  return {
    avgCompletion,
    dueThisWeek: 0,
    overdue: results.filter((r) => r.workStatus === 'Blocked').length,
    completedOnTime: results.filter((r) => r.workStatus === 'Done').length,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface FiltersDataResult {
  results: FilteredResult[]
  kpi: KpiData
  buckets: ProgressBucket[]
  isLoading: boolean
  error: Error | null
}

export function useFiltersData(
  tab: FiltersTab,
  filters: FilterState,
  segmentId: SegmentId | null = null,
  userId?: string
): FiltersDataResult {
  const segmentParams = segmentToParams(segmentId, userId)

  const { data, isLoading, error } = useQuery({
    queryKey: ['filters', tab, filters, segmentId],
    queryFn: async () => {
      if (tab === 'objectives')   return fetchObjectives(filters, segmentParams)
      if (tab === 'key-results')  return fetchKeyResults(filters, segmentParams)
      return fetchInitiatives(filters, segmentParams)
    },
    staleTime: 30_000,
  })

  const results = data ?? []
  const kpi = computeKpi(results, tab)
  const buckets = buildProgressBuckets(results.map((r) => r.progress ?? 0))

  return { results, kpi, buckets, isLoading, error: error as Error | null }
}
