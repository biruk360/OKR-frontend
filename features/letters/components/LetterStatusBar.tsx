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
                active && 'border-blue-300 bg-blue-50 text-blue-800',
                done && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                !active && !done && 'border-gray-200 bg-white text-gray-500'
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold',
                  done && 'bg-emerald-500 text-white',
                  active && 'bg-blue-500 text-white',
                  !active && !done && 'bg-gray-200 text-gray-600'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {LETTER_STATUS_LABEL[stage]}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-4 bg-gray-200" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
