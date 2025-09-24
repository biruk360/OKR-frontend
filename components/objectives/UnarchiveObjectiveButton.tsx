'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ArchiveRestore } from 'lucide-react'
import toast from 'react-hot-toast'

interface UnarchiveObjectiveButtonProps {
  objective: any
  className?: string
}

export default function UnarchiveObjectiveButton({ objective, className = '' }: UnarchiveObjectiveButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()

  // Check if user can unarchive this objective
  const canUnarchive = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.role === 'EXECUTIVE' ||
    session.user.id === objective.ownerId
  )

  if (!canUnarchive || objective.status !== 'ARCHIVED') {
    return null
  }

  const handleUnarchive = async () => {
    if (!confirm('Are you sure you want to unarchive this objective?')) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/objectives/${objective.id}/unarchive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective unarchived successfully.')
        window.location.reload()
      } else {
        toast.error(result.error || 'Failed to unarchive objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleUnarchive}
      disabled={isLoading}
      className={`inline-flex items-center px-2 py-1 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded ${className}`}
      title="Unarchive objective"
    >
      <ArchiveRestore className="h-4 w-4" />
    </button>
  )
}





