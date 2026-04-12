'use client'

interface DashboardStatsProps {
  stats: {
    totalObjectives: number
    activeObjectives: number
    completedObjectives: number
    totalKeyResults: number
    completedKeyResults: number
    totalTodos: number
    completedTodos: number
    averageProgress: number
  }
}

// Compact KPI strip — a single horizontal card with 8 tiny value cells instead
// of 8 big cards. Dense, scannable, fits above the fold on most laptops.
const cells: Array<{ name: string; key: keyof DashboardStatsProps['stats']; suffix?: string }> = [
  { name: 'Objectives',      key: 'totalObjectives' },
  { name: 'Active',          key: 'activeObjectives' },
  { name: 'Completed',       key: 'completedObjectives' },
  { name: 'Key results',     key: 'totalKeyResults' },
  { name: 'KR completed',    key: 'completedKeyResults' },
  { name: 'Initiatives',     key: 'totalTodos' },
  { name: 'Done',            key: 'completedTodos' },
  { name: 'Avg progress',    key: 'averageProgress', suffix: '%' },
]

export default function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <section className="atlas-card">
      <header className="px-3 py-2 border-b border-[color:var(--atlas-n30)]">
        <h2 className="atlas-eyebrow">Workspace totals</h2>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x divide-y sm:divide-y-0 divide-[color:var(--atlas-n20)]">
        {cells.map((cell) => {
          const value = stats[cell.key]
          return (
            <div key={cell.name} className="px-3 py-2">
              <div className="text-[11px] font-medium text-[color:var(--atlas-n100)] uppercase tracking-wide truncate">
                {cell.name}
              </div>
              <div className="text-[18px] font-semibold leading-none text-[color:var(--atlas-n800)] mt-0.5">
                {value}
                {cell.suffix}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
