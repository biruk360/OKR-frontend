'use client'

import { useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'

export default function CreateCompanyObjectiveButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
      >
        <Plus className="h-4 w-4 mr-2" />
        <Building2 className="h-4 w-4 mr-2" />
        Add Company Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultLevel="COMPANY"
        title="Add Company Objective"
      />
    </>
  )
}

