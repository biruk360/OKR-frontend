'use client'

/**
 * ScheduleSprintModal — sets sprint start/end dates, optionally activating
 * the sprint at the same time. Opens from the PLANNING-state Start sprint
 * button when the sprint has no dates yet (defaults: today, +14 days), and
 * also from the header "Schedule" action for editing dates later.
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  sprintId: string
  sprintName: string
  initialStart: string | null
  initialEnd: string | null
  /** When true, also transitions the sprint state to ACTIVE on save. */
  activateOnSave?: boolean
  onSaved: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function ScheduleSprintModal({
  open, onClose, sprintId, sprintName, initialStart, initialEnd, activateOnSave, onSaved,
}: Props) {
  const [start, setStart] = useState(initialStart?.slice(0, 10) ?? todayIso())
  const [end, setEnd] = useState(initialEnd?.slice(0, 10) ?? plusDaysIso(14))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setStart(initialStart?.slice(0, 10) ?? todayIso())
    setEnd(initialEnd?.slice(0, 10) ?? plusDaysIso(14))
  }, [open, initialStart, initialEnd])

  const invalid = !start || !end || new Date(end) < new Date(start)
  const title = activateOnSave ? `Start sprint — ${sprintName}` : `Schedule sprint — ${sprintName}`
  const cta = activateOnSave ? 'Start sprint' : 'Save dates'

  async function submit() {
    if (invalid) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          ...(activateOnSave && { state: 'ACTIVE' }),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      toast.success(activateOnSave ? 'Sprint started' : 'Dates updated')
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-[10px] border px-3 py-1.5 text-[12px] font-semibold hover:bg-muted disabled:opacity-50"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || invalid}
            className="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : cta}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-muted-foreground">
          {activateOnSave
            ? 'Set the dates for this sprint and start it. The sprint will move to Active.'
            : 'Update the start and end dates for this sprint.'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-[10px] border bg-card px-2 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--ap-border)' }}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">End date</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-[10px] border bg-card px-2 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--ap-border)' }}
            />
          </label>
        </div>
        {invalid && start && end && (
          <p className="text-[12px] text-[var(--ap-danger)]">End date must be on or after start date.</p>
        )}
      </div>
    </Modal>
  )
}
