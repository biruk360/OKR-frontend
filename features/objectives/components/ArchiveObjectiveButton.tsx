'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface ArchiveObjectiveButtonProps {
  objective: any
  className?: string
}

export default function ArchiveObjectiveButton({ objective, className = '' }: ArchiveObjectiveButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()

  const canArchive = session?.user && (
    session.user.role === 'ADMIN' ||
    session.user.role === 'EXECUTIVE' ||
    session.user.id === objective.ownerId
  )

  if (!canArchive || objective.status === 'ARCHIVED') {
    return null
  }

  const handleArchive = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/objectives/${objective.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective archived successfully.')
        setIsOpen(false)
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
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded ${className}`}
        title="Archive objective"
      >
        <Archive className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleArchive}
        title="Archive Objective"
        message="Are you sure you want to archive this objective?"
        description="This will also archive all associated key results and todos. You can restore them later if needed."
        variant="warning"
        confirmLabel="Archive Objective"
        loadingLabel="Archiving..."
        isLoading={isLoading}
        details={
          <>
            <h4 className="text-sm font-medium text-foreground mb-2">Objective:</h4>
            <p className="text-sm text-muted-foreground font-medium">{objective.title}</p>
            {objective.level && (
              <p className="text-xs text-muted-foreground mt-1">
                {objective.level} • Owner: {objective.owner?.name || 'Unknown'}
              </p>
            )}
          </>
        }
      />
    </>
  )
}
