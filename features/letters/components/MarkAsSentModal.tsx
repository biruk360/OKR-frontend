'use client'

import { useState } from 'react'
import { Modal, Button, Input, Label } from '@/components/ui'
import type { LetterDispatchMethod } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (payload: {
    dispatchMethod: LetterDispatchMethod
    dispatchDate: string
    trackingReference?: string
  }) => Promise<void>
}

const METHODS: { value: LetterDispatchMethod; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'PRINTED', label: 'Printed' },
  { value: 'COURIER', label: 'Courier' },
]

export default function MarkAsSentModal({ open, onClose, onSubmit }: Props) {
  const [method, setMethod] = useState<LetterDispatchMethod>('EMAIL')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tracking, setTracking] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        dispatchMethod: method,
        dispatchDate: date,
        trackingReference: tracking.trim() || undefined,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark as sent')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mark as Sent" size="sm">
      <div className="space-y-3 p-4">
        <div>
          <Label>Dispatch Method</Label>
          <div className="mt-1 flex gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  method === m.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="dispatch-date">Dispatch Date</Label>
          <Input
            id="dispatch-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tracking-ref">Tracking Reference (optional)</Label>
          <Input
            id="tracking-ref"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="e.g. DHL-AWB 8421 0091"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handle} disabled={submitting}>
            {submitting ? 'Marking…' : 'Mark as Sent'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
