'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Archive } from 'lucide-react'
import ArchiveKeyResultModal from './ArchiveKeyResultModal'

interface ArchiveKeyResultButtonProps {
  keyResult: any
  className?: string
}

export default function ArchiveKeyResultButton({ keyResult, className = '' }: ArchiveKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can archive this key result
  const canArchive = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === keyResult.ownerId ||
    session.user.id === keyResult.objective?.ownerId
  )

  // Don't show archive button for already archived key results
  if (!canArchive || keyResult.status === 'ARCHIVED') {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded ${className}`}
        title="Archive key result"
      >
        <Archive className="h-4 w-4" />
      </button>

      <ArchiveKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
      />
    </>
  )
}






