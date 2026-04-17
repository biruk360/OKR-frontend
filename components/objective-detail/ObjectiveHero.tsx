'use client'

import { User, Calendar, Building2, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { statusBadgeClass, statusLabel, fromDbStatus } from '@/lib/okr/status'
import { cn } from '@/lib/utils'

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

export default function ObjectiveHero({ objective, expectedProgress, daysLeft, activeKrCount, unassignedKrCount, weekLabel, onCheckIn }: Props) {
  const status = fromDbStatus(objective.goalStatus)
  const gap = objective.progress - expectedProgress

  const initials = objective.owner.name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium">
            {levelLabel(objective.level)}
          </span>
          {objective.parentObjective && (
            <>
              <span>aligned to</span>
              <span className="font-medium text-foreground truncate">{objective.parentObjective.title}</span>
            </>
          )}
          {objective.isPrivate && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Private</span>
          )}
        </div>

        <h1 className="text-lg font-semibold leading-snug">{objective.title}</h1>

        {objective.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{objective.description}</p>
        )}
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border divide-x divide-border">
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

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {objective.owner.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={objective.owner.avatar} alt="" className="size-5 rounded-full object-cover" />
            ) : (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary-600">{initials}</span>
            )}
            {objective.owner.name}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" />
            {objective.timeframe.name}
          </span>
          {objective.department && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5" />
              {objective.department.name}
            </span>
          )}
        </div>
        {onCheckIn && (
          <Button size="sm" onClick={onCheckIn}>
            Check in now
          </Button>
        )}
      </div>
    </div>
  )
}
