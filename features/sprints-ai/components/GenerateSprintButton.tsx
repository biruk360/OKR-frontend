'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { GenerateSprintModal } from './GenerateSprintModal'

interface Props {
  /** The team sprint to attach AI-proposed todos to. Required — the trigger only */
  /** makes sense from inside a sprint board. */
  sprintId: string
  /** When omitted, defaults to the signed-in user. Leads/admins can override in the modal. */
  subjectUserId?: string
  variant?: 'primary' | 'subtle'
  className?: string
}

/**
 * Trigger for AI task generation inside an existing team sprint. Opens
 * GenerateSprintModal scoped to one subject user; on accept, the proposed todos
 * land in the sprint's PENDING column. Lives in the sprint board header.
 */
export function GenerateSprintButton({ sprintId, subjectUserId, variant = 'primary', className }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'primary'
            ? `inline-flex items-center gap-1.5 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white ${className ?? ''}`
            : `inline-flex items-center gap-1.5 rounded-[10px] h-8 px-3 text-[12px] font-semibold ${className ?? ''}`
        }
        style={
          variant === 'primary'
            ? { background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }
            : { borderWidth: 1, borderColor: 'var(--ap-border)' }
        }
      >
        <Sparkles className="h-3.5 w-3.5" /> Generate AI tasks
      </button>
      {open && (
        <GenerateSprintModal
          open={open}
          onClose={() => setOpen(false)}
          sprintId={sprintId}
          subjectUserId={subjectUserId}
        />
      )}
    </>
  )
}
