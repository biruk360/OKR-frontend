'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface DeleteKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  onSuccess?: () => void
}

export default function DeleteKeyResultModal({ isOpen, onClose, keyResult, onSuccess }: DeleteKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!keyResult) return null

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result deleted successfully.')
        onClose()
        if (onSuccess) onSuccess()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to delete key result')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={onClose}
      onConfirm={handleDelete}
      title="Delete Key Result"
      message="This will permanently delete the Key Result and all its to-dos. This action cannot be undone."
      description="You are about to permanently delete this key result and all associated data."
      variant="danger"
      confirmLabel="Delete Permanently"
      loadingLabel="Deleting..."
      isLoading={isLoading}
      bullets={[
        'The key result itself',
        'All associated to-dos and initiatives',
        'All progress tracking data',
        'All comments and activity history',
      ]}
      bulletsTitle="What will be deleted:"
      details={
        <>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Key Result Details:</h4>
          <p className="text-sm text-gray-700 font-medium">{keyResult.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            Target: {keyResult.targetValue} {keyResult.unit} • Current: {keyResult.currentValue} {keyResult.unit}
          </p>
          <p className="text-xs text-gray-500">Owner: {keyResult.owner?.name}</p>
        </>
      }
      extraContent={
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-yellow-800">
            Parent Objective Progress Will Be Recalculated
          </h4>
          <p className="text-sm text-yellow-700 mt-1">
            The parent objective&apos;s overall progress will be immediately recalculated based on the remaining key results.
          </p>
        </div>
      }
    />
  )
}
