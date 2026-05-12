'use client'

import { useState } from 'react'
import { Modal, Button, Textarea, Label } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}

export default function RejectLetterModal({ open, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setError(null)
    if (!reason.trim()) {
      setError('Please provide a reason.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(reason.trim())
      setReason('')
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to return letter to draft')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Return to Draft" size="sm">
      <div className="space-y-3 p-4">
        <Label htmlFor="reject-reason">Reason</Label>
        <Textarea
          id="reject-reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain what needs to change before this letter can be approved…"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handle} disabled={submitting || !reason.trim()}>
            {submitting ? 'Returning…' : 'Return to Draft'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
