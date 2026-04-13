'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit } from 'lucide-react'
import EditObjectiveModal from './EditObjectiveModal'

interface EditObjectiveButtonProps {
  objective: any
  className?: string
}

export default function EditObjectiveButton({ objective, className = '' }: EditObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can edit this objective
  const canEdit = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.role === 'EXECUTIVE' ||
    session.user.id === objective.ownerId
  )

  if (!canEdit) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title="Edit objective"
      >
        <Edit className="h-4 w-4" />
      </button>

      <EditObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        objective={objective}
      />
    </>
  )
}





