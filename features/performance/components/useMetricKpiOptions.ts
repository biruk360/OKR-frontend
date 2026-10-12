'use client'

import { useQuery } from '@tanstack/react-query'
import type { PerformanceMetricMapping } from '../types'

/**
 * KPI-9 — package KPIs the metric-mapping picker can offer for one employee.
 * Mirrors GET /api/performance/metric-mappings/kpi-options. Kept next to the
 * picker (its only consumer); move to `features/performance/hooks` and
 * `services/api.ts` when the hooks owner picks it up.
 */
export type MetricKpiOption = {
  id: string
  name: string
  unit: string
  direction: string
  frequency: string
  status: string
  isSensitive: boolean
  timeframe: { id: string; name: string } | null
  /** False when the KPI's direction does not fit the criterion's scoring rule. */
  mappable: boolean
  issue: string | null
}

export type MetricKpiOptions = {
  kpis: MetricKpiOption[]
  permissions: { canViewKpis: boolean; canViewSensitiveKpis: boolean; hiddenCount: number }
}

/** A mapping row as the API returns it once KPI sources exist. */
export type MetricMappingWithKpi = Omit<PerformanceMetricMapping, 'sourceType'> & {
  sourceType: PerformanceMetricMapping['sourceType'] | 'KPI'
  kpiId?: string | null
  kpi?: {
    id: string
    name: string
    unit: string
    direction: string
    frequency: string
    status: string
    isSensitive: boolean
    timeframe: { id: string; name: string } | null
    redacted: boolean
  } | null
}

type Envelope<T> = { success: boolean; data?: T; error?: string }

async function fetchKpiOptions(employeeId: string, criterionId: string): Promise<MetricKpiOptions> {
  const params = new URLSearchParams({ employeeId })
  if (criterionId) params.set('criterionId', criterionId)
  const response = await fetch(`/api/performance/metric-mappings/kpi-options?${params.toString()}`)
  const body = await response.json().catch(() => null) as Envelope<MetricKpiOptions> | null
  if (!response.ok || !body?.success || !body.data) throw new Error(body?.error ?? `Request failed: ${response.status}`)
  return body.data
}

export function useMetricKpiOptions(employeeId: string, criterionId: string) {
  return useQuery({
    queryKey: ['performance', 'metric-kpi-options', employeeId, criterionId],
    queryFn: () => fetchKpiOptions(employeeId, criterionId),
    enabled: !!employeeId && !!criterionId,
  })
}
