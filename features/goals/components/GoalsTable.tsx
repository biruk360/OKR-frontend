'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { KeyResultsList } from '@/features/key-results'
import StatusPill, { LevelBadge } from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'

interface GoalsTableProps {
  objectives: any[]
  onRefresh: () => void
  users: any[]
}

function getInitials(name?: string) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function GoalsTable({ objectives, onRefresh, users }: GoalsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (objectiveId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(objectiveId)) next.delete(objectiveId)
      else next.add(objectiveId)
      return next
    })
  }

  if (objectives.length === 0) {
    return (
      <EmptyState
        title="No goals found"
        description="Create your first goal to get started."
      />
    )
  }

  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        background: 'var(--ap-bg, #fff)',
        borderColor: 'var(--ap-border, hsl(var(--border)))',
      }}
    >
      <div
        className="grid items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wide font-semibold border-b"
        style={{
          gridTemplateColumns: '24px 90px minmax(0,1fr) 32px 200px 80px 24px',
          background: 'rgba(120,120,128,0.04)',
          color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))',
          borderColor: 'var(--ap-border, hsl(var(--border)))',
        }}
      >
        <span />
        <span>Level</span>
        <span>Goal</span>
        <span>Owner</span>
        <span>Progress</span>
        <span className="text-right">Due</span>
        <span />
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--ap-border, hsl(var(--border)))' }}>
        {objectives.map((objective) => {
          const isExpanded = expandedRows.has(objective.id)
          const keyResults = objective.keyResults ?? []
          const rawStatus = (objective.goalStatus || objective.status || 'NO_STATUS') as string
          const progress = Math.round(objective.progress ?? 0)
          const endDate = objective.endDate || objective.timeframe?.endDate
          const level = objective.level || 'INDIVIDUAL'
          const ownerName = objective.owner?.name || 'Unknown'

          return (
            <Fragment key={objective.id}>
              <div
                className="ap-hover-lift grid items-center gap-3 px-4 py-2.5 group transition-colors"
                style={{
                  gridTemplateColumns: '24px 90px minmax(0,1fr) 32px 200px 80px 24px',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleRow(objective.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? 'Collapse key results' : 'Expand key results'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <div>
                  <LevelBadge level={level} />
                </div>

                <div className="min-w-0">
                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="text-[13px] font-semibold hover:underline truncate block"
                    style={{ color: 'var(--ap-fg, hsl(var(--foreground)))' }}
                  >
                    {objective.title}
                  </Link>
                  {objective.description && (
                    <p className="text-[11px] line-clamp-1" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                      {objective.description}
                    </p>
                  )}
                </div>

                <div title={ownerName}>
                  {objective.owner?.avatar ? (
                    <img
                      src={objective.owner.avatar}
                      alt={ownerName}
                      className="h-6 w-6 rounded-full"
                    />
                  ) : (
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                      style={{ background: 'var(--ap-accent, #007aff)' }}
                    >
                      {objective.owner?.name ? getInitials(objective.owner.name) : <User className="h-3 w-3" />}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className="relative h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ background: 'rgba(120,120,128,0.18)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        background: 'var(--ap-accent, #007aff)',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums w-9 text-right" style={{ color: 'var(--ap-fg, hsl(var(--foreground)))' }}>
                    {progress}%
                  </span>
                  <StatusPill status={rawStatus} size="xs" />
                </div>

                <div className="text-right text-[11px] tabular-nums" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                  {endDate ? formatDate(endDate, 'MMM d') : '—'}
                </div>

                <div />
              </div>

              {isExpanded && (
                <div className="px-4 py-3" style={{ background: 'rgba(120,120,128,0.04)' }}>
                  <div className="pl-6 border-l-2" style={{ borderColor: 'var(--ap-border, hsl(var(--border)))' }}>
                    <KeyResultsList
                      keyResults={keyResults}
                      objectiveId={objective.id}
                      objective={objective}
                      users={users}
                      onKeyResultsChange={onRefresh}
                    />
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
