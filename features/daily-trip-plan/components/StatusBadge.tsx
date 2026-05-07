import { cn } from '@/lib/utils'

/**
 * Apple-style status pill. Maps each DTP status to either a design-token
 * scale (primary/success/warning/danger) or a stable Tailwind palette
 * (purple/indigo) for the two states the spec colors that have no token
 * equivalent (ADJUSTED · DRIVER_ASSIGNED).
 */
const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground border-border',
  SUBMITTED: 'bg-warning-50 text-warning-700 border-warning-200',
  MANAGER_ENDORSED: 'bg-primary/10 text-primary-700 border-primary-200',
  UNDER_REVIEW: 'bg-primary/10 text-primary-700 border-primary-200',
  ADJUSTED: 'bg-purple-100 text-purple-800 border-purple-200',
  APPROVED: 'bg-success-50 text-success-700 border-success-200',
  DRIVER_ASSIGNED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  IN_PROGRESS: 'bg-primary/10 text-primary-700 border-primary-200',
  COMPLETED: 'bg-success-50 text-success-700 border-success-200',
  RECONCILED: 'bg-success-100 text-success-700 border-success-200',
  RETURNED: 'bg-warning-100 text-warning-800 border-warning-200',
  WITHDRAWN: 'bg-muted text-muted-foreground border-border',
  CANCELLED: 'bg-danger-50 text-danger-700 border-danger-200',
  EXPIRED: 'bg-danger-50 text-danger-700 border-danger-200',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  MANAGER_ENDORSED: 'Manager endorsed',
  UNDER_REVIEW: 'Under review',
  ADJUSTED: 'Adjusted — needs ack',
  APPROVED: 'Approved',
  DRIVER_ASSIGNED: 'Driver assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  RECONCILED: 'Reconciled',
  RETURNED: 'Returned for edit',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground border-border'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={cn('inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium', style, className)}>
      {label}
    </span>
  )
}
