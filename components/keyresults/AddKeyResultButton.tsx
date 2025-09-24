'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Target } from 'lucide-react'
import AddKeyResultModal from './AddKeyResultModal'

interface AddKeyResultButtonProps {
  objective: any
  users: any[]
  className?: string
}

export default function AddKeyResultButton({ objective, users, className = '' }: AddKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can add key results (objective owner or admin)
  const canAddKeyResult = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === objective.ownerId
  )

  if (!canAddKeyResult) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${className}`}
      >
        <Plus className="h-4 w-4 mr-2" />
        <Target className="h-4 w-4 mr-1" />
        Add Key Result
      </button>

      <AddKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        objectiveId={objective.id}
        users={users}
        defaultOwnerId={session?.user?.id}
      />
    </>
  )
}






