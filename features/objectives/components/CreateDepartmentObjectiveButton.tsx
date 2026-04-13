'use client'

import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'

export default function CreateDepartmentObjectiveButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        <Plus className="h-4 w-4 mr-2" />
        <Users className="h-4 w-4 mr-2" />
        Add Department Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultLevel="DEPARTMENT"
        title="Add Department Objective"
      />
    </>
  )
}

