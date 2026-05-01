'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, ExternalLink, ChevronRight, Target,
  User, Calendar, Tag, Zap, TrendingUp, CheckSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KrOwner { id: string; name: string | null; avatar?: string | null }
interface KrObjective { id: string; title: string; level: string }
interface KrCheckIn {
  id: string; value: number; note?: string | null; createdAt: string
  author?: { id: string; name: string | null }
}
interface KrTodo {
  id: string; title: string; status: string
  assignee?: { id: string; name: string | null }
}

interface KrDetail {
  id: string; title: string; description?: string | null
  startValue: number; targetValue: number; currentValue: number; unit?: string | null
  confidence?: string; progress: number
  owner: KrOwner
  objective: KrObjective & { timeframe?: { name: string; startDate?: string; endDate?: string } }
  todos?: KrTodo[]
  checkIns?: KrCheckIn[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONF_TONE: Record<string, string> = { ON_TRACK: 'ontrack', AT_RISK: 'atrisk', OFF_TRACK: 'offtrack' }
const CONF_LABEL: Record<string, string> = { ON_TRACK: 'On Track', AT_RISK: 'At Risk', OFF_TRACK: 'Off Track' }
const TODO_TONE: Record<string, string> = {
  COMPLETED: 'ontrack', IN_PROGRESS: 'accent', PENDING: 'none', CANCELLED: 'none',
}
const TODO_LABEL: Record<string, string> = {
  COMPLETED: 'Done', IN_PROGRESS: 'In Progress', PENDING: 'Pending', CANCELLED: 'Cancelled',
}

function StatusPill({ confidence }: { confidence?: string }) {
  return (
    <span className="ap-status-pill" data-tone={CONF_TONE[confidence ?? ''] ?? 'none'}>
      {CONF_LABEL[confidence ?? ''] ?? 'Pending'}
    </span>
  )
}

function Avatar({ name, size = 'sm' }: { name: string | null | undefined; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-[13px]'
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-bold', sz)}
      style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
    >
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--ap-radius-md)]" style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}>
      {title && (
        <div className="border-b px-4 py-2.5" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{title}</p>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

function MetaRow({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--ap-border)' }}>
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
      <span className="w-24 shrink-0 text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>{label}</span>
      <div className="flex-1 text-[13px]" style={{ color: 'var(--ap-fg)' }}>{children}</div>
    </div>
  )
}

// ─── Progress bar with goal labels ───────────────────────────────────────────

function GoalBar({ start, current, target, unit }: { start: number; current: number; target: number; unit?: string | null }) {
  const range = Math.max(target - start, 1)
  const pct = Math.min(Math.max(((current - start) / range) * 100, 0), 100)
  const u = unit ?? ''
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
        <span>Start: {start}{u}</span>
        <span>Current: <span style={{ color: 'var(--ap-accent)', fontWeight: 600 }}>{current}{u}</span></span>
        <span>Target: {target}{u}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full" style={{ background: 'var(--ap-border-strong)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--ap-accent)' }} />
      </div>
      <div className="text-right text-[11px] font-semibold" style={{ color: 'var(--ap-accent)' }}>{Math.round(pct)}% complete</div>
    </div>
  )
}

// ─── Sparkline chart (SVG) ────────────────────────────────────────────────────

function ProgressSparkline({ checkIns, target }: { checkIns: KrCheckIn[]; target: number }) {
  if (checkIns.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Not enough check-ins to show a trend.</p>
      </div>
    )
  }
  const W = 400; const H = 80; const PAD = 8
  const vals = checkIns.map((c) => c.value)
  const min = 0; const max = Math.max(target, ...vals)
  const range = Math.max(max - min, 1)
  const pts = checkIns.map((c, i) => {
    const x = PAD + (i / (checkIns.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((c.value - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })
  const targetY = H - PAD - ((target - min) / range) * (H - PAD * 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <line x1={PAD} y1={targetY} x2={W - PAD} y2={targetY} stroke="var(--ap-border-strong)" strokeWidth="1" strokeDasharray="4 3" />
      <polyline fill="none" stroke="var(--ap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
      {checkIns.map((c, i) => {
        const [x, y] = pts[i].split(',').map(Number)
        return <circle key={c.id} cx={x} cy={y} r="3" fill="var(--ap-accent)" />
      })}
    </svg>
  )
}

// ─── Initiative (Todo) row ────────────────────────────────────────────────────

function InitiativeRow({ todo }: { todo: KrTodo }) {
  const tone = TODO_TONE[todo.status] ?? 'none'
  const label = TODO_LABEL[todo.status] ?? todo.status
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: '1px solid var(--ap-border)' }}
    >
      <span className="ap-status-dot shrink-0" data-tone={tone} />
      <p className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--ap-fg)' }}>{todo.title}</p>
      {todo.assignee && <Avatar name={todo.assignee.name} size="sm" />}
      <span className="ap-status-pill shrink-0" data-tone={tone}>{label}</span>
    </div>
  )
}

// ─── Check-in row ─────────────────────────────────────────────────────────────

function CheckInRow({ ci }: { ci: KrCheckIn }) {
  const dateStr = (() => { try { return format(new Date(ci.createdAt), 'MMM d, yyyy') } catch { return ci.createdAt } })()
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--ap-border)' }}>
      {ci.author && <Avatar name={ci.author.name} size="sm" />}
      <div className="min-w-0 flex-1">
        {ci.note && <p className="text-[13px] leading-snug" style={{ color: 'var(--ap-fg)' }}>{ci.note}</p>}
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>{dateStr} · value: {ci.value}</p>
      </div>
    </div>
  )
}

// ─── AI Quick Mode ────────────────────────────────────────────────────────────

const AI_PROMPTS = [
  'Summarize progress',
  'Identify blockers',
  'Suggest next steps',
  'Compare to targets',
]

function QuickAiMode() {
  return (
    <SectionCard title="Quick AI Mode">
      <div className="flex flex-wrap gap-1.5">
        {AI_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{ background: 'rgba(0,122,255,0.10)', color: 'var(--ap-accent)', border: '1px solid rgba(0,122,255,0.2)' }}
          >
            <Zap className="mr-1 inline size-2.5" />
            {p}
          </button>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  krId: string | null
  onClose: () => void
}

export function KeyResultDetailModal({ krId, onClose }: Props) {
  const router = useRouter()
  const [data, setData] = useState<KrDetail | null>(null)
  const [checkIns, setCheckIns] = useState<KrCheckIn[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!krId) { setData(null); setCheckIns([]); return }
    setLoading(true)
    Promise.all([
      fetch(`/api/keyresults/${krId}`).then((r) => r.json()),
      fetch(`/api/keyresults/${krId}/check-ins`).then((r) => r.json()),
    ])
      .then(([krRes, ciRes]) => {
        setData(krRes.data ?? null)
        setCheckIns(Array.isArray(ciRes.data) ? ciRes.data : [])
      })
      .catch(() => { setData(null); setCheckIns([]) })
      .finally(() => setLoading(false))
  }, [krId])

  if (!krId) return null

  const todos = data?.todos ?? []
  const recentCheckIns = [...checkIns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden"
        style={{
          background: 'var(--ap-bg)',
          borderRadius: 'var(--ap-radius-lg)',
          boxShadow: 'var(--ap-shadow-lg)',
          border: '1px solid var(--ap-border)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-center gap-3 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
        >
          {/* Breadcrumb */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            {data?.objective && (
              <>
                <Target className="size-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} />
                <span className="truncate max-w-[200px]">{data.objective.title}</span>
                <ChevronRight className="size-3 shrink-0" />
              </>
            )}
            <span className="font-medium" style={{ color: 'var(--ap-fg-muted)' }}>Key Result</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/objectives?kr=${krId}`)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-85"
              style={{ background: 'var(--ap-accent)' }}
            >
              <ExternalLink className="size-3.5" />
              Open full page
            </button>
            <button type="button" className="rounded-lg p-1.5 transition-colors hover:bg-black/8" onClick={onClose}>
              <X className="size-4" style={{ color: 'var(--ap-fg-muted)' }} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left main */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="size-6 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
              </div>
            ) : data ? (
              <div className="space-y-5">
                {/* Title + status */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusPill confidence={data.confidence} />
                    </div>
                    <h2 className="text-[20px] font-semibold leading-snug tracking-tight" style={{ color: 'var(--ap-fg)' }}>
                      {data.title}
                    </h2>
                    {data.description && (
                      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ap-fg-muted)' }}>
                        {data.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Goal bar */}
                <div
                  className="rounded-[var(--ap-radius-md)] p-4"
                  style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}
                >
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                    Goal Progress
                  </p>
                  <GoalBar
                    start={data.startValue}
                    current={data.currentValue}
                    target={data.targetValue}
                    unit={data.unit}
                  />
                </div>

                {/* Progress chart */}
                {checkIns.length > 0 && (
                  <div
                    className="rounded-[var(--ap-radius-md)] p-4"
                    style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}
                  >
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                      Progress Over Time
                    </p>
                    <ProgressSparkline checkIns={[...checkIns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())} target={data.targetValue} />
                  </div>
                )}

                {/* Initiatives */}
                {todos.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                      Initiatives ({todos.length})
                    </p>
                    <div
                      className="rounded-[var(--ap-radius-md)] overflow-hidden"
                      style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}
                    >
                      {todos.map((t) => (
                        <div key={t.id} className="px-4">
                          <InitiativeRow todo={t} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Check-in timeline */}
                {recentCheckIns.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                      Recent Check-ins
                    </p>
                    <div
                      className="rounded-[var(--ap-radius-md)] overflow-hidden"
                      style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}
                    >
                      {recentCheckIns.map((ci) => (
                        <div key={ci.id} className="px-4">
                          <CheckInRow ci={ci} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>Failed to load key result.</p>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div
            className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l p-4"
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg)' }}
          >
            {data && (
              <>
                {/* Quick AI */}
                <QuickAiMode />

                {/* Details */}
                <SectionCard title="Details">
                  <div className="space-y-0">
                    <MetaRow icon={User} label="Owner">
                      <span className="flex items-center gap-1.5">
                        <Avatar name={data.owner?.name} size="sm" />
                        {data.owner?.name ?? '—'}
                      </span>
                    </MetaRow>
                    <MetaRow icon={Target} label="Objective">
                      <span className="truncate text-[12px]">{data.objective?.title ?? '—'}</span>
                    </MetaRow>
                    {data.objective?.timeframe && (
                      <MetaRow icon={Calendar} label="Timeframe">
                        {data.objective.timeframe.name}
                      </MetaRow>
                    )}
                    <MetaRow icon={TrendingUp} label="Confidence">
                      <StatusPill confidence={data.confidence} />
                    </MetaRow>
                    <div className="flex items-center gap-3 py-2">
                      <CheckSquare className="size-4 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
                      <span className="w-24 shrink-0 text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>Initiatives</span>
                      <span className="text-[13px]" style={{ color: 'var(--ap-fg)' }}>{todos.length}</span>
                    </div>
                  </div>
                </SectionCard>

                {/* Relationships */}
                <SectionCard title="Relationships">
                  <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>No dependencies.</p>
                </SectionCard>

                {/* Tags */}
                <SectionCard title="Tags">
                  <div className="flex items-center gap-1.5">
                    <Tag className="size-3.5" style={{ color: 'var(--ap-fg-subtle)' }} />
                    <span className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>None</span>
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
