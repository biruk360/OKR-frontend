'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { Target } from 'lucide-react'

interface RecentObjectivesProps {
  objectives: any[]
}

// Compact list — rows are 48px tall, no large cards. Hover reveals progress bar.
export default function RecentObjectives({ objectives }: RecentObjectivesProps) {
  if (objectives.length === 0) {
    return (
      <section className="atlas-card">
        <header className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--atlas-n30)]">
          <h3 className="atlas-eyebrow">Recent objectives</h3>
          <Link href="/dashboard/objectives" className="atlas-link text-[12px]">
            View all
          </Link>
        </header>
        <div className="py-8 text-center px-4">
          <Target className="mx-auto h-8 w-8 text-[color:var(--atlas-n50)]" strokeWidth={1.5} />
          <h4 className="mt-2 text-[13px] font-medium text-[color:var(--atlas-n700)]">No objectives yet</h4>
          <p className="atlas-text-tertiary mt-0.5">Get started by creating your first objective.</p>
          <div className="mt-3">
            <Link href="/dashboard/objectives" className="atlas-btn atlas-btn-primary">
              Create objective
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="atlas-card">
      <header className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--atlas-n30)]">
        <h3 className="atlas-eyebrow">Recent objectives</h3>
        <Link href="/dashboard/objectives" className="atlas-link text-[12px]">
          View all
        </Link>
      </header>
      <ul className="divide-y divide-[color:var(--atlas-n20)]">
        {objectives.map((objective) => (
          <li key={objective.id}>
            <Link
              href={`/dashboard/objectives/${objective.id}`}
              className="group flex items-center gap-3 px-3 py-2 hover:bg-[color:var(--atlas-n10)] transition"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[color:var(--atlas-n800)]">
                  {objective.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[color:var(--atlas-n100)]">
                  <span className="truncate">{objective.owner.name}</span>
                  <span>·</span>
                  <span>{objective.timeframe.name}</span>
                  <span>·</span>
                  <span>{objective._count?.keyResults || 0} KRs</span>
                  <span>·</span>
                  <span>Updated {formatDate(objective.updatedAt, 'MMM dd')}</span>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5 w-[80px]">
                <div className="text-[13px] font-semibold text-[color:var(--atlas-n800)] tabular-nums">
                  {Math.round(objective.progress)}%
                </div>
                <div className="atlas-progress">
                  <div
                    className="atlas-progress-fill"
                    style={{ width: `${Math.min(objective.progress, 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
