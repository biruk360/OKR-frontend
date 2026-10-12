'use client'

/**
 * useConnections — TanStack Query hook for `GET /api/connections?type=&id=` (F4,
 * lib/connections/service.ts). One request feeds the CON-1 chips, the CON-2
 * panel, the CON-5 alignment trail and the CON-6 lineage popover, so every
 * surface shares one cache entry per item.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { ConnectionEntityType, ConnectionsPayload } from '@/lib/connections/types'

export const CONNECTIONS_QUERY_ROOT = ['connections'] as const

export const connectionsQueryKey = (type: ConnectionEntityType, id: string) =>
  [...CONNECTIONS_QUERY_ROOT, type, id] as const

/** Thrown for non-2xx answers; `status` lets callers treat 404 (not visible) quietly. */
export class ConnectionsFetchError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ConnectionsFetchError'
  }
}

export async function fetchConnections(
  type: ConnectionEntityType,
  id: string,
  signal?: AbortSignal,
): Promise<ConnectionsPayload> {
  const qs = new URLSearchParams({ type, id })
  const res = await fetch(`/api/connections?${qs}`, { signal })
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: ConnectionsPayload; error?: string } | null
  if (!res.ok || !json?.success || !json.data) {
    throw new ConnectionsFetchError(res.status, json?.error || 'Could not load connections.')
  }
  return json.data
}

export const CONNECTIONS_STALE_TIME = 30_000

export interface UseConnectionsOptions {
  enabled?: boolean
  /** Payload already loaded by the caller (e.g. a batched tree) — skips the request. */
  initialData?: ConnectionsPayload
}

export function useConnections(
  type: ConnectionEntityType | null | undefined,
  id: string | null | undefined,
  options: UseConnectionsOptions = {},
) {
  const { enabled = true, initialData } = options
  return useQuery({
    queryKey: connectionsQueryKey((type ?? 'OBJECTIVE') as ConnectionEntityType, id ?? ''),
    queryFn: ({ signal }) => fetchConnections(type as ConnectionEntityType, id as string, signal),
    enabled: enabled && !!type && !!id,
    initialData,
    staleTime: CONNECTIONS_STALE_TIME,
    // 404 = the item is gone or not visible; retrying will not change that.
    retry: (failureCount, error) =>
      !(error instanceof ConnectionsFetchError && (error.status === 404 || error.status === 403)) && failureCount < 2,
  })
}

/** Refresh every connections entry (links touch both ends, so invalidate broadly). */
export function invalidateConnections(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_ROOT })
}
