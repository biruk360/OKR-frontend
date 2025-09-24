'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2 } from 'lucide-react'
import DeleteObjectiveModal from './DeleteObjectiveModal'

interface DeleteObjectiveButtonProps {
  objective: any
  className?: string
}

export default function DeleteObjectiveButton({ objective, className = '' }: DeleteObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Only admins can delete objectives
  const canDelete = session?.user && session.user.role === 'ADMIN'

  if (!canDelete) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded ${className}`}
        title="Delete objective permanently"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <DeleteObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        objective={objective}
      />
    </>
  )
}






