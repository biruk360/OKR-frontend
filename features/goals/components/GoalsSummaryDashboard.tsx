'use client'

interface GoalsSummaryDashboardProps {
  stats: {
    total: number
    onTrack: number
    atRisk: number
    offTrack: number
    closed: number
    noStatus: number
    avgProgress: number
  }
}

const CARDS: Array<{
  key: keyof GoalsSummaryDashboardProps['stats']
  label: string
  dot: string
  tone: string
}> = [
  { key: 'noStatus', label: 'No Status', dot: 'bg-gray-400', tone: 'text-muted-foreground' },
  { key: 'onTrack', label: 'On Track', dot: 'bg-green-500', tone: 'text-green-700' },
  { key: 'atRisk', label: 'At Risk', dot: 'bg-yellow-500', tone: 'text-yellow-700' },
  { key: 'offTrack', label: 'Off Track', dot: 'bg-red-500', tone: 'text-red-700' },
  { key: 'closed', label: 'Closed', dot: 'bg-gray-400', tone: 'text-muted-foreground' },
]

export default function GoalsSummaryDashboard({ stats }: GoalsSummaryDashboardProps) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (stats.avgProgress / 100) * circumference

  return (
    <div className="bg-card px-3 py-2.5 rounded-md border border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0 pr-4 border-r border-border">
          <div className="relative h-14 w-14">
            <svg className="transform -rotate-90 h-14 w-14">
              <circle
                cx="28"
                cy="28"
                r={radius}
                stroke="currentColor"
                strokeWidth="5"
                fill="transparent"
                className="text-gray-200"
              />
              <circle
                cx="28"
                cy="28"
                r={radius}
                stroke="currentColor"
                strokeWidth="5"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="text-blue-600 transition-all duration-500"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">
              {stats.avgProgress}%
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Overall</span>
            <span className="text-xs font-medium text-foreground">{stats.total} goals</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-5 gap-2">
          {CARDS.map((card) => (
            <div
              key={card.key}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${card.dot}`} />
              <div className="flex flex-col leading-tight min-w-0">
                <span className={`text-[10px] uppercase tracking-wide truncate ${card.tone}`}>
                  {card.label}
                </span>
                <span className="text-base font-semibold text-foreground tabular-nums">
                  {stats[card.key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
