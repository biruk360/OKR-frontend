'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'

export default function CreateObjectiveButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="btn-primary"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
