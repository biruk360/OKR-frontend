'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, User } from 'lucide-react'
import { formatDate, getProgressColor } from '@/lib/utils'
import { KeyResultsList } from '@/features/key-results'

interface GoalsTableProps {
  objectives: any[]
  onRefresh: () => void
  users: any[]
}

const STATUS_META: Record<string, { dot: string; label: string; tone: string }> = {
  ON_TRACK: { dot: 'bg-green-500', label: 'On Track', tone: 'text-green-700' },
  AT_RISK: { dot: 'bg-yellow-500', label: 'At Risk', tone: 'text-yellow-700' },
  OFF_TRACK: { dot: 'bg-red-500', label: 'Off Track', tone: 'text-red-700' },
  CLOSED: { dot: 'bg-gray-400', label: 'Closed', tone: 'text-muted-foreground' },
  NO_STATUS: { dot: 'bg-gray-300', label: 'No Status', tone: 'text-muted-foreground' },
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
      <div className="text-center py-10 bg-card rounded-md border border-border">
        <p className="text-sm text-muted-foreground">No goals found. Create your first goal to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="w-8 px-1 py-2 text-left">Owner</th>
              <th className="px-2 py-2 text-left font-medium">Goal</th>
              <th className="px-2 py-2 text-left font-medium">Labels</th>
              <th className="w-[220px] px-2 py-2 text-left font-medium">Progress</th>
              <th className="w-[84px] px-2 py-2 text-right font-medium">End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {objectives.map((objective) => {
              const isExpanded = expandedRows.has(objective.id)
              const keyResults = objective.keyResults ?? []
              const rawStatus = (objective.goalStatus || objective.status || 'NO_STATUS') as string
              const status = STATUS_META[rawStatus] ?? STATUS_META.NO_STATUS
              const progress = Math.round(objective.progress ?? 0)
              const progressBarColor = getProgressColor(progress)
                .split(' ')[0]
                .replace('text-', 'bg-')
              const endDate = objective.endDate || objective.timeframe?.endDate

              return (
                <Fragment key={objective.id}>
                  <tr className="group hover:bg-muted/40">
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => toggleRow(objective.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isExpanded ? 'Collapse key results' : 'Expand key results'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-1 py-2 align-middle">
                      {objective.owner?.avatar ? (
                        <img
                          src={objective.owner.avatar}
                          alt={objective.owner.name || 'Owner'}
                          title={objective.owner.name || 'Owner'}
                          className="h-6 w-6 rounded-full"
                        />
                      ) : (
                        <div
                          className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-semibold text-white"
                          title={objective.owner?.name || 'Unknown'}
                        >
                          {objective.owner?.name ? (
                            getInitials(objective.owner.name)
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-2 py-2 align-middle">
                      <Link
                        href={`/dashboard/objectives/${objective.id}`}
                        className="text-sm font-medium text-foreground hover:text-blue-600"
                      >
                        {objective.title}
                      </Link>
                      {objective.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {objective.description}
                        </p>
                      )}
                    </td>

                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {objective.objectiveLabels?.slice(0, 3).map((ol: any) => (
                          <span
                            key={ol.labelId}
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                            style={{
                              backgroundColor: `${ol.label.color}18`,
                              color: ol.label.color,
                            }}
                          >
                            {ol.label.name}
                          </span>
                        ))}
                        {objective.objectiveLabels && objective.objectiveLabels.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{objective.objectiveLabels.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-2 py-2 align-middle">
                      <div
                        className="flex items-center gap-2"
                        title={`${status.label} · ${progress}%`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                        <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums text-foreground w-8 text-right">
                          {progress}%
                        </span>
                        <span className={`hidden lg:inline text-[11px] ${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                    </td>

                    <td className="px-2 py-2 align-middle text-right text-xs text-muted-foreground tabular-nums">
                      {endDate ? formatDate(endDate, 'MMM d') : '—'}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-muted/30 px-3 py-3">
                        <div className="pl-6 border-l-2 border-border">
                          <KeyResultsList
                            keyResults={keyResults}
                            objectiveId={objective.id}
                            objective={objective}
                            users={users}
                            onKeyResultsChange={onRefresh}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
