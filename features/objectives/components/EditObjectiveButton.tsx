'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit } from 'lucide-react'
import EditObjectiveModal from './EditObjectiveModal'
import { conservativeObjectivePermissions } from '../services/objective-permission-flags'

interface EditObjectiveButtonProps {
  objective: any
  className?: string
  /** Server-computed canEditObjective (lib/permissions). Falls back to a conservative client subset. */
  canEdit?: boolean
}

export default function EditObjectiveButton({ objective, className = '', canEdit: canEditProp }: EditObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  const canEdit = canEditProp ?? conservativeObjectivePermissions(session?.user, objective).canEdit

  if (!canEdit) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded ${className}`}
        title="Edit objective"
        aria-label="Edit objective"
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
