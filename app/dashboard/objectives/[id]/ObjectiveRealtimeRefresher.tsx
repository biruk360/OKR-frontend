'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { OKR_REALTIME_EVENT_NAMES, objectiveRealtimeChannel } from '@/lib/okr/realtime'

/**
 * Live refresh for the (server-rendered) objective detail page. Subscribes to
 * `private-objective-<id>` — objective changes plus relayed key-result changes —
 * and re-runs the page's permission-checked server render via router.refresh().
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
  const refresh = useCallback(() => router.refresh(), [router])
  useRealtimeRefresh({
    channel: objectiveRealtimeChannel(objectiveId),
    events: OKR_REALTIME_EVENT_NAMES,
    onRefresh: refresh,
    ignoreActorId: currentUserId,
  })
  return null
}
