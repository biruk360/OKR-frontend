'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface DeleteObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
  /**
   * Called after a successful delete. When omitted the modal navigates to the
   * level's list page (legacy behaviour of the standalone delete button).
   */
  onDeleted?: () => void
}

export default function DeleteObjectiveModal({ isOpen, onClose, objective, onDeleted }: DeleteObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const router = useRouter()

  if (!objective) return null

  const childCount = objective._count?.childObjectives ?? 0
  // DELETE /api/objectives/[id] rejects objectives that still have children.
  const hasChildren = childCount > 0
  const isConfirmationValid = !hasChildren && confirmationText === objective.title

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
        setConfirmationText('')
        onClose()
        if (onDeleted) {
          onDeleted()
        } else if (objective.level === 'COMPANY') {
          router.push('/dashboard/okrs-all?level=company')
        } else if (objective.level === 'DEPARTMENT') {
          router.push('/dashboard/okrs-all?level=department')
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
          {hasChildren && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 mb-4">
              <h4 className="text-sm font-medium text-warning-800">
                Unlink child objectives first
              </h4>
              <p className="text-sm text-warning-700 mt-1">
                This objective has {childCount} aligned child objective{childCount === 1 ? '' : 's'}. Move
                {childCount === 1 ? ' it' : ' them'} under another objective before deleting this one.
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
              className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-danger-500 focus:border-danger-500"
            />
            {confirmationText && !isConfirmationValid && (
              <p className="mt-1 text-sm text-danger-600">
                The text must match the objective title exactly
              </p>
            )}
          </div>
        </>
      }
    />
  )
}
