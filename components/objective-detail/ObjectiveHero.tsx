'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { statusBadgeClass, statusLabel, fromDbStatus } from '@/lib/okr/status'
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
    owner: { id: string; name: string; avatar?: string | null }
    timeframe: { name: string; startDate: Date | string; endDate: Date | string }
    department?: { name: string } | null
    parentObjective?: { id: string; title: string } | null
    isPrivate: boolean
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

function OwnerAvatar({ owner, summary }: { owner: Props['objective']['owner']; summary?: OwnerSummary }) {
  const [showCard, setShowCard] = useState(false)
  const initials = owner.name
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div className="relative" onMouseEnter={() => setShowCard(true)} onMouseLeave={() => setShowCard(false)}>
      <Link href={`/dashboard/org/users/${owner.id}`} className="block">
        {owner.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={owner.avatar} alt={owner.name} className="size-10 rounded-full object-cover border-2 border-card ring-2 ring-border" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white border-2 border-card ring-2 ring-border">
            {initials}
          </span>
        )}
      </Link>

      {/* Hover card */}
      {showCard && summary && (
        <div className="absolute left-12 top-0 z-50 w-56 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <div className="flex items-center gap-2.5 mb-2">
            {owner.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={owner.avatar} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">{initials}</span>
            )}
            <div>
              <p className="text-sm font-semibold">{owner.name}</p>
              <p className="text-[11px] text-muted-foreground">Objective Owner</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-2">
            <div className="text-center">
              <p className="text-sm font-bold tabular-nums">{summary.objectiveCount}</p>
              <p className="text-[10px] text-muted-foreground">OKRs</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold tabular-nums">{summary.krCount}</p>
              <p className="text-[10px] text-muted-foreground">KRs</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold tabular-nums">{summary.avgProgress}%</p>
              <p className="text-[10px] text-muted-foreground">Avg</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ObjectiveHero({ objective, expectedProgress, daysLeft, activeKrCount, unassignedKrCount, weekLabel, ownerSummary, onCheckIn }: Props) {
  const status = fromDbStatus(objective.goalStatus)
  const gap = objective.progress - expectedProgress

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header: avatar + badges + title */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-4">
          {/* Owner avatar */}
          <OwnerAvatar owner={objective.owner} summary={ownerSummary} />

          <div className="min-w-0 flex-1">
            {/* Badge row: Level → OBJ → Private → Timeframe */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {levelLabel(objective.level)}
              </span>
              <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                OBJ
              </span>
              {objective.isPrivate && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Private
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Calendar className="size-2.5" />
                {objective.timeframe.name}
              </span>
              {objective.department && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Building2 className="size-2.5" />
                  {objective.department.name}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-lg font-semibold leading-snug">{objective.title}</h1>

            {/* Alignment */}
            {objective.parentObjective && (
              <p className="mt-1 text-xs text-muted-foreground">
                Aligned to{' '}
                <Link href={`/dashboard/objectives/${objective.parentObjective.id}/v2`} className="text-primary-500 hover:underline">
                  {objective.parentObjective.title}
                </Link>
              </p>
            )}

            {objective.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{objective.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border divide-x divide-border bg-muted/30">
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
          <p className="text-2xl font-bold tabular-nums mt-0.5">{Math.round(objective.progress)}%</p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(objective.progress, 100)}%`,
                backgroundColor: status === 'on-track' ? '#059669' : status === 'at-risk' ? '#d97706' : '#dc2626',
              }}
            />
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <Badge className={cn('mt-1', statusBadgeClass(status))}>{statusLabel(status)}</Badge>
          <p className="text-[11px] text-muted-foreground mt-1">
            {gap >= 0 ? `+${gap}pt ahead` : `${gap}pt behind`}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key Results</p>
          <p className="text-2xl font-bold tabular-nums mt-0.5">{activeKrCount}</p>
          {unassignedKrCount > 0 && (
            <p className="text-[11px] text-red-600 font-medium">{unassignedKrCount} unassigned</p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deadline</p>
          <p className={cn('text-2xl font-bold tabular-nums mt-0.5', daysLeft < 7 ? 'text-red-600' : daysLeft < 30 ? 'text-amber-600' : '')}>
            {daysLeft > 0 ? `${daysLeft}d` : 'Past due'}
          </p>
          {weekLabel && <p className="text-[11px] text-muted-foreground">{weekLabel}</p>}
        </div>
      </div>

      {/* Footer — owner name + check-in CTA */}
      <div className="flex items-center justify-between border-t border-border px-5 py-2.5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{objective.owner.name}</span>
          <span>·</span>
          <span>{objective.timeframe.name}</span>
        </div>
        {onCheckIn && (
          <Button size="sm" onClick={onCheckIn}>Check in now</Button>
        )}
      </div>
    </div>
  )
}
