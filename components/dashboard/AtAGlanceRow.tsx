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

// Compact version — 32px-tall cells instead of card-padded ones. Uses atlas tokens
// so it inherits the design system from whichever parent scope it's rendered in.
const cards: Array<{
  key: keyof Omit<GlanceCounts, 'initiativesTotal'>
  label: string
  filter: string
  accent: string
}> = [
  { key: 'offTrack', label: 'Off track',   filter: 'all-off-track', accent: 'text-destructive' },
  { key: 'atRisk',   label: 'At risk',     filter: 'all-at-risk',   accent: 'text-amber-700' },
  { key: 'onTrack',  label: 'On track',    filter: 'on-track',      accent: 'text-emerald-600' },
  { key: 'pending',  label: 'Pending',     filter: 'pending',       accent: 'text-muted-foreground' },
]

export default function AtAGlanceRow({ counts }: { counts: GlanceCounts }) {
  const krProgress = Math.round(counts.keyResultsProgress)
  const initiativesPct =
    counts.initiativesTotal > 0
      ? Math.round((counts.initiativesClosed / counts.initiativesTotal) * 100)
      : 0

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-3 py-2 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">My OKRs at a glance</h2>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-border">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={`/dashboard/reports?filter=${card.filter}`}
            className="group flex flex-col gap-0.5 px-3 py-2 transition hover:bg-muted"
          >
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {card.label}
            </div>
            <div className={`text-[20px] font-semibold leading-none ${card.accent}`}>
              {counts[card.key]}
            </div>
          </Link>
        ))}

        <Link
          href="/dashboard/reports?filter=your-key-results"
          className="flex flex-col gap-0.5 px-3 py-2 transition hover:bg-muted"
        >
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            KR progress
          </div>
          <div className="text-[20px] font-semibold leading-none text-foreground">
            {krProgress}%
          </div>
          <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, krProgress))}%` }}
            />
          </div>
        </Link>

        <Link
          href="/dashboard/todos"
          className="flex flex-col gap-0.5 px-3 py-2 transition hover:bg-muted"
        >
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Initiatives
          </div>
          <div className="text-[20px] font-semibold leading-none text-foreground">
            {counts.initiativesClosed}/{counts.initiativesTotal}
          </div>
          <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, initiativesPct))}%`,
                background: '#7c3aed',
              }}
            />
          </div>
        </Link>
      </div>
    </section>
  )
}
