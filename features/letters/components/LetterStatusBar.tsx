'use client'

import { LETTER_STATUS_LABEL, type LetterStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const STAGES: LetterStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED']

export default function LetterStatusBar({ status }: { status: LetterStatus }) {
  const currentIndex = STAGES.indexOf(status)
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={stage} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium',
                active && 'border-primary-300 bg-primary-50 text-primary-800',
                done && 'border-success-200 bg-success-50 text-success-700',
                !active && !done && 'border-border bg-surface-card text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-micro font-semibold',
                  done && 'bg-success-500 text-primary-foreground',
                  active && 'bg-primary-500 text-primary-foreground',
                  !active && !done && 'bg-surface-muted text-muted-foreground'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {LETTER_STATUS_LABEL[stage]}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-4 bg-surface-muted" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
