'use client'

/**
 * SprintListManager — board list (lane) management.
 *
 * Exports two pieces used by SprintBoardClient:
 *   - `ListHeaderMenu`  — the "…" menu in each lane header (rename, remap
 *                         status, archive).
 *   - default `AddListColumn` — the "+ Add another list" trailing column.
 *
 * Lanes are SprintColumn rows. Each carries a `statusKey`, and several lanes may
 * share one, so a board can have "QA" and "Review" both mapped to IN_REVIEW
 * while completion maths still keys off Todo.status.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md LST-2, LST-3, LST-6, LST-7.
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, X, Pencil, ArrowRightLeft, Archive } from 'lucide-react'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { announce } from '@/components/shared/LiveAnnouncer'
import { BOARD_STATUSES, TODO_STATUS_META } from '@/lib/todo-status'
import type { TodoStatus } from '@/types'
import { cn } from '@/lib/utils'

export interface LaneSummary {
  id: string
  name: string
  statusKey: TodoStatus | null
  cardCount: number
}

async function callApi(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`)
  return json.data
}

function StatusSelect({
  value, onChange, id,
}: { value: TodoStatus | null; onChange: (v: TodoStatus) => void; id?: string }) {
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as TodoStatus)}
      className="w-full rounded-[var(--ap-radius-sm)] border bg-card px-2 py-1.5 text-[13px] outline-none"
      style={{ borderColor: 'var(--ap-border-strong)' }}
    >
      {BOARD_STATUSES.map((st) => (
        <option key={st} value={st}>{TODO_STATUS_META[st].label}</option>
      ))}
    </select>
  )
}

// ─── Lane header menu ───────────────────────────────────────────────────────

export function ListHeaderMenu({
  sprintId, lane, lanes, disabled, onChanged,
}: {
  sprintId: string
  lane: LaneSummary
  lanes: LaneSummary[]
  disabled?: boolean
  onChanged: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(lane.name)
  const [remapping, setRemapping] = useState(false)
  const [nextStatus, setNextStatus] = useState<TodoStatus>(lane.statusKey ?? 'PENDING')
  const [archiving, setArchiving] = useState(false)
  const [moveTo, setMoveTo] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const others = lanes.filter((l) => l.id !== lane.id)
  // Guards mirror the server's: never strand the board without a lane, and never
  // remove the last place finished work can go.
  const isLastLane = others.length === 0
  const isLastDoneLane =
    lane.statusKey === 'COMPLETED' && !others.some((l) => l.statusKey === 'COMPLETED')

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      announce(done)
      onChanged()
      setRenaming(false); setRemapping(false); setArchiving(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (disabled) return null

  return (
    <>
      <ActionsMenu
        label={`List actions for ${lane.name}`}
        className="rounded-[var(--ap-radius-xs)] p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
        items={[
          { key: 'rename', label: 'Rename list', icon: Pencil, onSelect: () => { setName(lane.name); setRenaming(true) } },
          { key: 'remap', label: 'Change status mapping', icon: ArrowRightLeft, onSelect: () => { setNextStatus(lane.statusKey ?? 'PENDING'); setRemapping(true) } },
          {
            key: 'archive',
            label: 'Archive list',
            icon: Archive,
            destructive: true,
            disabled: isLastLane || isLastDoneLane,
            onSelect: () => { setMoveTo(others[0]?.id ?? ''); setArchiving(true) },
          },
        ]}
      />

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename list"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRenaming(false)} disabled={busy}>Cancel</Button>
            <Button
              size="sm"
              disabled={busy || !name.trim() || name.trim() === lane.name}
              onClick={() => run(
                () => callApi(`/api/sprints/${sprintId}/columns/${lane.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: name.trim() }),
                }),
                'List renamed',
              )}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <label htmlFor="lane-name" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          List name
        </label>
        <input
          id="lane-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[var(--ap-radius-sm)] border bg-card px-3 py-1.5 text-[13px] outline-none"
          style={{ borderColor: 'var(--ap-border-strong)' }}
        />
      </Modal>

      <Modal
        open={remapping}
        onClose={() => setRemapping(false)}
        title="Change status mapping"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRemapping(false)} disabled={busy}>Cancel</Button>
            <Button
              size="sm"
              disabled={busy || nextStatus === lane.statusKey}
              onClick={() => run(
                () => callApi(`/api/sprints/${sprintId}/columns/${lane.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ statusKey: nextStatus }),
                }),
                `“${lane.name}” now maps to ${TODO_STATUS_META[nextStatus].label}`,
              )}
            >
              {busy ? 'Applying…' : 'Apply'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <p className="text-muted-foreground">
            Cards in <span className="font-semibold text-foreground">{lane.name}</span> take this
            list&rsquo;s status. Progress, AI planning and the end-of-sprint flow all read that
            status, not the list name.
          </p>
          <StatusSelect id="lane-status" value={nextStatus} onChange={setNextStatus} />
          {lane.cardCount > 0 && nextStatus !== lane.statusKey && (
            <div
              className="rounded-[var(--ap-radius-sm)] px-3 py-2 text-[12px]"
              style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
            >
              This will change the status of {lane.cardCount} card{lane.cardCount === 1 ? '' : 's'}.
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archive list"
        message={
          lane.cardCount > 0
            ? `“${lane.name}” holds ${lane.cardCount} card${lane.cardCount === 1 ? '' : 's'}. Choose where they go.`
            : `Archive “${lane.name}”?`
        }
        variant="warning"
        icon={Archive}
        confirmLabel="Archive list"
        isLoading={busy}
        disabled={lane.cardCount > 0 && !moveTo}
        onConfirm={() => run(
          () => callApi(
            `/api/sprints/${sprintId}/columns/${lane.id}${lane.cardCount > 0 ? `?moveTo=${moveTo}` : ''}`,
            { method: 'DELETE' },
          ),
          lane.cardCount > 0 ? `List archived and ${lane.cardCount} card(s) moved` : 'List archived',
        )}
        extraContent={lane.cardCount > 0 ? (
          <div className="mt-3">
            <label htmlFor="lane-move-to" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Move cards to
            </label>
            <select
              id="lane-move-to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="w-full rounded-[var(--ap-radius-sm)] border bg-card px-2 py-1.5 text-[13px] outline-none"
              style={{ borderColor: 'var(--ap-border-strong)' }}
            >
              <option value="">Select a list…</option>
              {others.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Cards adopt the destination list&rsquo;s status. Nothing is deleted.
            </p>
          </div>
        ) : undefined}
      />
    </>
  )
}

// ─── Add another list ───────────────────────────────────────────────────────

export default function AddListColumn({
  sprintId, dark, onCreated,
}: {
  sprintId: string
  dark?: boolean
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [statusKey, setStatusKey] = useState<TodoStatus>('PENDING')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await callApi(`/api/sprints/${sprintId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), statusKey }),
      })
      toast.success('List added')
      announce(`List ${name.trim()} added`)
      setName('')
      setStatusKey('PENDING')
      setOpen(false)
      onCreated()
    } catch (err) {
      // Keep the popover open and the typed name intact so a duplicate-name
      // conflict can be corrected without retyping.
      toast.error(err instanceof Error ? err.message : 'Could not add the list')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    // Design: 218 × 44, dashed white-on-white ghost affordance (§4.1 / §5).
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-[44px] w-[218px] shrink-0 items-center gap-[9px] rounded-[var(--ap-radius-card)] border border-dashed px-[14px] text-[13px] font-semibold backdrop-blur-md transition-colors',
          dark
            ? 'border-[oklch(1_0_0_/_0.35)] bg-[oklch(1_0_0_/_0.12)] text-white hover:bg-[oklch(1_0_0_/_0.22)]'
            : 'border-[oklch(1_0_0_/_0.9)] bg-[oklch(1_0_0_/_0.45)] text-[var(--ap-fg-muted)] hover:bg-[oklch(1_0_0_/_0.75)]',
        )}
      >
        <Plus className="h-[15px] w-[15px]" /> Add another list
      </button>
    )
  }

  // Open state matches a lane exactly: 286px on a translucent ground with the
  // board's own 12px radius and 1px border, so it does not read as a different
  // kind of surface mid-creation.
  return (
    <div
      className="flex w-[286px] shrink-0 flex-col gap-2 rounded-[var(--ap-radius-card)] border p-[10px] backdrop-blur-md"
      style={{
        background: dark ? 'oklch(0.28 0.02 262 / 0.62)' : 'color-mix(in oklab, var(--ap-bg-raised) 72%, transparent)',
        borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'color-mix(in oklab, var(--ap-bg-raised) 80%, transparent)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setName('') }
        }}
        placeholder="List name…"
        aria-label="New list name"
        className="w-full rounded-[var(--ap-radius-sm)] border px-2 py-1.5 text-[13px] outline-none"
        style={{
          background: 'var(--ap-bg-raised)',
          borderColor: 'var(--ap-border-strong)',
          color: 'var(--ap-fg)',
        }}
      />
      <div>
        <label
          htmlFor="new-lane-status"
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
        >
          Counts as
        </label>
        <StatusSelect id="new-lane-status" value={statusKey} onChange={setStatusKey} />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className="rounded-[var(--ap-radius-sm)] px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
        >
          {busy ? 'Adding…' : 'Add list'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setName('') }}
          aria-label="Cancel adding a list"
          className={cn(
            'rounded-[var(--ap-radius-sm)] p-1',
            dark ? 'text-white hover:bg-white/15' : 'text-[var(--ap-fg-secondary)] hover:bg-[var(--ap-bg-hover)]',
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
