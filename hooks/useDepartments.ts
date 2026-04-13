'use client'

import { useQuery } from '@tanstack/react-query'
import type { Department } from '@prisma/client'

export interface DepartmentWithCounts extends Department {
  _count?: {
    memberships: number
    objectives: number
  }
}

interface ApiResponse {
  success: boolean
  data?: DepartmentWithCounts[]
  error?: string
}

async function fetchDepartments(): Promise<DepartmentWithCounts[]> {
  const res = await fetch('/api/departments')
  if (!res.ok) throw new Error(`Failed to load departments (${res.status})`)
  const json: ApiResponse = await res.json()
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to load departments')
  }
  return json.data
}

export const departmentsQueryKey = ['departments'] as const

/**
 * Fetch the list of departments with membership/objective counts.
 * Cached via React Query — one network request is shared across all consumers.
 */
export function useDepartments(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: departmentsQueryKey,
    queryFn: fetchDepartments,
    enabled: options?.enabled,
  })

  return {
    departments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
