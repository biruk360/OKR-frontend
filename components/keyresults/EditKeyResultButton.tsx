'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit } from 'lucide-react'
import EditKeyResultModal from './EditKeyResultModal'

interface EditKeyResultButtonProps {
  keyResult: any
  users: any[]
  className?: string
}

export default function EditKeyResultButton({ keyResult, users, className = '' }: EditKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can edit key results (key result owner, objective owner, or admin)
  const canEditKeyResult = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === keyResult.ownerId ||
    session.user.id === keyResult.objective?.ownerId
  )

  if (!canEditKeyResult) {
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
      />
    </>
  )
}






