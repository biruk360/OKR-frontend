'use client'

/**
 * Sprint board quick-add composer (Sprints v2 §4.3 / D) — the lane-footer
 * "Add a card" row that expands into a small form. Split out of
 * SprintBoardClient.tsx; behaviour unchanged.
 */

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppleDatePicker } from '@/components/ui/date-picker'
import LinkToOkrPopover, { type OkrLinkValue } from '@/components/sprints/LinkToOkrPopover'


// ─── Add Task inline form (Sprints v2 §4.3 / D) ─────────────────────────────

export default function AddTaskInline({
  sprintId, columnId, currentUserId, defaultDueDate, onCreated, openSignal, dark,
}: {
  sprintId: string
  /** Lane the card is created in. Without it the server would guess by status. */
  columnId: string | null
  currentUserId: string
  defaultDueDate: string | null
  onCreated: () => void
  /** Dark board ground (`graphite`). */
  dark?: boolean
  /** Incremented by the board to open and focus this composer from elsewhere
   *  (STA-2: the empty-state CTA). A counter rather than a boolean so repeat
   *  presses re-open it after the user cancels. */
  openSignal?: number
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const [more, setMore] = useState(false)
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState<string>(defaultDueDate?.slice(0, 10) ?? '')
  const [okr, setOkr] = useState<OkrLinkValue | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    // Scroll it into view — on an empty board the composer sits below the
    // empty state, so opening it off-screen would look like nothing happened.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [openSignal])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No assigneeId — Trello-style cards start unassigned. Members are
          // added via the card's Members popover.
          title: title.trim(),
          sprintId,
          ...(columnId && { columnId }),
          priority,
          dueDate: dueDate || null,
          keyResultId: okr?.keyResultId ?? null,
          objectiveId: okr?.objectiveId ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Task added')
      setTitle('')
      setOkr(null)
      setMore(false)
      setOpen(false)
      onCreated()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add task')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    // Lane-footer affordance from the design: 32px ghost row, not a dashed box.
    // (The per-lane `+` in the lane HEADER stays deferred — Decision 0.)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-[32px] w-full items-center gap-2 rounded-[var(--ap-radius-md)] px-2 text-left text-[12.5px] font-semibold transition-colors',
          dark
            ? 'text-white/80 hover:bg-white/15 hover:text-white'
            : 'text-[var(--ap-fg-secondary)] hover:bg-[var(--ap-bg-sunken)] hover:text-[var(--ap-fg)]',
        )}
      >
        <Plus className="h-3.5 w-3.5" /> Add a card
      </button>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="rounded-[10px] border p-2"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)', boxShadow: 'var(--ap-shadow-card)' }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        className="w-full rounded-[var(--ap-radius-sm)] border px-2 py-1.5 text-xs outline-none"
        style={{ borderColor: 'var(--ap-border-strong)', background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }}
      />
      {more && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="rounded-[var(--ap-radius-sm)] border bg-card px-2 py-1 text-caption"
              style={{ borderColor: 'var(--ap-border-strong)' }}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex-1">
              <AppleDatePicker
                value={dueDate || null}
                onChange={(iso) => setDueDate(iso ?? '')}
                placeholder="Due date"
              />
            </div>
          </div>
          <LinkToOkrPopover value={okr} onChange={setOkr} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setMore((m) => !m)} className="text-caption text-muted-foreground hover:underline">
          {more ? 'Less' : 'More options'}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setOpen(false); setTitle('') }}
            className="rounded-[var(--ap-radius-sm)] px-2 py-1 text-caption text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim() || submitting}
            className="rounded-[var(--ap-radius-sm)] px-2 py-1 text-caption font-semibold disabled:opacity-50"
            style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  )
}
