'use client'

import Link from 'next/link'
import { formatDate, getProgressBarClass } from '@/lib/utils'
import { Target, Calendar, User, Building2 } from 'lucide-react'

interface RecentObjectivesProps {
  objectives: any[]
}

export default function RecentObjectives({ objectives }: RecentObjectivesProps) {
  if (objectives.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="mb-4 text-section-title text-ink-primary">Recent Objectives</h3>
        <div className="py-10 text-center">
          <Target className="mx-auto h-12 w-12 text-ink-tertiary" strokeWidth={1.5} />
          <h3 className="mt-3 text-body font-medium text-ink-primary">No objectives yet</h3>
          <p className="mt-1 text-body-sm text-ink-secondary">Get started by creating your first objective.</p>
          <div className="mt-8">
            <Link href="/dashboard/objectives" className="btn-primary">
              Create objective
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-ink-secondary/10 px-6 py-4">
        <h3 className="text-section-title text-ink-primary">Recent Objectives</h3>
        <Link href="/dashboard/objectives" className="text-body-sm font-medium text-primary-500 hover:text-primary-700">
          View all
        </Link>
      </div>

      <div className="divide-y divide-ink-secondary/10 px-2 py-2">
        {objectives.map((objective) => (
          <div
            key={objective.id}
            className="rounded-card-lg px-4 py-4 transition-colors duration-[180ms] ease-apple hover:bg-surface-hover"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/objectives/${objective.id}`}
                  className="block truncate text-body font-medium text-ink-primary hover:text-primary-600"
                >
                  {objective.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-body-sm text-ink-secondary">{objective.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-body-sm text-ink-secondary">
                  <div className="flex items-center rounded-pill bg-surface-app px-2.5 py-1">
                    {objective.owner.avatar ? (
                      <img
                        src={objective.owner.avatar}
                        alt={objective.owner.name}
                        className="mr-2 h-6 w-6 rounded-pill object-cover"
                      />
                    ) : (
                      <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-pill bg-primary-500/15">
                        <User className="h-3 w-3 text-primary-600" strokeWidth={2} />
                      </div>
                    )}
                    <span className="font-medium text-ink-primary">{objective.owner.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    <span>{objective.timeframe.name}</span>
                    {objective.timeframe.type && (
                      <span className="badge-default ml-1 capitalize">
                        {objective.timeframe.type === 'MONTHLY'
                          ? 'Monthly'
                          : objective.timeframe.type === 'QUARTERLY'
                            ? 'Quarterly'
                            : objective.timeframe.type === 'SIX_MONTH'
                              ? '6-Month'
                              : objective.timeframe.type === 'YEARLY'
                                ? 'Yearly'
                                : ''}
                      </span>
                    )}
                  </div>
                  {objective.department && (
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      {objective.department.name}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-body font-semibold text-ink-primary">{Math.round(objective.progress)}%</div>
                <div className="mt-2 h-1.5 w-20 overflow-hidden rounded bg-surface-muted">
                  <div
                    className={`h-full rounded transition-all duration-[180ms] ease-apple ${getProgressBarClass(objective.progress)}`}
                    style={{ width: `${Math.min(objective.progress, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-body-sm text-ink-secondary">
              <span>{objective._count?.keyResults || 0} Key Results</span>
              <span>Updated {formatDate(objective.updatedAt, 'MMM dd')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
