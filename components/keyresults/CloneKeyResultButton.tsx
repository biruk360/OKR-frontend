'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Copy } from 'lucide-react'
import CloneKeyResultModal from './CloneKeyResultModal'

interface CloneKeyResultButtonProps {
  keyResult: any
  users: any[]
  className?: string
}

export default function CloneKeyResultButton({ keyResult, users, className = '' }: CloneKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can clone key results (objective owner or admin)
  const canCloneKeyResult = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === keyResult.objective?.ownerId
  )

  if (!canCloneKeyResult) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title="Clone key result"
      >
        <Copy className="h-4 w-4" />
      </button>

      <CloneKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
        users={users}
      />
    </>
  )
}






