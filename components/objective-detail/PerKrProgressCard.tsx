'use client'

interface KR {
  id: string
  title: string
  progress: number
  confidence: string
  status: string
}

interface Props {
  keyResults: KR[]
}

function color(confidence: string): string {
  if (confidence === 'OFF_TRACK') return 'var(--ap-red)'
  if (confidence === 'AT_RISK') return 'var(--ap-orange)'
  return 'var(--ap-green)'
}

/**
 * Apple Pro "PER-KR PROGRESS" card — vertical bars, color-coded by confidence.
 */
export default function PerKrProgressCard({ keyResults }: Props) {
  const active = keyResults.filter(k => k.status === 'ACTIVE')
  const avg = active.length
    ? Math.round(active.reduce((s, k) => s + k.progress, 0) / active.length) : 0

  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Per-KR Progress
        </h3>
        <p className="mt-1 text-[13px]">
          <span className="text-[20px] font-semibold tabular-nums" style={{ letterSpacing: '-0.02em' }}>{avg}%</span>
          <span className="text-[12px] text-muted-foreground ml-2">
            Average across {active.length} KR{active.length !== 1 ? 's' : ''}
          </span>
        </p>
      </header>
      <div className="px-4 py-4">
        {active.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-4">No active KRs.</p>
        ) : (
          <div className="flex items-end gap-2 h-[120px]">
            {active.slice(0, 8).map((kr, i) => {
              const pct = Math.min(100, Math.max(0, Math.round(kr.progress)))
              return (
                <div key={kr.id} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <div className="text-[9px] font-semibold text-muted-foreground tabular-nums">KR{i + 1}</div>
                  <div
                    className="w-full rounded-t-[4px] relative"
                    style={{ height: '80px', background: 'var(--ap-kr-bar-bg)' }}
                  >
                    <div
                      className="absolute bottom-0 inset-x-0 rounded-t-[4px] transition-all"
                      style={{ height: `${pct}%`, background: color(kr.confidence) }}
                    />
                  </div>
                  <div className="text-[10px] font-semibold tabular-nums">{pct}%</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
