'use client'

import { useEffect, useState } from 'react'
import { PenLine } from 'lucide-react'
import { Button, Input, Label, Modal, Textarea } from '@/components/ui'
import { useSaveManualActual } from '../hooks/queries'

type ManualActualModalProps = {
  open: boolean
  onClose: () => void
  evaluationId: string
  criterionId: string
  criterionTitle: string
  /** Prefill values when editing an existing manual entry. */
  existingActual?: number | null
  existingNote?: string
}

/**
 * Manual metric-actual fallback: a lead/admin records the actual value when
 * automatic source resolution fails (archived or missing Key Result). The
 * resolver uses this only when automatic resolution cannot produce a value.
 */
export function ManualActualModal({
  open,
  onClose,
  evaluationId,
  criterionId,
  criterionTitle,
  existingActual,
  existingNote,
}: ManualActualModalProps) {
  const save = useSaveManualActual(evaluationId)
  const [actual, setActual] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setActual(existingActual != null ? String(existingActual) : '')
    setNote(existingNote ?? '')
  }, [open, existingActual, existingNote])

  const parsed = Number(actual)
  const valid = actual.trim() !== '' && Number.isFinite(parsed)

  async function handleSave() {
    if (!valid) return
    try {
      await save.mutateAsync({ criterionId, actual: parsed, note: note.trim() || undefined })
      onClose()
    } catch { /* onError already toasts; keep the modal open */ }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enter actual"
      icon={PenLine}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid || save.isPending}>Save actual</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Automatic resolution failed for <span className="font-medium text-foreground">{criterionTitle}</span>.
          Enter the actual value so consolidation can proceed — automatic sources take precedence when they resolve.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="manual-actual-value">Actual value</Label>
          <Input
            id="manual-actual-value"
            type="number"
            inputMode="decimal"
            step="any"
            value={actual}
            placeholder="e.g. 42"
            autoFocus
            onChange={(event) => setActual(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleSave() } }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-actual-note">Note <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea
            id="manual-actual-note"
            value={note}
            placeholder="Where does this number come from? Shown to reviewers for the audit trail."
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">Recorded with your name and timestamp.</p>
        </div>
      </div>
    </Modal>
  )
}
