'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit } from 'lucide-react'
import EditKeyResultModal from './EditKeyResultModal'

interface EditKeyResultButtonProps {
  keyResult: any
  users: any[]
  className?: string
  canEdit: boolean
  onUpdated?: () => void
}

export default function EditKeyResultButton({
  keyResult,
  users,
  className = '',
  canEdit,
  onUpdated,
}: EditKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canEdit) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title="Edit key result"
      >
        <Edit className="h-4 w-4" />
      </button>

      <EditKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
        users={users}
        onSuccess={onUpdated}
      />
    </>
  )
}






