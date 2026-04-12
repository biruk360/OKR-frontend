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
  { key: 'offTrack', label: 'Off track',   filter: 'all-off-track', accent: 'text-[color:var(--atlas-danger)]' },
  { key: 'atRisk',   label: 'At risk',     filter: 'all-at-risk',   accent: 'text-[#974f0c]' },
  { key: 'onTrack',  label: 'On track',    filter: 'on-track',      accent: 'text-[color:var(--atlas-success)]' },
  { key: 'pending',  label: 'Pending',     filter: 'pending',       accent: 'text-[color:var(--atlas-n200)]' },
]

export default function AtAGlanceRow({ counts }: { counts: GlanceCounts }) {
  const krProgress = Math.round(counts.keyResultsProgress)
  const initiativesPct =
    counts.initiativesTotal > 0
      ? Math.round((counts.initiativesClosed / counts.initiativesTotal) * 100)
      : 0

  return (
    <section className="atlas-card">
      <header className="px-3 py-2 border-b border-[color:var(--atlas-n30)]">
        <h2 className="atlas-eyebrow">My OKRs at a glance</h2>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-[color:var(--atlas-n20)]">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={`/dashboard/reports?filter=${card.filter}`}
            className="group flex flex-col gap-0.5 px-3 py-2 transition hover:bg-[color:var(--atlas-n10)]"
          >
            <div className="text-[11px] font-medium text-[color:var(--atlas-n100)] uppercase tracking-wide">
              {card.label}
            </div>
            <div className={`text-[20px] font-semibold leading-none ${card.accent}`}>
              {counts[card.key]}
            </div>
          </Link>
        ))}

        <Link
          href="/dashboard/reports?filter=your-key-results"
          className="flex flex-col gap-0.5 px-3 py-2 transition hover:bg-[color:var(--atlas-n10)]"
        >
          <div className="text-[11px] font-medium text-[color:var(--atlas-n100)] uppercase tracking-wide">
            KR progress
          </div>
          <div className="text-[20px] font-semibold leading-none text-[color:var(--atlas-n800)]">
            {krProgress}%
          </div>
          <div className="mt-1 atlas-progress">
            <div
              className="atlas-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, krProgress))}%` }}
            />
          </div>
        </Link>

        <Link
          href="/dashboard/todos"
          className="flex flex-col gap-0.5 px-3 py-2 transition hover:bg-[color:var(--atlas-n10)]"
        >
          <div className="text-[11px] font-medium text-[color:var(--atlas-n100)] uppercase tracking-wide">
            Initiatives
          </div>
          <div className="text-[20px] font-semibold leading-none text-[color:var(--atlas-n800)]">
            {counts.initiativesClosed}/{counts.initiativesTotal}
          </div>
          <div className="mt-1 atlas-progress">
            <div
              className="atlas-progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, initiativesPct))}%`,
                background: 'var(--atlas-purple)',
              }}
            />
          </div>
        </Link>
      </div>
    </section>
  )
}
