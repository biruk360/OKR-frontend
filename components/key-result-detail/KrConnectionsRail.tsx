'use client'

/**
 * CON-2 connections panel for the KR detail rail, with link management
 * (LinkManagerModal behind "Manage links", shown only when the API grants
 * `permissions.canManageLinks`). "Lands in" (supportedBy, CON-7) and project
 * milestones (CON-3) have their own sections on the page, so they are left out
 * here. A redacted / not-visible KR renders nothing (CON-8).
 */
import { useRouter } from 'next/navigation'
import { ConnectionsFetchError, useConnections } from '@/components/shared/connections'
import { OkrConnectionsSection } from '@/features/okr-links'
import { KR_RAIL_CONNECTION_GROUPS } from './kr-connections'

export default function KrConnectionsRail({
  keyResultId,
  timeframeId,
}: {
  keyResultId: string
  timeframeId?: string | null
}) {
  const router = useRouter()
  const { data, error } = useConnections('KEY_RESULT', keyResultId)
  if (data?.subject.redacted) return null
  if (error instanceof ConnectionsFetchError && (error.status === 403 || error.status === 404)) return null

  const elsewhere = (data?.supportedBy.length ?? 0) + (data?.milestones.length ?? 0) > 0

  return (
    <OkrConnectionsSection
      entityType="KEY_RESULT"
      entityId={keyResultId}
      entityTitle={data?.subject.title ?? null}
      timeframeId={timeframeId ?? null}
      variant="section"
      groups={KR_RAIL_CONNECTION_GROUPS}
      emptyText={
        elsewhere
          ? 'No other links. Contributing items and milestones are listed on the page.'
          : 'Nothing is linked to this key result yet.'
      }
      onLinksChanged={() => router.refresh()}
    />
  )
}
