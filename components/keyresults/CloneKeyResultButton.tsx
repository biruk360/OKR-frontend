'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Copy } from 'lucide-react'
import CloneKeyResultModal from './CloneKeyResultModal'

interface CloneKeyResultButtonProps {
  keyResult: any
  users: any[]
  className?: string
  canClone: boolean
  onCloned?: () => void
}

export default function CloneKeyResultButton({
  keyResult,
  users,
  className = '',
  canClone,
  onCloned,
}: CloneKeyResultButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  if (!session?.user || !canClone) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title="Clone key result"
      >
        <Copy className="h-4 w-4" />
      </button>

      <CloneKeyResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        keyResult={keyResult}
        users={users}
        onSuccess={onCloned}
      />
    </>
  )
}






