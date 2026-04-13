'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface DeleteTeamModalProps {
  isOpen: boolean
  onClose: () => void
  team: any
  onTeamDeleted: () => void
}

export default function DeleteTeamModal({ isOpen, onClose, team, onTeamDeleted }: DeleteTeamModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!team) return null

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/departments/${team.id}`, { method: 'DELETE' })
      const result = await response.json()

      if (response.ok) {
        toast.success('Team deleted successfully')
        onClose()
        onTeamDeleted()
      } else {
        toast.error(result.error || 'Failed to delete team')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const membershipCount = team._count?.memberships ?? 0
  const objectiveCount = team._count?.objectives ?? 0

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={onClose}
      onConfirm={handleDelete}
      title="Delete Team"
      icon={AlertTriangle}
      message={`Are you sure you want to delete the team "${team.name}"? This action cannot be undone.`}
      variant="danger"
      confirmLabel="Delete Team"
      loadingLabel="Deleting..."
      isLoading={isLoading}
      extraContent={
        <>
          {membershipCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-2">
              <p className="text-sm text-yellow-800">
                This team has {membershipCount} member(s). They will be removed from this team.
              </p>
            </div>
          )}
          {objectiveCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                This team has {objectiveCount} objective(s) associated with it.
              </p>
            </div>
          )}
        </>
      }
    />
  )
}
