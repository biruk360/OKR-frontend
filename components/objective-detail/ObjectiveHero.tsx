'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Building2, Users as UsersIcon, Clock, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fromDbStatus, type ComputedStatus } from '@/lib/okr/status'
import { cn } from '@/lib/utils'

interface OwnerSummary {
  objectiveCount: number
  krCount: number
  avgProgress: number
}

interface Props {
  objective: {
    id: string
    title: string
    description?: string | null
    level: string
    progress: number
    goalStatus: string
    confidence?: number | null
    owner: { id: string; name: string; avatar?: string | null }
    timeframe: { name: string; startDate: Date | string; endDate: Date | string }
    department?: { name: string } | null
    parentObjective?: { id: string; title: string } | null
    isPrivate: boolean
    keyResults?: Array<{ confidence: string; status: string }>
  }
  expectedProgress: number
  daysLeft: number
  activeKrCount: number
  unassignedKrCount: number
  weekLabel: string | null
  ownerSummary?: OwnerSummary
  onCheckIn?: () => void
}

function levelLabel(level: string): string {
  switch (level) {
    case 'COMPANY': return 'Company'
    case 'DEPARTMENT': return 'Department'
    case 'INDIVIDUAL': return 'Individual'
    default: return level
  }
}

function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

/* iOS status pill — soft tint + dot prefix */
function StatusPill({ status }: { status: ComputedStatus }) {
  const map: Record<ComputedStatus, { label: string; bg: string; fg: string; dot: string }> = {
    'on-track':   { label: 'On track',  bg: 'rgba(52,199,89,0.12)',  fg: 'var(--ap-green)',  dot: 'var(--ap-green)' },
    'at-risk':    { label: 'At risk',   bg: 'rgba(255,149,0,0.12)',  fg: 'var(--ap-orange)', dot: 'var(--ap-orange)' },
    'off-track':  { label: 'Off track', bg: 'rgba(255,59,48,0.12)',  fg: 'var(--ap-red)',    dot: 'var(--ap-red)' },
    'no-owner':   { label: 'Unassigned',bg: 'rgba(255,59,48,0.12)',  fg: 'var(--ap-red)',    dot: 'var(--ap-red)' },
    'completed':  { label: 'Done',      bg: 'rgba(0,122,255,0.12)',  fg: 'var(--ap-accent)', dot: 'var(--ap-accent)' },
  }
  const c = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

/* ▲/▼ pace chip */
function PaceChip({ delta }: { delta: number }) {
  const positive = delta >= 0
  const bg = positive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)'
  const fg = positive ? 'var(--ap-green)' : 'var(--ap-red)'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ background: bg, color: fg }}
    >
      {positive ? '▲' : '▼'}{Math.abs(delta)}pt
    </span>
  )
}

/* SVG progress ring, status-colored */
function ProgressRing({ value, status, size = 64 }: { value: number; status: ComputedStatus; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(Math.max(value, 0), 100)
  const offset = c - (pct / 100) * c
  const color =
    status === 'on-track' || status === 'completed' ? 'var(--ap-green)'
    : status === 'at-risk' ? 'var(--ap-orange)'
    : 'var(--ap-red)'
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--ap-kr-bar-bg)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold tabular-nums"
        style={{ letterSpacing: '-0.02em' }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  )
}

function OwnerAvatar({ owner, summary }: { owner: Props['objective']['owner']; summary?: OwnerSummary }) {
  const [showCard, setShowCard] = useState(false)
  const initials = initialsOf(owner.name)

  return (
    <div className="relative inline-block" onMouseEnter={() => setShowCard(true)} onMouseLeave={() => setShowCard(false)}>
      <Link href={`/dashboard/org/users/${owner.id}`} className="block">
        {owner.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={owner.avatar} alt={owner.name} className="size-7 rounded-full object-cover" />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: 'var(--ap-accent)' }}>
            {initials}
          </span>
        )}
      </Link>
      {showCard && summary && (
        <div className="absolute left-9 top-0 z-50 w-56 rounded-[14px] border bg-card p-3 shadow-lg"
          style={{ borderColor: 'var(--ap-border)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            {owner.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={owner.avatar} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: 'var(--ap-accent)' }}>{initials}</span>
            )}
            <div>
              <p className="text-[13px] font-semibold">{owner.name}</p>
              <p className="text-[11px] text-muted-foreground">Objective Owner</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-[10px] p-2" style={{ background: 'var(--ap-bg-sunken)' }}>
            <div className="text-center">
              <p className="text-[13px] font-semibold tabular-nums">{summary.objectiveCount}</p>
              <p className="text-[10px] text-muted-foreground">OKRs</p>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold tabular-nums">{summary.krCount}</p>
              <p className="text-[10px] text-muted-foreground">KRs</p>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold tabular-nums">{summary.avgProgress}%</p>
              <p className="text-[10px] text-muted-foreground">Avg</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ObjectiveHero({
  objective, expectedProgress, daysLeft, activeKrCount, unassignedKrCount, weekLabel, ownerSummary, onCheckIn,
}: Props) {
  const status = fromDbStatus(objective.goalStatus)
  const gap = Math.round(objective.progress - expectedProgress)

  // KR confidence buckets
  const krs = objective.keyResults ?? []
  const buckets = {
    on: krs.filter(k => k.confidence === 'ON_TRACK').length,
    risk: krs.filter(k => k.confidence === 'AT_RISK').length,
    off: krs.filter(k => k.confidence === 'OFF_TRACK').length,
  }
  const confidence = typeof objective.confidence === 'number'
    ? Math.round(objective.confidence)
    : Math.max(0, Math.min(100, 50 + gap))

  const cycleEnd = new Date(objective.timeframe.endDate)
  const deadlineLabel = cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="rounded-[14px] border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
      {/* Top: chip row */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
            {levelLabel(objective.level)}
          </span>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 font-bold"
            style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
            OBJ
          </span>
          <span className="text-muted-foreground tabular-nums">{objective.id.slice(-6).toUpperCase()}</span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Calendar className="size-3" />{objective.timeframe.name}
          </span>
          {objective.department && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Building2 className="size-3" />{objective.department.name}
              </span>
            </>
          )}
          {objective.isPrivate && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
              style={{ background: 'rgba(255,149,0,0.12)', color: 'var(--ap-orange)' }}>
              Private
            </span>
          )}
          {objective.parentObjective && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
              Aligned to{' '}
              <Link href={`/dashboard/objectives/${objective.parentObjective.id}`} className="font-semibold hover:underline">
                {objective.parentObjective.title.length > 24
                  ? objective.parentObjective.title.slice(0, 24) + '…'
                  : objective.parentObjective.title}
              </Link>
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          className="text-[24px] font-semibold leading-tight"
          style={{ letterSpacing: '-0.02em', textWrap: 'balance', maxWidth: 720 } as any}
        >
          {objective.title}
        </h1>

        {objective.description && (
          <p
            className="mt-2 text-[13px] text-muted-foreground"
            style={{ maxWidth: 720, textWrap: 'pretty' } as any}
          >
            {objective.description}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <OwnerAvatar owner={objective.owner} summary={ownerSummary} />
            <span className="font-medium" style={{ color: 'var(--ap-fg)' }}>{objective.owner.name}</span>
            <span className="text-[11px] text-muted-foreground">· owner</span>
          </div>
          <span className="hidden sm:inline-block h-3.5 w-px" style={{ background: 'var(--ap-border)' }} />
          <div className="flex items-center gap-1.5">
            <UsersIcon className="size-3.5" />
            <span>{(activeKrCount > 0 ? activeKrCount : 0)} contributors</span>
          </div>
          <span className="hidden sm:inline-block h-3.5 w-px" style={{ background: 'var(--ap-border)' }} />
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>Due {deadlineLabel} · {daysLeft > 0 ? `${daysLeft}d left` : 'past due'}</span>
          </div>
          {weekLabel && (
            <>
              <span className="hidden sm:inline-block h-3.5 w-px" style={{ background: 'var(--ap-border)' }} />
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span>{weekLabel}</span>
              </div>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {onCheckIn && (
              <Button size="sm" onClick={onCheckIn} className="rounded-[10px] h-8 px-3 text-[12px]">
                Check in
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 5-stat strip */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 border-t"
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
      >
        {/* Progress */}
        <div className="flex items-center gap-3 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <ProgressRing value={objective.progress} status={status} size={56} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
            <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">Expected {Math.round(expectedProgress)}%</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <PaceChip delta={gap} />
          </div>
        </div>

        {/* Confidence */}
        <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
          <p className="text-[18px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
            {confidence}<span className="text-[12px] text-muted-foreground font-normal">/100</span>
          </p>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
            <div className="h-full rounded-full"
              style={{
                width: `${confidence}%`,
                background: confidence >= 70 ? 'var(--ap-green)' : confidence >= 40 ? 'var(--ap-orange)' : 'var(--ap-red)',
              }} />
          </div>
        </div>

        {/* KRs */}
        <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Key Results</p>
          <p className="text-[18px] font-semibold tabular-nums leading-none">{activeKrCount}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: 'var(--ap-green)' }} />{buckets.on}</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: 'var(--ap-orange)' }} />{buckets.risk}</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: 'var(--ap-red)' }} />{buckets.off}</span>
            {unassignedKrCount > 0 && (
              <span style={{ color: 'var(--ap-red)' }}>· {unassignedKrCount} unassigned</span>
            )}
          </div>
        </div>

        {/* Deadline */}
        <div className="flex flex-col justify-center gap-1.5 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Deadline</p>
          <p className={cn('text-[18px] font-semibold tabular-nums leading-none')}
            style={{ color: daysLeft < 7 ? 'var(--ap-red)' : daysLeft < 30 ? 'var(--ap-orange)' : 'var(--ap-fg)' }}>
            {daysLeft > 0 ? `${daysLeft}d` : 'Past due'}
          </p>
          <p className="text-[11px] text-muted-foreground">{deadlineLabel}{weekLabel ? ` · ${weekLabel}` : ''}</p>
        </div>
      </div>
    </div>
  )
}
