'use client'

import { useQuery } from '@tanstack/react-query'
import type { Timeframe } from '@prisma/client'

interface ApiResponse {
  success: boolean
  data?: Timeframe[]
  error?: string
}

async function fetchTimeframes(activeOnly: boolean): Promise<Timeframe[]> {
  const url = activeOnly ? '/api/timeframes?activeOnly=true' : '/api/timeframes'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load timeframes (${res.status})`)
  const json: ApiResponse = await res.json()
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to load timeframes')
  }
  return json.data
}

export const timeframesQueryKey = (activeOnly: boolean) =>
  ['timeframes', { activeOnly }] as const

/**
 * Fetch timeframes (quarters, months, etc.) for dropdown selection.
 * Cached via React Query — one network request is shared across all consumers.
 */
export function useTimeframes(options?: { activeOnly?: boolean; enabled?: boolean }) {
  const activeOnly = options?.activeOnly ?? false
  const query = useQuery({
    queryKey: timeframesQueryKey(activeOnly),
    queryFn: () => fetchTimeframes(activeOnly),
    enabled: options?.enabled,
  })

  return {
    timeframes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
