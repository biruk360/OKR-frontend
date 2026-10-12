'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { kpisApi, type KpiApiError, type KpiListParams } from '../services/api'

export const kpiKeys = {
  all: ['package-kpis'] as const,
  list: (params: KpiListParams) =>
    ['package-kpis', 'list', params.userId, params.timeframeId ?? 'default', params.includeRetired ? 'all' : 'active'] as const,
  readings: (id: string) => ['package-kpis', 'readings', id] as const,
}

/** 403/404 will not change on retry. */
function retryUnlessDenied(failureCount: number, error: unknown) {
  const status = (error as KpiApiError | null)?.status
  return status !== 403 && status !== 404 && failureCount < 2
}

export function useKpis(params: KpiListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: kpiKeys.list(params),
    queryFn: () => kpisApi.list(params),
    enabled: (options.enabled ?? true) && Boolean(params.userId),
    retry: retryUnlessDenied,
  })
}

export function useKpiReadings(id: string | null) {
  return useQuery({
    queryKey: kpiKeys.readings(id ?? 'none'),
    queryFn: () => kpisApi.readings(id as string),
    enabled: Boolean(id),
    retry: retryUnlessDenied,
  })
}

function useInvalidateKpis() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: kpiKeys.all })
}

export function useCreateKpi() {
  const invalidate = useInvalidateKpis()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => kpisApi.create(body),
    onSuccess: () => {
      invalidate()
      toast.success('KPI added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateKpi() {
  const invalidate = useInvalidateKpis()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => kpisApi.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success('KPI updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRetireKpi() {
  const invalidate = useInvalidateKpis()
  return useMutation({
    mutationFn: (id: string) => kpisApi.retire(id),
    onSuccess: () => {
      invalidate()
      toast.success('KPI retired')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSaveKpiReading() {
  const invalidate = useInvalidateKpis()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => kpisApi.saveReading(id, body),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.created ? 'Reading saved' : 'Reading updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
