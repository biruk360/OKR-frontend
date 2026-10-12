'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, CircleDashed, UserCheck } from 'lucide-react'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { ROLE_DEFINITION_STATUS_LABELS, type RoleDefinitionStatus } from '@/types/package'
import type { DirectReportSeat, ReportingLineCheck, RoleDefinitionPerson } from '../types'

const STATUS_TONE: Record<RoleDefinitionStatus, MiniBadgeTone> = {
  DRAFT: 'warn',
  APPROVED: 'ok',
  SUPERSEDED: 'neutral',
}

export function RoleDefinitionStatusBadge({ status, className }: { status: RoleDefinitionStatus; className?: string }) {
  return (
    <MiniBadge tone={STATUS_TONE[status]} className={className}>
      {ROLE_DEFINITION_STATUS_LABELS[status]}
    </MiniBadge>
  )
}

/** ROL-3: warning chip when the role definition's manager is not the org-chart manager. */
export function ReportingLineChip({ check, className }: { check: ReportingLineCheck; className?: string }) {
  if (check.state !== 'MISMATCH') return null
  const managers = check.orgChartManagers.map((m) => m.name).join(', ')
  const title = managers
    ? `Org chart: reports to ${managers}. The org chart is not changed automatically.`
    : 'Org chart has no manager for this person. The org chart is not changed automatically.'
  return (
    <MiniBadge tone="warn" title={title} className={cn('gap-1', className)}>
      <AlertTriangle className="size-3" aria-hidden />
      Reporting line differs from org chart
    </MiniBadge>
  )
}

export function PersonInline({ person, size = 20 }: { person: RoleDefinitionPerson; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar user={{ id: person.id, name: person.name, avatar: person.avatar }} size={size} tooltip={false} />
      <span className="truncate text-body-sm font-medium text-[var(--ap-fg)]">{person.name}</span>
    </span>
  )
}

/** ROL-4: planned direct-report seats, each Filled (with the person) or Vacant. */
export function DirectReportSeatList({
  seats,
  showFill = true,
  renderActions,
}: {
  seats: DirectReportSeat[]
  /** False for historical versions (fill state is only computed for the current one). */
  showFill?: boolean
  renderActions?: (itemId: string) => ReactNode
}) {
  return (
    <ul className="divide-y divide-[var(--ap-border)]">
      {seats.map((seat) => (
        <li key={seat.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-[var(--ap-fg)]">{seat.title}</p>
            {seat.plannedNote && <p className="text-caption text-[var(--ap-fg-subtle)]">Planned: {seat.plannedNote}</p>}
          </div>
          {showFill &&
            (seat.filledBy ? (
              <span className="inline-flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-[var(--ap-ok-fg)]" aria-hidden />
                <PersonInline person={seat.filledBy} />
              </span>
            ) : (
              <MiniBadge tone="neutral" className="gap-1" title="No direct report in the org chart holds this seat yet">
                <CircleDashed className="size-3" aria-hidden />
                Vacant
              </MiniBadge>
            ))}
          {renderActions?.(seat.itemId)}
        </li>
      ))}
    </ul>
  )
}
