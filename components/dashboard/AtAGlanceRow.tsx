import Link from 'next/link'

export interface GlanceCounts {
  offTrack: number
  atRisk: number
  onTrack: number
  pending: number
  keyResultsProgress: number
  initiativesClosed: number
  initiativesTotal: number
}

const cards: Array<{
  key: keyof Omit<GlanceCounts, 'initiativesTotal'>
  label: string
  filter: string
  accent: string
  dot: string
}> = [
  { key: 'offTrack', label: 'Off track', filter: 'all-off-track', accent: 'text-red-600', dot: 'bg-red-500' },
  { key: 'atRisk', label: 'At risk', filter: 'all-at-risk', accent: 'text-amber-600', dot: 'bg-amber-500' },
  { key: 'onTrack', label: 'On track', filter: 'on-track', accent: 'text-emerald-600', dot: 'bg-emerald-500' },
  { key: 'pending', label: 'Pending', filter: 'pending', accent: 'text-neutral-600', dot: 'bg-neutral-400' },
]

export default function AtAGlanceRow({ counts }: { counts: GlanceCounts }) {
  const krProgress = Math.round(counts.keyResultsProgress)
  const initiativesPct = counts.initiativesTotal > 0
    ? Math.round((counts.initiativesClosed / counts.initiativesTotal) * 100)
    : 0

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">My OKR at a glance</h2>
      </header>
      <div className="grid grid-cols-2 gap-px bg-neutral-200 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={`/dashboard/reports?filter=${card.filter}`}
            className="group flex flex-col gap-1 bg-white p-4 transition hover:bg-neutral-50"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <span className={`h-2 w-2 rounded-full ${card.dot}`} />
              {card.label}
            </div>
            <div className={`text-2xl font-semibold ${card.accent}`}>{counts[card.key]}</div>
          </Link>
        ))}

        <Link
          href="/dashboard/reports?filter=your-key-results"
          className="flex flex-col gap-1 bg-white p-4 transition hover:bg-neutral-50"
        >
          <div className="text-xs font-medium text-neutral-500">Key Results progress</div>
          <div className="text-2xl font-semibold text-neutral-900">{krProgress}%</div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.min(100, Math.max(0, krProgress))}%` }}
            />
          </div>
        </Link>

        <Link
          href="/dashboard/my-tasks"
          className="flex flex-col gap-1 bg-white p-4 transition hover:bg-neutral-50"
        >
          <div className="text-xs font-medium text-neutral-500">Initiatives closed</div>
          <div className="text-2xl font-semibold text-neutral-900">
            {counts.initiativesClosed}/{counts.initiativesTotal}
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${Math.min(100, Math.max(0, initiativesPct))}%` }}
            />
          </div>
        </Link>
      </div>
    </section>
  )
}
