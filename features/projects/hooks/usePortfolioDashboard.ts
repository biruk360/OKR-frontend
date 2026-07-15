'use client'

import { useQuery } from '@tanstack/react-query'
import { projectKeys } from './useProjects'
import type { PortfolioDashboardData, PortfolioDashboardFilters } from '@/lib/projects/portfolio-dashboard'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return json.data as T
}

export function usePortfolioDashboard(filters: PortfolioDashboardFilters = {}, enabled = true) {
  const params = new URLSearchParams()
  if (filters.client) params.set('client', filters.client)
  if (filters.projectManagerId) params.set('projectManagerId', filters.projectManagerId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()

  return useQuery({
    queryKey: [...projectKeys.all, 'portfolio-dashboard', filters],
    queryFn: () => fetchJson<PortfolioDashboardData>(`/api/projects/portfolio/dashboard${qs ? `?${qs}` : ''}`),
    enabled,
    staleTime: 30_000,
  })
}
