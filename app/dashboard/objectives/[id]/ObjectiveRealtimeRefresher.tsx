'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { connectionsQueryKey } from '@/components/shared/connections'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { OKR_REALTIME_EVENT_NAMES, objectiveRealtimeChannel } from '@/lib/okr/realtime'

/**
 * Live refresh for the (server-rendered) objective detail page. Subscribes to
 * `private-objective-<id>` — objective changes plus relayed key-result changes —
 * and re-runs the page's permission-checked server render via router.refresh().
 * The client-fetched connections (trail, lineage, panel) are refetched too.
 * Renders nothing. The page mounts it only for an unredacted view; the channel
 * auth route refuses redacted viewers anyway.
 */
export default function ObjectiveRealtimeRefresher({
  objectiveId,
  currentUserId,
}: {
  objectiveId: string
  currentUserId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const refresh = useCallback(() => {
    router.refresh()
    void queryClient.invalidateQueries({ queryKey: connectionsQueryKey('OBJECTIVE', objectiveId) })
  }, [router, queryClient, objectiveId])
  useRealtimeRefresh({
    channel: objectiveRealtimeChannel(objectiveId),
    events: OKR_REALTIME_EVENT_NAMES,
    onRefresh: refresh,
    ignoreActorId: currentUserId,
  })
  return null
}
