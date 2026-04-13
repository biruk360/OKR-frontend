'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Copy } from 'lucide-react'
import CloneObjectiveModal from './CloneObjectiveModal'

interface CloneObjectiveButtonProps {
  objective: any
  timeframes: any[]
  className?: string
}

export default function CloneObjectiveButton({ objective, timeframes, className = '' }: CloneObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can create objectives (Department Lead, Executive, or Admin)
  const canClone = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.role === 'EXECUTIVE' || 
    session.user.role === 'DEPARTMENT_LEAD'
  )

  if (!canClone) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title="Clone objective"
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






