'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Copy } from 'lucide-react'
import CloneObjectiveModal from './CloneObjectiveModal'
import { conservativeObjectivePermissions } from '../services/objective-permission-flags'

interface CloneObjectiveButtonProps {
  objective: any
  timeframes: any[]
  className?: string
  /** Server-computed clone permission. Falls back to the clone route's role rule. */
  canClone?: boolean
}

export default function CloneObjectiveButton({ objective, timeframes, className = '', canClone: canCloneProp }: CloneObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  const canClone = canCloneProp ?? conservativeObjectivePermissions(session?.user, objective).canClone

  if (!canClone) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded ${className}`}
        title="Clone objective"
        aria-label="Clone objective"
      >
        <Copy className="h-4 w-4" />
      </button>

      <CloneObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        objective={objective}
        timeframes={timeframes}
      />
    </>
  )
}
