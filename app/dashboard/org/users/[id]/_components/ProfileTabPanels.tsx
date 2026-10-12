'use client'

/**
 * Client compositions for the employee profile tabs (PRF-1). Each vertical owns
 * its tab component and data (profile composition contract); this file only
 * wires them together — features never import each other, so the route does.
 *
 * The package review controls (PKG-2) are injected through each tab's
 * `renderItemActions` slot. The package id comes from the shared
 * `useOperatingPackage` query (one request per person + timeframe, cached).
 */
import { useCallback } from 'react'
import { DecisionsProfileTab } from '@/features/decisions'
import { DependenciesProfileTab } from '@/features/dependencies'
import { DevelopmentProfileTab } from '@/features/development-plan'
import { DutiesProfileTab } from '@/features/duties'
import { OkrProfileTab, type OkrProfileItemRef } from '@/features/employee-profile'
import { KpisProfileTab } from '@/features/kpis'
import { PackageHeaderCard, PackageReviewControls, useOperatingPackage } from '@/features/operating-package'
import { RoleDefinitionProfileTab, RoleDefinitionSidebarCard, type RoleDefinitionProfileSummary } from '@/features/role-definition'
import { PersonDependencyGraph } from '@/components/shared/dependency-graph'

export interface ProfileTabPanelProps {
  userId: string
  timeframeId: string
}

/** The person's package id for the timeframe, or null (no package / no access). */
function usePackageId(userId: string, timeframeId: string, enabled = true): string | null {
  const query = useOperatingPackage(userId, timeframeId, { enabled })
  return query.data?.package?.id ?? null
}

export function ProfileOkrsPanel({ userId, timeframeId }: ProfileTabPanelProps) {
  const packageId = usePackageId(userId, timeframeId)
  // Stable per packageId so the tree's action memo does not churn every render.
  const renderItemActions = useCallback(
    (item: OkrProfileItemRef) =>
      packageId ? <PackageReviewControls packageId={packageId} entityType={item.entityType} entityId={item.id} compact /> : null,
    [packageId],
  )
  return <OkrProfileTab userId={userId} timeframeId={timeframeId} renderItemActions={renderItemActions} />
}

/** Role & duties: the role definition (ROL) above the recurring duties (DUT). */
export function ProfileRolePanel({
  userId,
  timeframeId,
  showRole,
  showDuties,
}: ProfileTabPanelProps & { showRole: boolean; showDuties: boolean }) {
  const packageId = usePackageId(userId, timeframeId, showDuties)
  return (
    <div className="space-y-6">
      {showRole ? (
        <RoleDefinitionProfileTab
          userId={userId}
          timeframeId={timeframeId}
          renderItemActions={(item, definition) =>
            definition.packageId ? (
              <PackageReviewControls packageId={definition.packageId} entityType="ROLE_ITEM" entityId={item.id} compact />
            ) : null
          }
        />
      ) : null}
      {showDuties ? (
        <DutiesProfileTab
          userId={userId}
          timeframeId={timeframeId}
          renderItemActions={(duty) =>
            packageId ? <PackageReviewControls packageId={packageId} entityType="DUTY" entityId={duty.id} compact /> : null
          }
        />
      ) : null}
    </div>
  )
}

export function ProfileKpisPanel({ userId, timeframeId }: ProfileTabPanelProps) {
  const packageId = usePackageId(userId, timeframeId)
  return (
    <KpisProfileTab
      userId={userId}
      timeframeId={timeframeId}
      renderItemActions={(kpi) =>
        packageId ? <PackageReviewControls packageId={packageId} entityType="KPI" entityId={kpi.id} compact /> : null
      }
    />
  )
}

export function ProfileDevelopmentPanel({ userId, timeframeId }: ProfileTabPanelProps) {
  const packageId = usePackageId(userId, timeframeId)
  return (
    <DevelopmentProfileTab
      userId={userId}
      timeframeId={timeframeId}
      renderItemActions={(item) =>
        packageId ? <PackageReviewControls packageId={packageId} entityType="DEVELOPMENT" entityId={item.id} compact /> : null
      }
    />
  )
}

/** Links & dependencies: inbound / outbound list with a List / Graph toggle (CON-4). */
export function ProfileLinksPanel({ userId, timeframeId }: ProfileTabPanelProps) {
  const packageId = usePackageId(userId, timeframeId)
  return (
    <DependenciesProfileTab
      userId={userId}
      timeframeId={timeframeId}
      graphSlot={<PersonDependencyGraph userId={userId} timeframeId={timeframeId} />}
      renderItemActions={(row) =>
        packageId ? <PackageReviewControls packageId={packageId} entityType="DEPENDENCY" entityId={row.id} compact /> : null
      }
    />
  )
}

export function ProfileDecisionsPanel({ userId, timeframeId }: ProfileTabPanelProps) {
  return <DecisionsProfileTab userId={userId} timeframeId={timeframeId} />
}

/** Overview: the operating package header (PKG-1…5). */
export function ProfilePackageHeader({ userId, timeframeId }: ProfileTabPanelProps) {
  return <PackageHeaderCard userId={userId} timeframeId={timeframeId} />
}

/** Sidebar role definition (PRF-4), rendered from the server-built summary. */
export function ProfileRoleSidebarCard({
  userId,
  timeframeId,
  summary,
}: ProfileTabPanelProps & { summary: RoleDefinitionProfileSummary | null }) {
  return <RoleDefinitionSidebarCard userId={userId} timeframeId={timeframeId} summary={summary} />
}
