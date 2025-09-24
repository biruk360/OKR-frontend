'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Archive } from 'lucide-react'
import toast from 'react-hot-toast'

interface ArchiveObjectiveButtonProps {
  objective: any
  className?: string
}

export default function ArchiveObjectiveButton({ objective, className = '' }: ArchiveObjectiveButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()

  // Check if user can archive this objective
  const canArchive = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.role === 'EXECUTIVE' ||
    session.user.id === objective.ownerId
  )

  if (!canArchive || objective.status === 'ARCHIVED') {
    return null
  }

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this objective? This will also archive all associated key results and todos.')) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/objectives/${objective.id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective archived successfully.')
        window.location.reload()
      } else {
        toast.error(result.error || 'Failed to archive objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleArchive}
      disabled={isLoading}
      className={`inline-flex items-center px-2 py-1 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded ${className}`}
      title="Archive objective"
    >
      <Archive className="h-4 w-4" />
    </button>
  )
}





