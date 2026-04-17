'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Target } from 'lucide-react'
import AddKeyResultModal from './AddKeyResultModal'

interface AddKeyResultButtonProps {
  objective: any
  users: any[]
  className?: string
  /** From GET /api/objectives/[id]/key-result-permissions — must match server POST rules */
  canCreate: boolean
  onCreated?: () => void
}

export default function AddKeyResultButton({
  objective,
  users,
  className = '',
  canCreate,
  onCreated,
}: AddKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canCreate) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring ${className}`}
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
        onSuccess={onCreated}
      />
    </>
  )
}






