import Link from 'next/link'
import { Layout, Calendar, ArrowRight } from 'lucide-react'

export interface SprintWidgetData {
  id: string
  name: string
  activitiesTotal: number
  activitiesDone: number
  startDate: string | null
  endDate: string | null
}

interface Props {
  sprint: SprintWidgetData | null
  recommendedActivities: string[]
}

export default function SprintWidget({ sprint, recommendedActivities }: Props) {
  if (sprint) {
    const progressPct = sprint.activitiesTotal > 0
      ? Math.round((sprint.activitiesDone / sprint.activitiesTotal) * 100)
      : 0

    return (
      <section className="atlas-card">
        <header className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--atlas-n30)]">
          <h3 className="atlas-eyebrow">Current sprint</h3>
          <Link href={`/dashboard/sprints/${sprint.id}`} className="atlas-link text-[11px]">
            Open board <ArrowRight className="h-3 w-3 inline" />
          </Link>
        </header>
        <div className="px-3 py-3">
          <div className="text-[14px] font-semibold text-[color:var(--atlas-n800)]">{sprint.name}</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="atlas-progress flex-1">
              <div className="atlas-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-[12px] text-[color:var(--atlas-n200)] tabular-nums">
              {sprint.activitiesDone}/{sprint.activitiesTotal}
            </span>
          </div>
          {sprint.startDate && sprint.endDate && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-[color:var(--atlas-n100)]">
              <Calendar className="h-3 w-3" />
              {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' — '}
              {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="atlas-card">
      <header className="px-3 py-2 border-b border-[color:var(--atlas-n30)]">
        <h3 className="atlas-eyebrow">Recommended sprint activities</h3>
      </header>
      <div className="px-3 py-3">
        {recommendedActivities.length === 0 ? (
          <p className="atlas-text-tertiary">No recommendations — you're all caught up!</p>
        ) : (
          <ul className="space-y-1.5">
            {recommendedActivities.map((act, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[color:var(--atlas-n700)]">
                <span className="text-[color:var(--atlas-primary)] mt-0.5">•</span>
                {act}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/dashboard/sprints"
          className="mt-3 inline-flex items-center gap-1 text-[12px] atlas-link"
        >
          <Layout className="h-3 w-3" /> Create a sprint
        </Link>
      </div>
    </section>
  )
}
