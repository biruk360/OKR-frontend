'use client'

import { useQuery } from '@tanstack/react-query'
import type { UserRole } from '@/types'

export interface UserForSelection {
  id: string
  name: string | null
  email: string
  role: UserRole
}

interface ApiResponse {
  success: boolean
  data?: UserForSelection[]
  error?: string
}

async function fetchUsersForSelection(): Promise<UserForSelection[]> {
  const res = await fetch('/api/users/for-selection')
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`)
  const json: ApiResponse = await res.json()
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to load users')
  }
  return json.data
}

export const usersForSelectionQueryKey = ['users', 'for-selection'] as const

/**
 * Fetch the list of active users for use in owner/assignee dropdowns.
 * Cached via React Query — one network request is shared across all consumers.
 */
export function useUsersForSelection(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: usersForSelectionQueryKey,
    queryFn: fetchUsersForSelection,
    enabled: options?.enabled,
  })

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
