'use client'

/**
 * TanStack Query hooks for OKR links (LNK) and the CON-5 alignment walk.
 * Mutations refresh the link list and every connections entry (a link changes
 * both ends' chips and panels).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CONNECTIONS_STALE_TIME,
  connectionsQueryKey,
  fetchConnections,
  invalidateConnections,
} from '@/components/shared/connections'
import type { ConnectionsPayload } from '@/lib/connections/types'
import type { OkrLinkEntityType } from '@/types/package'
import { okrLinksApi } from '../services/api'
import type { CreateOkrLinkPayload } from '../types'
import { walkAlignment, type OkrRef } from '../utils'

export const okrLinkKeys = {
  all: ['okr-links'] as const,
  list: (type: OkrLinkEntityType, id: string) => ['okr-links', 'list', type, id] as const,
  targets: (kind: string, params: Record<string, unknown>) => ['okr-links', 'targets', kind, params] as const,
}

export function useOkrLinks(type: OkrLinkEntityType, id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: okrLinkKeys.list(type, id),
    queryFn: ({ signal }) => okrLinksApi.list(type, id, signal),
    enabled: (options.enabled ?? true) && !!id,
    staleTime: 15_000,
  })
}

function useInvalidateLinks() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: okrLinkKeys.all }),
      invalidateConnections(queryClient),
      // LNK-2 / LNK-4 may change rolledFromId or parentObjectiveId on the FROM item.
      queryClient.invalidateQueries({ queryKey: ['okr-options'] }),
    ])
}

export function useCreateOkrLink(options: { onSuccess?: () => void } = {}) {
  const invalidate = useInvalidateLinks()
  return useMutation({
    mutationFn: (payload: CreateOkrLinkPayload) => okrLinksApi.create(payload),
    onSuccess: async () => {
      toast.success('Link added')
      await invalidate()
      options.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add the link')
    },
  })
}

export function useDeleteOkrLink(options: { onSuccess?: () => void } = {}) {
  const invalidate = useInvalidateLinks()
  return useMutation({
    mutationFn: (linkId: string) => okrLinksApi.remove(linkId),
    onSuccess: async () => {
      toast.success('Link removed')
      await invalidate()
      options.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove the link')
    },
  })
}

/** Server-side target search for LinkManagerModal. */
export function useLinkTargetSearch(params: {
  targetType: OkrLinkEntityType
  timeframeId?: string | null
  q: string
  enabled?: boolean
}) {
  const { targetType, timeframeId, q, enabled = true } = params
  const trimmed = q.trim()
  const isObjective = targetType === 'OBJECTIVE'
  return useQuery({
    queryKey: okrLinkKeys.targets(targetType, { timeframeId: timeframeId ?? null, q: trimmed }),
    queryFn: ({ signal }) =>
      isObjective
        ? okrLinksApi.searchObjectives({ timeframeId: timeframeId as string, q: trimmed }, signal)
        : okrLinksApi.searchKeyResults({ q: trimmed }, signal),
    // Objectives need a timeframe (alignment-search requires it); KRs need a query
    // (the KR list is not timeframe-scoped, so an empty search is meaningless).
    enabled: enabled && (isObjective ? !!timeframeId : trimmed.length >= 2),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

/**
 * CON-5: climbs the alignment chain one `GET /api/connections` at a time (each
 * step shares the cache with the chips and panels of that item).
 */
export function useAlignmentChain(subject: OkrRef, options: { maxDepth?: number; enabled?: boolean } = {}) {
  const { maxDepth = 6, enabled = true } = options
  const subjectKey = `${subject.type}:${subject.id}`
  const [chain, setChain] = useState<{ key: string; refs: OkrRef[] }>({ key: subjectKey, refs: [subject] })
  // A new subject restarts the walk (derived, so there is no stale frame).
  const refs = chain.key === subjectKey ? chain.refs : [subject]

  const results = useQueries({
    queries: refs.map((r) => ({
      queryKey: connectionsQueryKey(r.type, r.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchConnections(r.type, r.id, signal),
      staleTime: CONNECTIONS_STALE_TIME,
      enabled,
      retry: false,
    })),
  })

  const payloads: Array<ConnectionsPayload | null | undefined> = results.map((r) =>
    r.data ?? (r.isError ? null : undefined),
  )
  // Cheap pure walk over at most `maxDepth` payloads — recomputed every render.
  const walk = walkAlignment(subject, payloads, maxDepth)

  const nextKey = walk.next ? `${walk.next.type}:${walk.next.id}` : null
  useEffect(() => {
    if (!walk.next || !enabled) return
    const next = walk.next
    if (refs.some((r) => r.type === next.type && r.id === next.id)) return
    setChain({ key: subjectKey, refs: [...refs, next] })
    // Keyed on the next step; `refs` / `walk` are derived from the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey, subjectKey, enabled])

  return {
    subject: (payloads[0] ?? null) as ConnectionsPayload | null,
    ancestors: walk.ancestors,
    complete: walk.complete,
    isLoading: results[0]?.isLoading ?? false,
    isError: results[0]?.isError ?? false,
  }
}
