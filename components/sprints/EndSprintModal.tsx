'use client'

/**
 * EndSprintModal v2 (FR-01 / UX-02) — close a sprint with deliberate
 * incomplete-task dispositions, benchmarked against Jira's Complete Sprint dialog.
 *
 * Self-sufficient: fetches the preflight (counts, incomplete todos with carryover
 * lineage, destination sprints) from GET /api/sprints/[id]/end on open.
 *
 * Disposition model: per-task actions default to "next". When every row shares
 * one action the API receives the bulk mode; otherwise `per-task`. Destination is
 * an existing PLANNING/ACTIVE sprint or a new sprint created inline
 * (AppleDateRangePicker — never a native date input).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { AppleDateRangePicker, toIso } from '@/components/ui/date-picker'

type PerAction = 'next' | 'backlog' | 'cancel'

interface PreflightTodo {
  id: string
  title: string
  status: string
  carryoverCount: number
  assignee: { id: string; name: string | null; avatar: string | null } | null
}

interface Preflight {
  sprint: {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    goal: string | null
    goalLabel: string | null
    goalTarget: number | null
    goalCurrent: number | null
    goalUnit: string | null
  }
  counts: { total: number; completed: number; incomplete: number }
  incompleteTodos: PreflightTodo[]
  destinations: { id: string; name: string; state: string; startDate: string | null; endDate: string | null }[]
}

interface Props {
  open: boolean
  onClose: () => void
  sprintId: string
  /** Called after a successful close so the board/list can refresh. */
  onClosed?: (reportUrl: string) => void
}

const ACTION_LABEL: Record<PerAction, string> = { next: 'Next sprint', backlog: 'Backlog', cancel: 'Cancel' }

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EndSprintModal({ open, onClose, sprintId, onClosed }: Props) {
  const router = useRouter()
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [actions, setActions] = useState<Record<string, PerAction>>({})
  const [destination, setDestination] = useState<string>('new') // 'new' | sprintId
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState<string | null>(null)
  const [newEnd, setNewEnd] = useState<string | null>(null)
  const [reflection, setReflection] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/end`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load')
      const pf: Preflight = json.data
      setPreflight(pf)
      const defaults: Record<string, PerAction> = {}
      for (const t of pf.incompleteTodos) defaults[t.id] = 'next'
      setActions(defaults)
      setDestination(pf.destinations.length > 0 ? pf.destinations[0].id : 'new')
      const match = pf.sprint.name.match(/^(.*?)(\d+)$/)
      setNewName(match ? `${match[1]}${Number(match[2]) + 1}` : `${pf.sprint.name} (next)`)
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + 13)
      setNewStart(toIso(start))
      setNewEnd(toIso(end))
      setReflection('')
    } catch (err: any) {
      // Show the failure inline (with retry) instead of silently closing —
      // an auto-closing modal looks like the close option doesn't exist.
      setLoadError(err.message || 'Could not load sprint close preview')
    } finally {
      setLoading(false)
    }
  }, [sprintId, onClose])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const counts = preflight?.counts ?? { total: 0, completed: 0, incomplete: 0 }
  const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0

  const summary = useMemo(() => {
    const s = { next: 0, backlog: 0, cancel: 0 }
    for (const t of preflight?.incompleteTodos ?? []) s[actions[t.id] ?? 'next']++
    return s
  }, [actions, preflight])

  const needsDestination = summary.next > 0
  const destinationValid = !needsDestination || (destination === 'new'
    ? newName.trim().length > 0 && !!newStart && !!newEnd
    : !!destination)
  const allHaveAction = (preflight?.incompleteTodos ?? []).every(t => actions[t.id])
  const canSubmit = !!preflight && !submitting && allHaveAction && destinationValid

  const ctaDetail = [
    summary.next > 0 && `${summary.next} → next`,
    summary.backlog > 0 && `${summary.backlog} → backlog`,
    summary.cancel > 0 && `${summary.cancel} cancel`,
  ].filter(Boolean).join(', ')

  const setAll = (a: PerAction) => {
    const next: Record<string, PerAction> = {}
    for (const t of preflight?.incompleteTodos ?? []) next[t.id] = a
    setActions(next)
  }

  async function submit() {
    if (!preflight || !canSubmit) return
    setSubmitting(true)
    try {
      const todos = preflight.incompleteTodos
      const distinct = new Set(todos.map(t => actions[t.id]))
      const body: any = { reflectionNote: reflection.trim() || null }

      if (todos.length === 0) {
        body.incompleteHandling = 'backlog' // no-op mode; nothing to disposition
      } else if (distinct.size === 1) {
        body.incompleteHandling = [...distinct][0]
      } else {
        body.incompleteHandling = 'per-task'
        body.perTaskActions = todos.map(t => ({ todoId: t.id, action: actions[t.id] }))
      }

      if (needsDestination) {
        if (destination === 'new') {
          body.createNextSprint = { name: newName.trim(), startDate: newStart, endDate: newEnd }
        } else {
          body.nextSprintId = destination
        }
      }

      const res = await fetch(`/api/sprints/${sprintId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to complete sprint')

      const s = json.data.summary
      toast.success(
        `Sprint completed — ${s.completedCount} done` +
        (s.movedToNext ? ` · ${s.movedToNext} carried` : '') +
        (s.movedToBacklog ? ` · ${s.movedToBacklog} backlogged` : '') +
        (s.cancelled ? ` · ${s.cancelled} cancelled` : ''),
      )
      const reportUrl = `/dashboard/sprints/${sprintId}/report`
      onClose()
      onClosed?.(reportUrl)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete sprint')
    } finally {
      setSubmitting(false)
    }
  }

  const goalPct = preflight?.sprint.goalTarget
    ? Math.round(((preflight.sprint.goalCurrent ?? 0) / preflight.sprint.goalTarget) * 100)
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete sprint"
      size="lg"
      scrollBehavior="internal"
      stickyHeader
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Completing…' : `Complete sprint${ctaDetail ? ` · ${ctaDetail}` : ''}`}
          </Button>
        </>
      }
    >
      {loadError ? (
        <div className="py-8 text-center">
          <p className="text-[13px]" style={{ color: 'var(--ap-danger-fg)' }}>{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-[10px] px-3 py-1.5 text-[13px] font-medium"
            style={{ background: 'rgba(120,120,128,0.12)', color: 'var(--ap-accent)' }}
          >
            Try again
          </button>
        </div>
      ) : loading || !preflight ? (
        <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ap-fg-subtle)' }}>Loading…</div>
      ) : (
        <div className="space-y-4 text-[13px]">
          {/* Summary card (UX-02) */}
          <div
            className="rounded-[14px] p-4"
            style={{ background: 'var(--ap-bg-sunken)', border: '0.5px solid var(--ap-border)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold" style={{ letterSpacing: '-0.01em' }}>
                  {preflight.sprint.name}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {fmtDate(preflight.sprint.startDate)} → {fmtDate(preflight.sprint.endDate)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[20px] font-semibold tabular-nums" style={{ letterSpacing: '-0.02em' }}>{pct}%</span>
                <span className="ml-1 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>done</span>
              </div>
            </div>
            <div className="mt-3 h-[8px] overflow-hidden rounded-full" style={{ background: 'var(--ap-kr-bar-bg)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-[400ms]"
                style={{ width: `${pct}%`, background: 'var(--ap-green)', transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)' }}
              />
            </div>
            <div className="mt-2 flex gap-4 text-[11px]" style={{ color: 'var(--ap-fg-muted)' }}>
              <span><strong className="tabular-nums">{counts.completed}</strong> completed</span>
              <span><strong className="tabular-nums">{counts.incomplete}</strong> incomplete</span>
              {goalPct !== null && (
                <span>
                  Goal: <strong className="tabular-nums">{preflight.sprint.goalCurrent ?? 0}/{preflight.sprint.goalTarget}</strong>
                  {' '}{preflight.sprint.goalLabel ?? ''} ({goalPct}%)
                </span>
              )}
            </div>
          </div>

          {counts.incomplete === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--ap-fg-muted)' }}>
              Everything is done — nothing to disposition. One click and this sprint is complete. 🎉
            </p>
          ) : (
            <>
              {/* Incomplete tasks */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                    Incomplete tasks ({counts.incomplete})
                  </span>
                  <div className="flex gap-1">
                    {(['next', 'backlog', 'cancel'] as PerAction[]).map(a => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAll(a)}
                        className="rounded-[7px] px-2 py-0.5 text-[11px] font-medium transition-colors"
                        style={{
                          background: 'rgba(120,120,128,0.12)',
                          color: 'var(--ap-fg-muted)',
                        }}
                      >
                        All → {ACTION_LABEL[a]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
                  {preflight.incompleteTodos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors"
                      style={{ border: '0.5px solid transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--ap-bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {t.carryoverCount >= 2 && (
                        <span
                          className="shrink-0 rounded-[6px] px-1.5 py-px text-[10px] font-semibold"
                          style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
                          title={`Carried ${t.carryoverCount} times — consider splitting or descoping`}
                        >
                          ↪ ×{t.carryoverCount}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                      <span
                        className="shrink-0 rounded-[6px] px-1.5 py-px font-mono text-[10px] font-semibold"
                        style={{ background: 'var(--ap-none-bg)', color: 'var(--ap-none-fg)' }}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                      <div className="flex shrink-0 gap-0.5 rounded-[9px] p-[2px]" style={{ background: 'rgba(120,120,128,0.16)' }}>
                        {(['next', 'backlog', 'cancel'] as PerAction[]).map(a => {
                          const active = (actions[t.id] ?? 'next') === a
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() => setActions(prev => ({ ...prev, [t.id]: a }))}
                              className="rounded-[7px] px-2 py-0.5 text-[11px] transition-all"
                              style={{
                                fontWeight: active ? 600 : 500,
                                background: active ? 'var(--ap-bg-raised)' : 'transparent',
                                color: active ? 'var(--ap-fg)' : 'var(--ap-fg-muted)',
                                boxShadow: active ? '0 3px 8px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)' : 'none',
                              }}
                            >
                              {a === 'next' ? 'Next' : a === 'backlog' ? 'Backlog' : 'Cancel'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination */}
              {needsDestination && (
                <div>
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                    Move {summary.next} task{summary.next === 1 ? '' : 's'} to
                  </span>
                  <div className="space-y-1.5">
                    {preflight.destinations.map(d => (
                      <label
                        key={d.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 transition-colors"
                        style={{
                          border: `0.5px solid ${destination === d.id ? 'var(--ap-accent)' : 'var(--ap-border)'}`,
                          background: destination === d.id ? 'var(--ap-accent-soft)' : 'transparent',
                        }}
                      >
                        <input type="radio" name="dest" checked={destination === d.id} onChange={() => setDestination(d.id)} className="accent-[#007AFF]" />
                        <span className="flex-1 text-[13px] font-medium">{d.name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                          {fmtDate(d.startDate)} → {fmtDate(d.endDate)} · {d.state.toLowerCase()}
                        </span>
                      </label>
                    ))}
                    <label
                      className="block cursor-pointer rounded-[10px] px-3 py-2 transition-colors"
                      style={{
                        border: `0.5px solid ${destination === 'new' ? 'var(--ap-accent)' : 'var(--ap-border)'}`,
                        background: destination === 'new' ? 'var(--ap-accent-soft)' : 'transparent',
                      }}
                    >
                      <span className="flex items-center gap-2.5">
                        <input type="radio" name="dest" checked={destination === 'new'} onChange={() => setDestination('new')} className="accent-[#007AFF]" />
                        <span className="text-[13px] font-medium">+ New sprint</span>
                      </span>
                      {destination === 'new' && (
                        <span className="mt-2.5 block space-y-2" onClick={e => e.preventDefault()}>
                          <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Sprint name"
                            className="w-full rounded-[10px] px-2.5 py-1.5 text-[13px]"
                            style={{
                              background: 'rgba(120,120,128,0.10)',
                              border: '0.5px solid var(--ap-border)',
                              color: 'var(--ap-fg)',
                              outline: 'none',
                            }}
                          />
                          <AppleDateRangePicker
                            start={newStart}
                            end={newEnd}
                            onChange={(s, e) => { setNewStart(s); setNewEnd(e) }}
                            minDate={toIso(new Date())}
                          />
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Reflection */}
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>
              Reflection (optional)
            </span>
            <textarea
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              rows={3}
              placeholder="What went well? What didn't? — shown on the sprint report"
              className="w-full resize-none rounded-[10px] px-2.5 py-2 text-[13px]"
              style={{
                background: 'rgba(120,120,128,0.10)',
                border: '0.5px solid var(--ap-border)',
                color: 'var(--ap-fg)',
                outline: 'none',
              }}
            />
          </div>

          {summary.next > 0 && (preflight.incompleteTodos.some(t => t.carryoverCount >= 2 && actions[t.id] === 'next')) && (
            <div
              className="flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12px]"
              style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Some tasks have been carried 2+ times already. Carrying them again may hide a sizing or scoping problem — consider backlog or cancel instead.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
