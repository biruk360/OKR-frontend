'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2 } from 'lucide-react'
import DeleteObjectiveModal from './DeleteObjectiveModal'
import { conservativeObjectivePermissions } from '../services/objective-permission-flags'

interface DeleteObjectiveButtonProps {
  objective: any
  className?: string
  /** Server-computed delete permission (ADMIN, EXECUTIVE or owner — DELETE /api/objectives/[id]). */
  canDelete?: boolean
}

export default function DeleteObjectiveButton({ objective, className = '', canDelete: canDeleteProp }: DeleteObjectiveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  const canDelete = canDeleteProp ?? conservativeObjectivePermissions(session?.user, objective).canDelete

  if (!canDelete) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-danger-600 hover:text-danger-700 hover:bg-danger-50 rounded ${className}`}
        title="Delete objective permanently"
        aria-label="Delete objective permanently"
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
