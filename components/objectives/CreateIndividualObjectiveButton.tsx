'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, User } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'

interface CreateIndividualObjectiveButtonProps {
  onObjectiveCreated?: () => void
  userDepartments?: any[]
}

export default function CreateIndividualObjectiveButton({ onObjectiveCreated, userDepartments = [] }: CreateIndividualObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
      >
        <Plus className="h-4 w-4 mr-2" />
        <User className="h-4 w-4 mr-2" />
        Add My Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add My Objective"
        onObjectiveCreated={onObjectiveCreated}
        userDepartments={userDepartments}
      />
    </>
  )
}
