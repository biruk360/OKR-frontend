import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  SUBMITTED: 'bg-amber-100 text-amber-800 border-amber-300',
  MANAGER_ENDORSED: 'bg-blue-50 text-blue-800 border-blue-300',
  UNDER_REVIEW: 'bg-blue-50 text-blue-800 border-blue-300',
  ADJUSTED: 'bg-purple-100 text-purple-800 border-purple-300',
  APPROVED: 'bg-teal-100 text-teal-800 border-teal-300',
  DRIVER_ASSIGNED: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 border-green-300',
  RECONCILED: 'bg-green-100 text-green-800 border-green-300',
  RETURNED: 'bg-orange-100 text-orange-800 border-orange-300',
  WITHDRAWN: 'bg-gray-100 text-gray-600 border-gray-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-300',
  EXPIRED: 'bg-red-100 text-red-700 border-red-300',
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
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700 border-gray-300'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', style, className)}>
      {label}
    </span>
  )
}
