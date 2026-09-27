'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ArchiveRestore } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'
import { conservativeObjectivePermissions } from '../services/objective-permission-flags'

interface UnarchiveObjectiveButtonProps {
  objective: any
  className?: string
  /** Server-computed canEditObjective (the unarchive route's rule). */
  canUnarchive?: boolean
}

export default function UnarchiveObjectiveButton({ objective, className = '', canUnarchive: canUnarchiveProp }: UnarchiveObjectiveButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()

  const canUnarchive = canUnarchiveProp ?? conservativeObjectivePermissions(session?.user, objective).canEdit

  if (!canUnarchive || objective.status !== 'ARCHIVED') {
    return null
  }

  const handleUnarchive = async () => {
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
        setIsOpen(false)
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
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isLoading}
        className={`inline-flex items-center px-2 py-1 text-sm text-success-700 hover:text-success-700 hover:bg-success-50 rounded ${className}`}
        title="Unarchive objective"
        aria-label="Unarchive objective"
      >
        <ArchiveRestore className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleUnarchive}
        title="Unarchive Objective"
        message="Are you sure you want to unarchive this objective?"
        variant="info"
        icon={ArchiveRestore}
        confirmLabel="Unarchive"
        loadingLabel="Unarchiving..."
        isLoading={isLoading}
      />
    </>
  )
}
