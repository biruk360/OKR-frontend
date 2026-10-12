'use client'

/**
 * DependencyStatusBadge — status pill for a work dependency, plus the DEP-2
 * timing pill (Late / Due soon) when the row is open. Tones come from the
 * shared MiniBadge (ok / warn / danger / accent tokens, no colour literals).
 */
import { AlertTriangle, Clock } from 'lucide-react'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { cn } from '@/lib/utils'
import { DEPENDENCY_STATUS_LABELS, type DependencyStatus } from '@/types/package'

const STATUS_TONE: Record<DependencyStatus, MiniBadgeTone> = {
  OPEN: 'neutral',
  IN_PROGRESS: 'accent',
  DONE: 'ok',
  BLOCKED: 'danger',
  DROPPED: 'neutral',
}

export interface DependencyStatusBadgeProps {
  status: DependencyStatus
  /** DEP-2 flags; shown only while the dependency is open. */
  late?: boolean
  dueSoon?: boolean
  /** Hide the timing pill (e.g. in a column already grouped by timing). */
  hideTiming?: boolean
  className?: string
}

export function DependencyStatusBadge({ status, late, dueSoon, hideTiming, className }: DependencyStatusBadgeProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <MiniBadge tone={STATUS_TONE[status]} className={cn(status === 'DROPPED' && 'line-through')}>
        {DEPENDENCY_STATUS_LABELS[status]}
      </MiniBadge>
      {!hideTiming && late && (
        <MiniBadge tone="danger" title="Past its needed-by date and not done">
          <AlertTriangle className="mr-1 size-3" aria-hidden />
          Late
        </MiniBadge>
      )}
      {!hideTiming && !late && dueSoon && (
        <MiniBadge tone="warn" title="Needed within the next 7 days">
          <Clock className="mr-1 size-3" aria-hidden />
          Due soon
        </MiniBadge>
      )}
    </span>
  )
}
