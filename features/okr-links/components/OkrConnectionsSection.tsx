'use client'

/**
 * OkrConnectionsSection — the CON-2 panel for an objective or key result with
 * link management wired in: "Manage links" (shown only when the API grants
 * `permissions.canManageLinks`) opens LinkManagerModal. Drop-in for the objective /
 * KR detail pages and quick-view rails (P4).
 */
import { useState } from 'react'
import { ConnectionsPanel, type ConnectionsPanelProps } from '@/components/shared/connections'
import type { OkrLinkEntityType, OkrLinkKind } from '@/types/package'
import { LinkManagerModal } from './LinkManagerModal'

export interface OkrConnectionsSectionProps
  extends Omit<ConnectionsPanelProps, 'entityType' | 'onManageLinks'> {
  entityType: OkrLinkEntityType
  entityTitle?: string | null
  /** The item's timeframe (locks "contributes to" targets to it). */
  timeframeId?: string | null
  defaultKind?: OkrLinkKind
  /** After a link is added or removed (connections are refreshed automatically). */
  onLinksChanged?: () => void
}

export function OkrConnectionsSection({
  entityType,
  entityId,
  entityTitle,
  timeframeId,
  defaultKind,
  onLinksChanged,
  ...panelProps
}: OkrConnectionsSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ConnectionsPanel {...panelProps} entityType={entityType} entityId={entityId} onManageLinks={() => setOpen(true)} />
      <LinkManagerModal
        open={open}
        onClose={() => setOpen(false)}
        entityType={entityType}
        entityId={entityId}
        entityTitle={entityTitle}
        timeframeId={timeframeId}
        defaultKind={defaultKind}
        onChanged={onLinksChanged}
      />
    </>
  )
}

export default OkrConnectionsSection
