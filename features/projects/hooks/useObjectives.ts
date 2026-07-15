'use client'

import { useQuery } from '@tanstack/react-query'
import { projectKeys } from './useProjects'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return json.data as T
}

export interface ObjectiveForLink {
  id: string
  title: string
  level: string
  progress: number
}

export interface ObjectivesListResponse {
  items: ObjectiveForLink[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

export function useObjectivesForLink(enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.all, 'objectives-for-link'],
    queryFn: async () => {
      const data = await fetchJson<ObjectivesListResponse>('/api/objectives?status=ACTIVE&limit=500')
      return data.items
    },
    enabled,
    staleTime: 60_000,
  })
}

export interface KeyResultForLink {
  id: string
  title: string
  progress: number
  unit: string
  status: string
}

export function useKeyResultsForLink(objectiveId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.all, 'objective-key-results', objectiveId],
    queryFn: async () => {
      if (!objectiveId) return []
      const objective = await fetchJson<{ keyResults: KeyResultForLink[] }>(`/api/objectives/${objectiveId}`)
      return objective.keyResults.filter((kr) => kr.status === 'ACTIVE')
    },
    enabled: !!objectiveId && enabled,
    staleTime: 60_000,
  })
}

export interface DeliveryProjectNode {
  id: string
  code: string
  name: string
  clientName: string
  status: string
  ragStatus: string
  percentComplete: number
  percentPlanned: number
  spi: number | null
  cpi: number | null
  contractValue: number | null
  projectManagerName: string | null
}

export function useObjectiveDelivery(objectiveId: string, enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.all, 'objective-delivery', objectiveId],
    queryFn: () => fetchJson<DeliveryProjectNode[]>(`/api/objectives/${objectiveId}/delivery`),
    enabled: !!objectiveId && enabled,
    staleTime: 30_000,
  })
}
