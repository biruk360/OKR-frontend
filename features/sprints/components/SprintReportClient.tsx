'use client'

/**
 * SprintReportClient (FR-02 / UX-03) — the sprint report for a closed sprint.
 *
 * Hero (name, dates, ended-by, reflection) → stat strip (completion ring, tasks,
 * goal, carryovers) → four collapsible task groups (Completed / Carried /
 * Backlogged / Cancelled) → permission-gated actions (Reopen with window
 * countdown + optional bring-back, Clone, Delete). Apple Pro tokens throughout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ChevronDown, RotateCcw, Copy, Trash2, Quote, Calendar,
} from 'lucide-react'
import StatusPill from '@/components/shared/StatusPill'
import { cn } from '@/lib/utils'

interface ReportTodo {
  id: string
  title: string
  status?: string | null
  completedAt?: string | null
  fromStatus?: string
  assignee: { id: string; name: string | null; avatar: string | null } | null
  toSprintId?: string | null
  toSprintName?: string | null
  carryoverCount?: number | null
}

interface Report {
  sprint: {
    id: string
    name: string
    state: string
    startDate: string | null
    endDate: string | null
    endedAt: string | null
    endedBy: { id: string; name: string | null; avatar: string | null } | null
    reflectionNote: string | null
    goal: { label: string | null; target: number | null; currentAtClose: number | null; unit: string | null }
  }
  counts: {
    total: number
    completed: number
    carriedToNext: number
    backlogged: number
    cancelled: number
    completionRate: number | null
  }
  groups: {
    completed: ReportTodo[]
    carriedToNext: ReportTodo[]
    backlogged: ReportTodo[]
    cancelled: ReportTodo[]
  }
  backfilled: boolean
  reopen: {
    windowDays: number
    available: boolean
    reopened: { at: string; by: { id: string; name: string | null } | null } | null
  }
}

interface Props {
  sprintId: string
  currentUserId: string
  canEdit: boolean
  canDelete: boolean
}

function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' }),
  })
}

function dayDiff(fromIso: string | null): number | null {
  if (!fromIso) return null
  return Math.max(0, Math.ceil((new Date(fromIso).getTime() + 7 * 86400000 - Date.now()) / 86400000))
}

// ─── completion ring (token §3.9) ────────────────────────────────────────────

function CompletionRing({ rate }: { rate: number | null }) {
  const pct = rate === null ? 0 : Math.round(rate * 100)
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-[64px] w-[64px]">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--ap-kr-bar-bg)" strokeWidth="5.5" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke="var(--ap-green)" strokeWidth="5.5" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (rate ?? 0))}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset .4s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold tabular-nums">
        {rate === null ? '—' : `${pct}%`}
      </span>
    </div>
  )
}

// ─── collapsible task group ──────────────────────────────────────────────────

function TaskGroup({
  title,
  tone,
  todos,
  renderMeta,
  defaultOpen = true,
}: {
  title: string
  tone: 'ok' | 'accent' | 'none' | 'danger'
  todos: ReportTodo[]
  renderMeta?: (t: ReportTodo) => React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toneStyles = {
    ok: { bg: 'var(--ap-ok-bg)', fg: 'var(--ap-ok-fg)' },
    accent: { bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent)' },
    none: { bg: 'var(--ap-none-bg)', fg: 'var(--ap-none-fg)' },
    danger: { bg: 'var(--ap-danger-bg)', fg: 'var(--ap-danger-fg)' },
  }[tone]

  return (
    <div
      className="overflow-hidden rounded-[16px]"
      style={{ background: 'var(--ap-bg-raised)', border: '0.5px solid var(--ap-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0.5px 0 rgba(0,0,0,0.03)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors"
        style={{ borderBottom: open ? '1px solid var(--ap-border-soft)' : 'none' }}
      >
        <ChevronDown
          size={14}
          style={{
            color: 'var(--ap-fg-subtle)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 150ms',
          }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>
          {title}
        </span>
        <span
          className="rounded-[6px] px-1.5 py-px text-[10px] font-semibold tabular-nums"
          style={{ background: toneStyles.bg, color: toneStyles.fg }}
        >
          {todos.length}
        </span>
      </button>
      {open && (
        todos.length === 0 ? (
          <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--ap-fg-faint)' }}>None</p>
        ) : (
          <ul>
            {todos.map(t => (
              <li
                key={t.id}
                className="flex h-[40px] items-center gap-2.5 px-4 transition-colors hover:bg-[var(--ap-bg-hover)]"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--ap-fg)' }}>{t.title}</span>
                {renderMeta?.(t)}
                {t.assignee?.name && (
                  <span className="shrink-0 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>{t.assignee.name}</span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export function SprintReportClient({ sprintId, canEdit, canDelete }: Props) {
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showReopen, setShowReopen] = useState(false)
  const [bringBack, setBringBack] = useState<Set<string>>(new Set())
  const [reopening, setReopening] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cloning, setCloning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sprints/${sprintId}/report`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load report')
      setReport(json.data)
    } catch (err: any) {
      setError(err.message)
    }
  }, [sprintId])

  useEffect(() => { load() }, [load])

  const windowDaysLeft = useMemo(() => dayDiff(report?.sprint.endedAt ?? null), [report])

  async function reopen() {
    setReopening(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bringBackTodoIds: [...bringBack] }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to reopen')
      toast.success(`Sprint reopened${bringBack.size > 0 ? ` · ${bringBack.size} task${bringBack.size === 1 ? '' : 's'} brought back` : ''}`)
      router.push(`/dashboard/sprints/${sprintId}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setReopening(false)
    }
  }

  async function cloneSprint() {
    setCloning(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${report?.sprint.name} (copy)` }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to clone')
      toast.success('Cloned as a new planning sprint')
      router.push(`/dashboard/sprints/${json.data.id}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCloning(false)
    }
  }

  async function deleteSprint() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete')
      toast.success('Sprint deleted — its report summary is retained for history')
      router.push('/dashboard/sprints?state=COMPLETED')
    } catch (err: any) {
      toast.error(err.message)
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <div className="p-8 text-[13px]" style={{ color: 'var(--ap-danger-fg)' }}>
        {error} — <Link href="/dashboard/sprints" className="underline">back to sprints</Link>
      </div>
    )
  }
  if (!report) {
    return <div className="p-8 text-[13px]" style={{ color: 'var(--ap-fg-subtle)' }}>Loading report…</div>
  }

  const { sprint, counts, groups } = report
  const goalPct = sprint.goal.target ? Math.round(((sprint.goal.currentAtClose ?? 0) / sprint.goal.target) * 100) : null

  return (
    <div className="mx-auto max-w-[860px] space-y-4 px-4 py-6">
      <Link
        href="/dashboard/sprints"
        className="inline-flex items-center gap-1 text-[12px] transition-colors"
        style={{ color: 'var(--ap-fg-muted)' }}
      >
        <ArrowLeft size={13} /> Sprints
      </Link>

      {/* Hero card */}
      <div
        className="rounded-[16px] p-5"
        style={{ background: 'var(--ap-bg-raised)', border: '0.5px solid var(--ap-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0.5px 0 rgba(0,0,0,0.03)' }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-semibold" style={{ letterSpacing: '-0.02em' }}>{sprint.name}</h1>
          <StatusPill status={sprint.state.toLowerCase().replace('_', '-')} />
          {report.reopen.reopened && (
            <span
              className="rounded-[6px] px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
            >
              REOPENED {report.reopen.reopened.by?.name ? `by ${report.reopen.reopened.by.name}` : ''}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} />
            {fmtDate(sprint.startDate)} → {fmtDate(sprint.endDate, true)}
          </span>
          <span>
            {sprint.state === 'COMPLETED' ? 'Completed' : 'Cancelled'} {fmtDate(sprint.endedAt, true)}
            {sprint.endedBy?.name && <> · by {sprint.endedBy.name}</>}
          </span>
        </div>

        {sprint.reflectionNote && (
          <div
            className="mt-4 flex gap-2.5 rounded-[12px] p-3.5"
            style={{ background: 'var(--ap-bg-sunken)', borderLeft: '2px solid var(--ap-border-strong)' }}
          >
            <Quote size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ap-fg-faint)' }} />
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: 'var(--ap-fg-muted)' }}>
              {sprint.reflectionNote}
            </p>
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div
          className="flex items-center gap-3 rounded-[16px] p-4"
          style={{ background: 'var(--ap-bg-raised)', border: '0.5px solid var(--ap-border)' }}
        >
          <CompletionRing rate={counts.completionRate} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>Completion</div>
            <div className="text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>{counts.completed} of {counts.total} tasks</div>
          </div>
        </div>
        {[
          { label: 'Tasks done', value: `${counts.completed}/${counts.total}` },
          {
            label: sprint.goal.label ?? 'Goal',
            value: sprint.goal.target != null
              ? `${sprint.goal.currentAtClose ?? 0}/${sprint.goal.target}${sprint.goal.unit ? ` ${sprint.goal.unit}` : ''}${goalPct !== null ? ` (${goalPct}%)` : ''}`
              : '—',
          },
          { label: 'Carried over', value: String(counts.carriedToNext) },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-[16px] p-4"
            style={{ background: 'var(--ap-bg-raised)', border: '0.5px solid var(--ap-border)' }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--ap-fg-subtle)' }}>{s.label}</div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ letterSpacing: '-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {report.backfilled && (
        <p className="text-[12px]" style={{ color: 'var(--ap-fg-faint)' }}>
          This sprint was closed before detailed reporting existed — counts are reconstructed; per-task dispositions aren&apos;t available.
        </p>
      )}

      {/* Task groups */}
      <div className="space-y-3">
        <TaskGroup title="Completed" tone="ok" todos={groups.completed}
          renderMeta={t => t.completedAt && (
            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{fmtDate(t.completedAt)}</span>
          )} />
        <TaskGroup title="Carried to next sprint" tone="accent" todos={groups.carriedToNext}
          renderMeta={t => (
            <span className="flex shrink-0 items-center gap-1.5">
              {(t.carryoverCount ?? 0) > 0 && (
                <span
                  className="rounded-[6px] px-1.5 py-px text-[10px] font-semibold"
                  style={{
                    background: (t.carryoverCount ?? 0) >= 2 ? 'var(--ap-warn-bg)' : 'var(--ap-none-bg)',
                    color: (t.carryoverCount ?? 0) >= 2 ? 'var(--ap-warn-fg)' : 'var(--ap-none-fg)',
                  }}
                >
                  ↪ ×{t.carryoverCount}
                </span>
              )}
              {t.toSprintId && (
                <Link href={`/dashboard/sprints/${t.toSprintId}`} className="text-[12px] font-medium" style={{ color: 'var(--ap-accent)' }}>
                  → {t.toSprintName ?? 'Next sprint'}
                </Link>
              )}
            </span>
          )} />
        <TaskGroup title="Returned to backlog" tone="none" todos={groups.backlogged} />
        <TaskGroup title="Cancelled" tone="danger" todos={groups.cancelled} defaultOpen={groups.cancelled.length > 0} />
      </div>

      {/* Actions */}
      {(canEdit || canDelete) && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[16px] p-4"
          style={{ background: 'var(--ap-bg-raised)', border: '0.5px solid var(--ap-border)' }}
        >
          {canEdit && sprint.state === 'COMPLETED' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReopen(true)}
                disabled={!report.reopen.available}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(120,120,128,0.12)', color: 'var(--ap-accent)' }}
                title={report.reopen.available ? undefined : `Reopen window (${report.reopen.windowDays} days) has expired`}
              >
                <RotateCcw size={14} /> Reopen sprint
              </button>
              <span className="text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                {report.reopen.available
                  ? `Available for ${windowDaysLeft} more day${windowDaysLeft === 1 ? '' : 's'}`
                  : 'Reopen window expired'}
              </span>
            </div>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={cloneSprint}
              disabled={cloning}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{ color: 'var(--ap-fg-muted)' }}
            >
              <Copy size={14} /> {cloning ? 'Cloning…' : 'Clone as new sprint'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium"
              style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}
            >
              <Trash2 size={14} /> Delete sprint
            </button>
          )}
        </div>
      )}

      {/* Reopen dialog */}
      {showReopen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-[480px] rounded-[20px] p-5"
            style={{ background: 'var(--ap-bg-raised)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.25), 0 10px 20px -10px rgba(0,0,0,0.1)' }}
          >
            <h2 className="text-[15px] font-semibold">Reopen {sprint.name}?</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--ap-fg-muted)' }}>
              The sprint becomes active again. Tasks already moved stay where they are — select any you want to bring back.
            </p>
            {groups.carriedToNext.length > 0 && (
              <div className="mt-3 max-h-[200px] space-y-1 overflow-y-auto">
                {groups.carriedToNext.map(t => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] hover:bg-[var(--ap-bg-hover)]">
                    <input
                      type="checkbox"
                      className="accent-[#007AFF]"
                      checked={bringBack.has(t.id)}
                      onChange={e => {
                        const next = new Set(bringBack)
                        if (e.target.checked) next.add(t.id)
                        else next.delete(t.id)
                        setBringBack(next)
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>in {t.toSprintName}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowReopen(false)}
                className="rounded-[10px] px-3 py-1.5 text-[13px] font-medium"
                style={{ color: 'var(--ap-fg-muted)' }}>
                Cancel
              </button>
              <button type="button" onClick={reopen} disabled={reopening}
                className="rounded-[10px] px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--ap-accent)', color: '#fff' }}>
                {reopening ? 'Reopening…' : `Reopen${bringBack.size > 0 ? ` · bring back ${bringBack.size}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-[440px] rounded-[20px] p-5"
            style={{ background: 'var(--ap-bg-raised)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.25), 0 10px 20px -10px rgba(0,0,0,0.1)' }}
          >
            <h2 className="text-[15px] font-semibold">Delete {sprint.name}?</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--ap-fg-muted)' }}>
              The sprint and its board are removed. Tasks stay in the system (unassigned from any sprint), and the completion summary is retained for reporting history. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="rounded-[10px] px-3 py-1.5 text-[13px] font-medium"
                style={{ color: 'var(--ap-fg-muted)' }}>
                Keep sprint
              </button>
              <button type="button" onClick={deleteSprint} disabled={deleting}
                className="rounded-[10px] px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--ap-danger)', color: '#fff' }}>
                {deleting ? 'Deleting…' : 'Delete sprint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SprintReportClient
