'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Share2, MoreHorizontal, Flag, ExternalLink,
  Target, CheckSquare, TrendingUp, ChevronRight,
  User, Calendar, Building2, Link2, Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjOwner { id: string; name: string | null; avatar?: string | null }
interface ObjTimeframe { id: string; name: string; startDate?: string; endDate?: string }
interface ObjDepartment { id: string; name: string }
interface ObjParent { id: string; title: string; progress?: number }
interface ObjKR {
  id: string; title: string; progress: number; confidence?: string
  currentValue?: number; targetValue?: number; unit?: string
  owner?: ObjOwner
}
interface ObjContributor { user: ObjOwner }

interface ObjectiveDetail {
  id: string; title: string; level: string; status: string
  progress: number; confidence?: string; description?: string
  owner: ObjOwner; timeframe: ObjTimeframe; department?: ObjDepartment
  parentObjective?: ObjParent; contributors?: ObjContributor[]
  keyResults?: ObjKR[]
  _count?: { keyResults: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONF_TONE: Record<string, string> = { ON_TRACK: 'ontrack', AT_RISK: 'atrisk', OFF_TRACK: 'offtrack' }
const CONF_LABEL: Record<string, string> = { ON_TRACK: 'On Track', AT_RISK: 'At Risk', OFF_TRACK: 'Off Track' }

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

function CircleProgress({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
  const r = 36; const circ = 2 * Math.PI * r
  const filled = (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center">
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--ap-border-strong)" strokeWidth="6" />
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--ap-accent)" strokeWidth="6"
            strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
            transform="rotate(-90 44 44)" />
        </svg>
        <span className="absolute text-lg font-bold" style={{ color: 'var(--ap-fg)' }}>
          {value}%
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{label}</span>
      {sublabel && <span className="text-xs" style={{ color: 'var(--ap-fg-muted)' }}>{sublabel}</span>}
    </div>
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

// ─── KR Row ───────────────────────────────────────────────────────────────────

function KrRow({ kr, onClick }: { kr: ObjKR; onClick: () => void }) {
  const pct = Math.round(kr.progress ?? 0)
  const tone = CONF_TONE[kr.confidence ?? ''] ?? 'none'
  return (
    <button
      type="button"
      onClick={onClick}
      className="ap-hover-lift flex w-full items-start gap-3 rounded-[var(--ap-radius-sm)] p-3 text-left transition-all"
      style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)', marginBottom: 8 }}
    >
      <span className="ap-status-dot mt-1 shrink-0" data-tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--ap-fg)' }}>{kr.title}</p>
        {kr.targetValue !== undefined && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            {kr.currentValue ?? 0} / {kr.targetValue} {kr.unit ?? '%'}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--ap-border-strong)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--ap-accent)' }} />
          </div>
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{pct}%</span>
        </div>
      </div>
      {kr.owner && <Avatar name={kr.owner.name} />}
      <ChevronRight className="size-3.5 shrink-0 self-center" style={{ color: 'var(--ap-fg-subtle)' }} />
    </button>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  objectiveId: string | null
  onClose: () => void
  onOpenKr?: (krId: string) => void
}

export function ObjectiveDetailModal({ objectiveId, onClose, onOpenKr }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ObjectiveDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!objectiveId) { setData(null); return }
    setLoading(true)
    fetch(`/api/objectives/${objectiveId}`)
      .then((r) => r.json())
      .then((j) => setData(j.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [objectiveId])

  if (!objectiveId) return null

  const krCount = data?.keyResults?.length ?? 0
  const initCount = data?.keyResults?.reduce((s, kr) => s + ((kr as any)._count?.todos ?? 0), 0) ?? 0
  const avgProgress = data?.progress ?? 0
  const ncs = data?.confidence === 'ON_TRACK' ? 85 : data?.confidence === 'AT_RISK' ? 45 : data?.confidence === 'OFF_TRACK' ? 15 : 0

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
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>
              {data?.timeframe?.name ?? 'Objective'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/objectives/${objectiveId}`)}
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

        {/* ── Body: 2 col ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left (main) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="size-6 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
              </div>
            ) : data ? (
              <div className="space-y-5">
                {/* Title */}
                <div className="flex items-start gap-2.5">
                  <Flag className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--ap-accent)' }} />
                  <h2 className="text-[20px] font-semibold leading-snug tracking-tight" style={{ color: 'var(--ap-fg)' }}>
                    {data.title}
                  </h2>
                </div>

                {/* KPI donuts */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: avgProgress, label: 'Key Results', sublabel: `${krCount} total` },
                    { value: initCount > 0 ? Math.round((initCount / Math.max(krCount * 3, 1)) * 100) : 0, label: 'Initiatives', sublabel: `${initCount}/—` },
                    { value: ncs, label: 'Net Confidence Score', sublabel: `${ncs} NCS` },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-center rounded-[var(--ap-radius-md)] py-5"
                      style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-bg-raised)' }}
                    >
                      <CircleProgress value={item.value} label={item.label} sublabel={item.sublabel} />
                    </div>
                  ))}
                </div>

                {/* Description */}
                {data.description && (
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ap-fg-muted)' }}>
                    {data.description}
                  </p>
                )}

                {/* Key Results */}
                {data.keyResults && data.keyResults.length > 0 && (
                  <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                      Key Results ({krCount})
                    </p>
                    <div>
                      {data.keyResults.map((kr) => (
                        <KrRow
                          key={kr.id}
                          kr={kr}
                          onClick={() => onOpenKr?.(kr.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>Failed to load objective.</p>
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
                {/* Details */}
                <SectionCard title="Details">
                  <div className="space-y-0">
                    <MetaRow icon={User} label="Owner">
                      <span className="flex items-center gap-1.5">
                        <Avatar name={data.owner?.name} size="sm" />
                        {data.owner?.name ?? '—'}
                      </span>
                    </MetaRow>
                    <MetaRow icon={Calendar} label="Timeframe">
                      {data.timeframe?.name ?? '—'}
                    </MetaRow>
                    {data.department && (
                      <MetaRow icon={Building2} label="Team">
                        {data.department.name}
                      </MetaRow>
                    )}
                    {data.parentObjective && (
                      <MetaRow icon={Target} label="Parent">
                        <span className="truncate">{data.parentObjective.title}</span>
                      </MetaRow>
                    )}
                    <MetaRow icon={TrendingUp} label="Level">
                      <span className="capitalize">{data.level?.toLowerCase()}</span>
                    </MetaRow>
                    <div className="flex items-center gap-3 py-2">
                      <TrendingUp className="size-4 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
                      <span className="w-24 shrink-0 text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>Status</span>
                      <StatusPill confidence={data.confidence} />
                    </div>
                  </div>
                </SectionCard>

                {/* Contributors */}
                {data.contributors && data.contributors.length > 0 && (
                  <SectionCard title="Contributors">
                    <div className="flex flex-wrap gap-2">
                      {data.contributors.map((c) => (
                        <span key={c.user.id} className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: 'var(--ap-border)', color: 'var(--ap-fg-muted)' }}>
                          <Avatar name={c.user.name} size="sm" />
                          {c.user.name}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Relationships */}
                <SectionCard title="Relationships">
                  <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>There are no dependencies.</p>
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
