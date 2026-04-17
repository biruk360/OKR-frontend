'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface DeleteObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
}

export default function DeleteObjectiveModal({ isOpen, onClose, objective }: DeleteObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const router = useRouter()

  if (!objective) return null

  const isConfirmationValid = confirmationText === objective.title

  const handleDelete = async () => {
    if (!isConfirmationValid) {
      toast.error('Please type the objective title exactly to confirm deletion')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective has been permanently deleted.')
        onClose()
        if (objective.level === 'COMPANY') {
          router.push('/dashboard/company-okrs')
        } else if (objective.level === 'DEPARTMENT') {
          router.push('/dashboard/department-okrs')
        } else {
          router.push('/dashboard/my-okrs')
        }
      } else {
        toast.error(result.error || 'Failed to delete objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setConfirmationText('')
    onClose()
  }

  const childCount = objective._count?.childObjectives ?? 0

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={handleClose}
      onConfirm={handleDelete}
      title="Delete Objective"
      message="This action is permanent and cannot be undone."
      description="You are about to permanently delete this objective and all its associated data."
      variant="danger"
      confirmLabel="Delete Permanently"
      loadingLabel="Deleting..."
      isLoading={isLoading}
      disabled={!isConfirmationValid}
      bullets={[
        'The objective itself',
        `All associated key results (${objective._count?.keyResults || 0})`,
        'All progress tracking data',
        'All comments and activity history',
      ]}
      bulletsTitle="What will be deleted:"
      details={
        <>
          <h4 className="text-sm font-medium text-foreground mb-2">Objective Details:</h4>
          <p className="text-sm text-muted-foreground font-medium">{objective.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {objective.level} • {objective.owner?.name}
          </p>
        </>
      }
      extraContent={
        <>
          {childCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-yellow-800">
                Child Objectives Will Be Unlinked
              </h4>
              <p className="text-sm text-yellow-700 mt-1">
                This objective has {childCount} child objective(s) that will become unlinked but will not be deleted.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="confirmation" className="block text-sm font-medium text-muted-foreground mb-2">
              To confirm deletion, type the objective title exactly:
            </label>
            <input
              type="text"
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={objective.title}
              className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            {confirmationText && !isConfirmationValid && (
              <p className="mt-1 text-sm text-red-600">
                The text must match the objective title exactly
              </p>
            )}
          </div>
        </>
      }
    />
  )
}
