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
import { Button } from '@/components/ui/button'
import { AppleDateRangePicker } from '@/components/ui/date-picker'

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
  const title = activateOnSave ? 'Start sprint' : 'Schedule sprint'
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
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting || invalid}>
            {submitting ? 'Saving…' : cta}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{sprintName}</span>
          {' — '}
          {activateOnSave
            ? 'Set the dates for this sprint and start it. The sprint will move to Active.'
            : 'Update the start and end dates for this sprint.'}
        </p>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sprint dates</span>
          <div className="mt-1.5">
            <AppleDateRangePicker
              start={start || null}
              end={end || null}
              onChange={(s, e) => { setStart(s ?? ''); setEnd(e ?? '') }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Pick a range or use a preset — the duration is shown live.
          </p>
        </div>
        {invalid && start && end && (
          <p className="text-[12px] text-[var(--ap-danger)]">End date must be on or after start date.</p>
        )}
      </div>
    </Modal>
  )
}
