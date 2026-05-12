'use client'

import { LETTER_STATUS_LABEL, type LetterStatus } from '@/types'
import { cn } from '@/lib/utils'

// Uses the app-wide ap-status-pill class so the tone follows
// the design-system tokens (light + dark).
// Map letter workflow stage to the platform's status-pill tone vocabulary.
const TONE: Record<LetterStatus, string> = {
  DRAFT: 'none',
  SUBMITTED: 'atrisk', // amber — awaiting action
  APPROVED: 'ontrack', // green — ready
  SENT: 'ahead', // blue — completed
  ARCHIVED: 'none',
}

export default function LetterStatusBadge({ status, className }: { status: LetterStatus; className?: string }) {
  return (
    <span className={cn('ap-status-pill', className)} data-tone={TONE[status]}>
      {LETTER_STATUS_LABEL[status]}
    </span>
  )
}
