'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { GenerateSprintModal } from './GenerateSprintModal'

interface Props {
  /** When omitted, defaults to the signed-in user (resolved client-side). */
  subjectUserId?: string
  variant?: 'primary' | 'subtle'
  className?: string
}

/**
 * The single entry point for AI sprint generation. Renders a button that opens
 * GenerateSprintModal when clicked. Hides itself when the org flag is off — the
 * modal queries the flag through /api/admin/org-settings on mount, but the
 * button stays visible because gating happens at submit time (the API returns
 * 404 if the flag is off, surfacing as an error toast).
 */
export function GenerateSprintButton({ subjectUserId, variant = 'primary', className }: Props) {
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
        <Sparkles className="h-3.5 w-3.5" /> Generate AI Sprint
      </button>
      {open && (
        <GenerateSprintModal
          open={open}
          onClose={() => setOpen(false)}
          subjectUserId={subjectUserId}
        />
      )}
    </>
  )
}
