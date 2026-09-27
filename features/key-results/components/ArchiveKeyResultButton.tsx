'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Archive } from 'lucide-react'
import ArchiveKeyResultModal from './ArchiveKeyResultModal'

interface ArchiveKeyResultButtonProps {
  keyResult: any
  className?: string
  canArchive: boolean
  onArchived?: () => void
}

export default function ArchiveKeyResultButton({
  keyResult,
  className = '',
  canArchive,
  onArchived,
}: ArchiveKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canArchive || keyResult.status === 'ARCHIVED') {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-warning-600 hover:text-warning-700 hover:bg-warning-50 rounded ${className}`}
        title="Archive key result"
        aria-label="Archive key result"
      >
        <Archive className="h-4 w-4" />
      </button>

      <ArchiveKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
        onArchived={onArchived}
      />
    </>
  )
}






