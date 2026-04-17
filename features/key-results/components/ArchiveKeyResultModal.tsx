'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/ui'

interface ArchiveKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  onArchived?: () => void
}

export default function ArchiveKeyResultModal({
  isOpen,
  onClose,
  keyResult,
  onArchived,
}: ArchiveKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!keyResult) return null

  const handleArchive = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result archived successfully.')
        onClose()
        if (onArchived) onArchived()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to archive key result')
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
      onConfirm={handleArchive}
      title="Archive Key Result"
      message="This will archive the Key Result. It will be hidden from active views but can be restored later."
      description="Archiving a key result will not delete it, but it will be excluded from progress calculations and active views."
      variant="warning"
      confirmLabel="Archive Key Result"
      loadingLabel="Archiving..."
      isLoading={isLoading}
      bullets={[
        'The key result will be marked as archived',
        'It will be hidden from active key result lists',
        'Progress calculations will exclude this key result',
        "The parent objective's progress will be recalculated",
        'All associated to-dos will remain but be hidden',
        'You can restore it later if needed',
      ]}
      details={
        <>
          <h4 className="text-sm font-medium text-foreground mb-2">Key Result Details:</h4>
          <p className="text-sm text-muted-foreground font-medium">{keyResult.title}</p>
          {keyResult.description && (
            <p className="text-xs text-muted-foreground mt-1">{keyResult.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Target: {keyResult.targetValue} {keyResult.unit} • Current: {keyResult.currentValue} {keyResult.unit}
          </p>
          <p className="text-xs text-muted-foreground">
            Progress: {keyResult.progress?.toFixed(1) || 0}% • Owner: {keyResult.owner?.name || 'Unknown'}
          </p>
        </>
      }
    />
  )
}
