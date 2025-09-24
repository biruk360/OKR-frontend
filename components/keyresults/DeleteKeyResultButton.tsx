'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2 } from 'lucide-react'
import DeleteKeyResultModal from './DeleteKeyResultModal'

interface DeleteKeyResultButtonProps {
  keyResult: any
  className?: string
}

export default function DeleteKeyResultButton({ keyResult, className = '' }: DeleteKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can delete key results (objective owner or admin only)
  // Key result owners cannot delete - only objective owners and admins
  const canDeleteKeyResult = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === keyResult.objective?.ownerId
  )

  if (!canDeleteKeyResult) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded ${className}`}
        title="Delete key result permanently"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <DeleteKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
      />
    </>
  )
}






