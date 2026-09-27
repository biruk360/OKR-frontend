'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2 } from 'lucide-react'
import DeleteKeyResultModal from './DeleteKeyResultModal'

interface DeleteKeyResultButtonProps {
  keyResult: any
  className?: string
  canDelete: boolean
  onDeleted?: () => void
}

export default function DeleteKeyResultButton({
  keyResult,
  className = '',
  canDelete,
  onDeleted,
}: DeleteKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canDelete) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-danger-600 hover:text-danger-700 hover:bg-danger-50 rounded ${className}`}
        title="Delete key result permanently"
        aria-label="Delete key result permanently"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <DeleteKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
        onSuccess={onDeleted}
      />
    </>
  )
}






