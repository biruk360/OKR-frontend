'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ClipboardCheck } from 'lucide-react'
import CreateCheckInModal from './CreateCheckInModal'

type TimeframeLike = {
  startDate: string | Date
  endDate: string | Date
  name?: string
} | null

interface CreateCheckInButtonProps {
  keyResult: any
  objective: {
    id: string
    timeframe?: TimeframeLike
  }
  className?: string
  canEdit: boolean
  onSaved?: () => void
}

export default function CreateCheckInButton({
  keyResult,
  objective,
  className = '',
  canEdit,
  onSaved,
}: CreateCheckInButtonProps) {
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canEdit || keyResult?.status !== 'ACTIVE') {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded ${className}`}
        title="Create check-in"
      >
        <ClipboardCheck className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Check-in</span>
      </button>

      <CreateCheckInModal
        isOpen={open}
        onClose={() => setOpen(false)}
        keyResult={keyResult}
        objectiveTimeframe={objective?.timeframe ?? null}
        onSuccess={() => {
          onSaved?.()
        }}
      />
    </>
  )
}
