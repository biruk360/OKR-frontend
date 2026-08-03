'use client'

/**
 * SprintsListClient — Phase 3 Sprints landing (Sprints v2 §4.1, §4.2).
 *
 * Sub-tabs: Active / Planning / Backlog / Completed.
 * Active & Completed: card grid with dual progress bars (tasks + goal metric).
 * Planning: cards without progress, with "Start Sprint" CTA.
 * Backlog: list of unassigned (sprintId=null) Todos with bulk move.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Calendar, Target, Layout, X } from 'lucide-react'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import AddToSprintDropdown from '@/components/sprints/AddToSprintDropdown'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'planning' | 'backlog' | 'completed'

interface Sprint {
  id: string
  name: string
  description: string | null
  state: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  startDate: string | null
  endDate: string | null
  endedAt?: string | null
  goal: string | null
  goalLabel: string | null
  goalTarget: number | null
  goalCurrent: number | null
  goalUnit: string | null
  owner: { id: string; name: string; avatar: string | null }
  endedBy?: { id: string; name: string; avatar: string | null } | null
  participants: { user: { id: string; name: string; avatar: string | null } }[]
  completionSummary?: {
    completedCount: number
    incompleteCount: number
    movedToNext: number
    movedToBacklog: number
    cancelledCount: number
    nextSprintId: string | null
  } | null
  _count: { todos: number; activities: number }
}

interface BacklogTodo {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  assignee: { id: string; name: string; avatar: string | null }
  keyResult: { id: string; title: string } | null
}

function Avatar({ name, avatar, size = 22 }: { name: string; avatar: string | null; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return avatar ? (
    <img src={avatar} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--ap-accent)' }}>
      {initials}
    </span>
  )
}

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--ap-bg-sunken)' }}>
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color ?? 'var(--ap-accent)' }} />
    </div>
  )
}

function SprintCard({ s, greyscale }: { s: Sprint; greyscale?: boolean }) {
  // Aggregates from raw counts; precise per-status from /board if needed.
  const taskTotal = s._count?.todos ?? 0
  const summary = s.completionSummary ?? null
  // FR-03 — completed sprints show the honest completion ratio from the summary.
  const isClosed = s.state === 'COMPLETED' || s.state === 'CANCELLED'
  const closedTotal = summary ? summary.completedCount + summary.incompleteCount : 0
  const closedPct = summary && closedTotal > 0 ? Math.round((summary.completedCount / closedTotal) * 100) : null
  const goalPercent = s.goalTarget && s.goalTarget > 0
    ? Math.min(100, Math.round(((s.goalCurrent ?? 0) / s.goalTarget) * 100))
    : null
  const days = s.endDate ? Math.max(0, Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000)) : null

  return (
    <Link
      href={isClosed && summary ? `/dashboard/sprints/${s.id}/report` : `/dashboard/sprints/${s.id}`}
      className={cn(
        'ap-hover-lift block rounded-[14px] border bg-card p-4 transition-all hover:shadow-md',
        greyscale && 'opacity-80 grayscale',
      )}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold leading-tight" style={{ letterSpacing: '-0.01em' }}>{s.name}</h3>
        <StatusPill status={s.state.toLowerCase().replace('_', '-')} />
      </div>
      {s.description && <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{s.description}</p>}

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        {s.startDate && s.endDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(s.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' → '}
            {new Date(s.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {days !== null && s.state === 'ACTIVE' && <span>{days}d left</span>}
        {isClosed && s.endedAt && (
          <span>
            Ended {new Date(s.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {s.endedBy?.name && <> · by {s.endedBy.name}</>}
          </span>
        )}
      </div>

      {(s.state === 'ACTIVE' || s.state === 'COMPLETED') && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Tasks</span>
              <span className="tabular-nums">
                {summary ? `${summary.completedCount}/${closedTotal} · ${closedPct ?? 0}%` : taskTotal}
              </span>
            </div>
            <div className="mt-1">
              <ProgressBar
                percent={summary ? (closedPct ?? 0) : (taskTotal === 0 ? 0 : 100)}
                color="var(--ap-green)"
              />
            </div>
          </div>
          {goalPercent !== null && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{s.goalLabel ?? 'Goal'}</span>
                <span className="tabular-nums">{goalPercent}%</span>
              </div>
              <div className="mt-1"><ProgressBar percent={goalPercent} /></div>
            </div>
          )}
        </div>
      )}

      {/* Outcome chips (FR-03) */}
      {summary && (summary.movedToNext > 0 || summary.movedToBacklog > 0 || summary.cancelledCount > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {summary.movedToNext > 0 && (
            <span className="rounded-[6px] px-1.5 py-px text-[10px] font-semibold" style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
              {summary.movedToNext} carried
            </span>
          )}
          {summary.movedToBacklog > 0 && (
            <span className="rounded-[6px] px-1.5 py-px text-[10px] font-semibold" style={{ background: 'var(--ap-none-bg)', color: 'var(--ap-none-fg)' }}>
              {summary.movedToBacklog} backlog
            </span>
          )}
          {summary.cancelledCount > 0 && (
            <span className="rounded-[6px] px-1.5 py-px text-[10px] font-semibold" style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}>
              {summary.cancelledCount} cancelled
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1">
          {s.participants.slice(0, 4).map((p) => <Avatar key={p.user.id} name={p.user.name} avatar={p.user.avatar} size={20} />)}
          {s.participants.length > 4 && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
              +{s.participants.length - 4}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--ap-accent)' }}>
          {isClosed && summary ? 'View Report →' : 'Open Board →'}
        </span>
      </div>
    </Link>
  )
}

function BacklogList({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSprintId, setBulkSprintId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sprints-backlog'],
    queryFn: async () => {
      const res = await fetch('/api/todos?sprintId=null&limit=200')
      const json = await res.json()
      const items = Array.isArray(json?.data) ? json.data : json?.data?.items ?? []
      return items as BacklogTodo[]
    },
    refetchOnWindowFocus: false,
  })

  async function moveBulk() {
    if (selected.size === 0 || !bulkSprintId) return
    try {
      await Promise.all(Array.from(selected).map((id) =>
        fetch(`/api/todos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sprintId: bulkSprintId }),
        }),
      ))
      toast.success(`Moved ${selected.size} task(s) to sprint`)
      setSelected(new Set())
      setBulkSprintId(null)
      qc.invalidateQueries({ queryKey: ['sprints-backlog'] })
    } catch {
      toast.error('Failed to move tasks')
    }
  }

  if (isLoading) return <p className="p-6 text-[13px] text-muted-foreground">Loading backlog…</p>

  const todos = data ?? []
  if (todos.length === 0) {
    return <EmptyState title="No tasks in the backlog." description="Tasks not yet assigned to a sprint will appear here." />
  }

  return (
    <div className="rounded-[14px] border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
        {todos.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-[12px] hover:bg-muted/30">
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={(e) => {
                setSelected((s) => {
                  const n = new Set(s)
                  if (e.target.checked) n.add(t.id)
                  else n.delete(t.id)
                  return n
                })
              }}
            />
            <span className="flex-1 truncate font-medium">{t.title}</span>
            {t.keyResult && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
              >
                <Target className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{t.keyResult.title}</span>
              </span>
            )}
            {t.dueDate && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            <Avatar name={t.assignee.name} avatar={t.assignee.avatar} size={20} />
          </label>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-card px-4 py-2"
          style={{ borderColor: 'var(--ap-border)' }}>
          <span className="text-[12px] font-semibold">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-[220px]">
              <AddToSprintDropdown value={bulkSprintId} onChange={setBulkSprintId} placeholder="Move to sprint…" />
            </div>
            <button
              type="button"
              disabled={!bulkSprintId}
              onClick={moveBulk}
              className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--ap-accent)' }}
            >
              Move
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SprintsListClient({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('active')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const createIntent = useCreateIntentStore((s) => s.intent)
  const clearCreateIntent = useCreateIntentStore((s) => s.clear)
  useEffect(() => {
    if (createIntent === 'sprint') {
      setCreating(true)
      clearCreateIntent()
    }
  }, [createIntent, clearCreateIntent])

  const stateFilter: Record<Tab, string | null> = {
    active: 'ACTIVE', planning: 'PLANNING', completed: 'COMPLETED', backlog: null,
  }

  const { data: sprints, refetch, isLoading } = useQuery({
    queryKey: ['sprints-list', tab],
    queryFn: async () => {
      if (tab === 'backlog') return [] as Sprint[]
      const res = await fetch(`/api/sprints?state=${stateFilter[tab]}`)
      const json = await res.json()
      const items: any[] = Array.isArray(json?.data) ? json.data : json?.data?.items ?? []
      return items as Sprint[]
    },
    enabled: tab !== 'backlog',
    refetchOnWindowFocus: false,
  })

  async function createSprint() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Sprint created')
      setName('')
      setCreating(false)
      router.push(`/dashboard/sprints/${data.data.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create sprint')
    } finally {
      setSubmitting(false)
    }
  }

  const list = sprints ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>Sprints</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white"
            style={{ background: 'var(--ap-accent)' }}
          >
            <Plus className="h-3.5 w-3.5" /> New sprint
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 rounded-[10px] border p-0.5 text-[12px]" style={{ borderColor: 'var(--ap-border)', width: 'fit-content' }}>
        {(['active', 'planning', 'backlog', 'completed'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-[8px] px-3 py-1 capitalize',
              tab === t ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {creating && (
        <div className="rounded-[14px] border bg-card p-3" style={{ borderColor: 'var(--ap-border)' }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createSprint()
              if (e.key === 'Escape') { setCreating(false); setName('') }
            }}
            placeholder="Sprint name (e.g. Marketing Q2 W14)"
            className="w-full rounded-[10px] border bg-card px-3 py-1.5 text-[13px] outline-none"
            style={{ borderColor: 'var(--ap-border)' }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={createSprint} disabled={!name.trim() || submitting}
              className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--ap-accent)' }}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => { setCreating(false); setName('') }}
              className="rounded-[10px] p-1.5 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tab === 'backlog' ? (
        <BacklogList currentUserId={currentUserId} />
      ) : isLoading ? (
        <p className="p-6 text-[13px] text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Layout}
          title={tab === 'active' ? 'No sprints yet' : `No ${tab} sprints`}
          description="Sprints help your team focus work into 1–4 week cycles."
          action={tab === 'active' ? { label: 'Create Sprint', onClick: () => setCreating(true) } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => <SprintCard key={s.id} s={s} greyscale={tab === 'completed'} />)}
        </div>
      )}
    </div>
  )
}
