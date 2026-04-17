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
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">Team Activity</h3>
          <Link href={`/dashboard/sprints/${sprint.id}`} className="text-sm text-primary-500 hover:underline text-[11px]">
            Open board <ArrowRight className="h-3 w-3 inline" />
          </Link>
        </header>
        <div className="px-3 py-3">
          <div className="text-[14px] font-semibold text-foreground">{sprint.name}</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden flex-1">
              <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {sprint.activitiesDone}/{sprint.activitiesTotal}
            </span>
          </div>
          {sprint.startDate && sprint.endDate && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
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
    <section className="rounded-lg border border-border bg-card">
      <header className="px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold">Team Activity</h3>
      </header>
      <div className="px-3 py-3">
        {recommendedActivities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recommendations — you're all caught up!</p>
        ) : (
          <ul className="space-y-1.5">
            {recommendedActivities.map((act, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-foreground">
                <span className="text-primary-500 mt-0.5">•</span>
                {act}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/dashboard/sprints"
          className="mt-3 inline-flex items-center gap-1 text-[12px] text-sm text-primary-500 hover:underline"
        >
          <Layout className="h-3 w-3" /> Create a sprint
        </Link>
      </div>
    </section>
  )
}
