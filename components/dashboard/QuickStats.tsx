import Link from 'next/link'

export interface QuickStatsData {
  activeObjectives: number
  totalKeyResults: number
  totalInitiatives: number
  blockedCount: number
  dueThisWeekCount: number
}

interface Props {
  data: QuickStatsData
}

const cells: Array<{ label: string; key: keyof QuickStatsData; href: string; accent?: string }> = [
  { label: 'Active objectives', key: 'activeObjectives', href: '/dashboard/goals' },
  { label: 'Key results', key: 'totalKeyResults', href: '/dashboard/goals' },
  { label: 'Initiatives', key: 'totalInitiatives', href: '/dashboard/todos' },
  { label: 'Blocked', key: 'blockedCount', href: '/dashboard/reports?filter=all-off-track', accent: 'text-red-600' },
  { label: 'Due this week', key: 'dueThisWeekCount', href: '/dashboard/todos' },
]

export default function QuickStats({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
        {cells.map((cell) => {
          const value = data[cell.key]
          return (
            <Link
              key={cell.key}
              href={cell.href}
              className="group flex flex-col gap-0.5 px-4 py-3 transition hover:bg-muted"
            >
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {cell.label}
              </span>
              <span className={`text-xl font-bold tabular-nums leading-none ${cell.accent && value > 0 ? cell.accent : ''}`}>
                {value}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
