'use client'

import { LETTER_STATUS_LABEL, type LetterStatus } from '@/types'
import { cn } from '@/lib/utils'

const TONE: Record<LetterStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  SENT: 'bg-blue-50 text-blue-800 border-blue-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
}

export default function LetterStatusBadge({ status, className }: { status: LetterStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        TONE[status],
        className
      )}
    >
      {LETTER_STATUS_LABEL[status]}
    </span>
  )
}
