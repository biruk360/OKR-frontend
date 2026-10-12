'use client'

/**
 * CON-2 connections section for the objective detail page: aligns to, supported
 * by, lineage, dependencies, decisions, duties … with "Manage links" (opens
 * LinkManagerModal, LNK-1…4) for viewers the API allows to manage links. After a
 * link change the server render is refreshed (parent / child lists live there).
 * Renders nothing for a redacted or not-visible objective (CON-8).
 */
import { useRouter } from 'next/navigation'
import { ConnectionsFetchError, useConnections } from '@/components/shared/connections'
import { OkrConnectionsSection } from '@/features/okr-links'

export default function ObjectiveConnectionsSection({
  objectiveId,
  title,
  timeframeId,
}: {
  objectiveId: string
  title: string
  timeframeId?: string | null
}) {
  const router = useRouter()
  const { data, error } = useConnections('OBJECTIVE', objectiveId)
  if (data?.subject.redacted) return null
  if (error instanceof ConnectionsFetchError && (error.status === 403 || error.status === 404)) return null

  return (
    <OkrConnectionsSection
      entityType="OBJECTIVE"
      entityId={objectiveId}
      entityTitle={title}
      timeframeId={timeframeId ?? null}
      variant="section"
      emptyText="Nothing is linked to this objective yet."
      onLinksChanged={() => router.refresh()}
    />
  )
}
