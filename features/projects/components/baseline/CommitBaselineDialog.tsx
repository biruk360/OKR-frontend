'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useCommitBaseline } from '../../hooks/useProject'

/**
 * Commit-baseline confirmation (C1). Freezing the baseline is irreversible
 * (invariant #1), so every entry point — the Gantt toolbar included — goes
 * through this dialog; there is no one-click commit.
 */
export function CommitBaselineDialog({
  open,
  onClose,
  projectId,
  activityCount,
  defaultNotes = '',
}: {
  open: boolean
  onClose: () => void
  projectId: string
  activityCount: number
  defaultNotes?: string
}) {
  const commitBaseline = useCommitBaseline(projectId)
  const [notes, setNotes] = useState(defaultNotes)

  const close = () => {
    setNotes(defaultNotes)
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      onConfirm={async () => {
        try {
          await commitBaseline.mutateAsync({ notes: notes.trim() || undefined })
          close()
        } catch {
          // Error toast already shown by the mutation's onError; keep the dialog open.
        }
      }}
      title="Commit Baseline — Version 1"
      message="This freezes the current schedule as the agreed plan."
      variant="warning"
      confirmLabel="Commit Baseline"
      isLoading={commitBaseline.isPending}
      bullets={[
        `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'} will be baselined`,
        'All future date changes will require a slip reason and owner',
        'This action is logged and cannot be silently undone',
      ]}
      extraContent={
        <label className="block">
          <span className="text-body-sm text-ink-secondary">Baseline notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="input mt-1 w-full"
            placeholder="e.g. Agreed with client at kickoff on …"
          />
        </label>
      }
    />
  )
}
