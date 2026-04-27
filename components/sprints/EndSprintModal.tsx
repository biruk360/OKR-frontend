'use client'

/**
 * EndSprintModal — Sprints v2 §4.9 sprint end flow.
 *
 * Summary stats + radio-controlled "what to do with incomplete tasks":
 *   - Move to next sprint  (requires sprint picker)
 *   - Move to backlog
 *   - Cancel them
 *   - Decide per task      (inline list with three-way picker)
 * Optional reflection note. Submits to POST /api/sprints/[id]/end.
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import AddToSprintDropdown from './AddToSprintDropdown'

interface IncompleteTodo {
  id: string
  title: string
  status: string
}

interface Props {
  open: boolean
  onClose: () => void
  sprintId: string
  sprintName: string
  completedCount: number
  incompleteTodos: IncompleteTodo[]
  goalLabel?: string | null
  goalCurrent?: number | null
  goalTarget?: number | null
  goalUnit?: string | null
}

type Handling = 'next' | 'backlog' | 'cancel' | 'per-task'
type PerAction = 'next' | 'backlog' | 'cancel'

export default function EndSprintModal({
  open, onClose, sprintId, sprintName,
  completedCount, incompleteTodos,
  goalLabel, goalCurrent, goalTarget, goalUnit,
}: Props) {
  const router = useRouter()
  const [handling, setHandling] = useState<Handling>('next')
  const [nextSprintId, setNextSprintId] = useState<string | null>(null)
  const [perTaskActions, setPerTaskActions] = useState<Record<string, PerAction>>({})
  const [perTaskNextSprintId, setPerTaskNextSprintId] = useState<string | null>(null)
  const [reflection, setReflection] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setHandling('next')
      setNextSprintId(null)
      setPerTaskActions({})
      setReflection('')
    }
  }, [open])

  const goalPercent = goalTarget && goalTarget > 0
    ? Math.min(100, Math.round(((goalCurrent ?? 0) / goalTarget) * 100))
    : null

  async function submit() {
    if ((handling === 'next') && !nextSprintId && incompleteTodos.length > 0) {
      toast.error('Please pick a sprint to move incomplete tasks to.')
      return
    }
    if (handling === 'per-task') {
      const missing = incompleteTodos.filter((t) => !perTaskActions[t.id])
      if (missing.length > 0) {
        toast.error('Pick an action for every incomplete task.')
        return
      }
      const needsNext = Object.values(perTaskActions).some((a) => a === 'next')
      if (needsNext && !perTaskNextSprintId) {
        toast.error('Pick a sprint for tasks moving to "next".')
        return
      }
    }

    setSubmitting(true)
    try {
      const body: any = {
        incompleteHandling: handling,
        reflectionNote: reflection.trim() || undefined,
      }
      if (handling === 'next') body.nextSprintId = nextSprintId
      if (handling === 'per-task') {
        body.nextSprintId = perTaskNextSprintId
        body.perTaskActions = Object.entries(perTaskActions).map(([todoId, action]) => ({ todoId, action }))
      }
      const res = await fetch(`/api/sprints/${sprintId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to end sprint')
      toast.success(`Sprint "${sprintName}" closed.`)
      onClose()
      router.push('/dashboard/sprints')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to end sprint')
    } finally {
      setSubmitting(false)
    }
  }

  const incompleteCount = incompleteTodos.length

  return (
    <Modal open={open} onClose={onClose} title={`End sprint — ${sprintName}`}>
      <div className="space-y-4 text-[13px]">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] border p-3" style={{ borderColor: 'var(--ap-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Completed</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: 'var(--ap-green)' }}>
              {completedCount}
            </p>
          </div>
          <div className="rounded-[10px] border p-3" style={{ borderColor: 'var(--ap-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Incomplete</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: 'var(--ap-orange)' }}>
              {incompleteCount}
            </p>
          </div>
        </div>

        {goalTarget && goalTarget > 0 && (
          <div className="rounded-[10px] border p-3" style={{ borderColor: 'var(--ap-border)' }}>
            <p className="text-[11px] font-semibold text-muted-foreground">{goalLabel ?? 'Goal'}</p>
            <p className="mt-1 text-[14px] font-semibold tabular-nums">
              {goalUnit ? `${goalUnit} ` : ''}{(goalCurrent ?? 0).toLocaleString()} of {goalTarget.toLocaleString()} {goalUnit ? '' : ''} ({goalPercent}%)
            </p>
          </div>
        )}

        {incompleteCount > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-semibold">What should we do with the {incompleteCount} incomplete task{incompleteCount === 1 ? '' : 's'}?</p>
            <div className="space-y-2">
              {([
                ['next', 'Move to next sprint'],
                ['backlog', 'Move to backlog'],
                ['cancel', 'Cancel them'],
                ['per-task', 'Decide per task'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="handling"
                    checked={handling === key}
                    onChange={() => setHandling(key)}
                    className="mt-0.5"
                  />
                  <span className="text-[12px]">{label}</span>
                </label>
              ))}
            </div>

            {handling === 'next' && (
              <div className="mt-2 pl-6">
                <AddToSprintDropdown
                  value={nextSprintId}
                  onChange={setNextSprintId}
                  excludeSprintId={sprintId}
                  placeholder="Pick a sprint…"
                />
              </div>
            )}

            {handling === 'per-task' && (
              <div className="mt-2 max-h-[260px] overflow-y-auto rounded-[10px] border p-2" style={{ borderColor: 'var(--ap-border)' }}>
                {incompleteTodos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-1">
                    <span className="flex-1 truncate text-[12px]">{t.title}</span>
                    <select
                      value={perTaskActions[t.id] ?? ''}
                      onChange={(e) => setPerTaskActions((s) => ({ ...s, [t.id]: e.target.value as PerAction }))}
                      className="rounded-[8px] border bg-card px-2 py-1 text-[11px]"
                      style={{ borderColor: 'var(--ap-border)' }}
                    >
                      <option value="">—</option>
                      <option value="next">Next sprint</option>
                      <option value="backlog">Backlog</option>
                      <option value="cancel">Cancel</option>
                    </select>
                  </div>
                ))}
                {Object.values(perTaskActions).some((a) => a === 'next') && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sprint for "Next sprint" tasks</p>
                    <AddToSprintDropdown
                      value={perTaskNextSprintId}
                      onChange={setPerTaskNextSprintId}
                      excludeSprintId={sprintId}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-[12px] font-semibold">Sprint reflection (optional)</label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            placeholder="What went well? What didn't?"
            className="mt-1 w-full rounded-[10px] border bg-card p-2 text-[12px] outline-none"
            style={{ borderColor: 'var(--ap-border)' }}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border px-3 py-1.5 text-[12px] hover:bg-muted"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--ap-accent)' }}
          >
            {submitting ? 'Ending…' : 'End sprint'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
