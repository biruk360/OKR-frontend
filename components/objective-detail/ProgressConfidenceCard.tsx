'use client'

import { useMemo } from 'react'

interface Snapshot {
  periodStart: string | Date
  score: number
}

interface Props {
  snapshots: Snapshot[]
  currentProgress: number
  currentConfidence?: number
  expectedProgress: number
  timeframeStart: Date | string
  timeframeEnd: Date | string
}

/**
 * Apple Pro "PROGRESS & CONFIDENCE" right-rail card.
 * Three series in one SVG: Burn-up (accent), Confidence (orange dashed), Expected (grey dotted).
 */
export default function ProgressConfidenceCard({
  snapshots, currentProgress, currentConfidence, expectedProgress,
  timeframeStart, timeframeEnd,
}: Props) {
  const start = new Date(timeframeStart).getTime()
  const end = new Date(timeframeEnd).getTime()
  const now = Date.now()

  const weekOf = (d: number) => {
    const week = Math.floor((d - start) / (1000 * 60 * 60 * 24 * 7))
    return Math.max(0, week)
  }
  const totalWeeks = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 7)))
  const wStart = weekOf(start)
  const wNow = Math.min(totalWeeks, weekOf(now))

  const conf = typeof currentConfidence === 'number'
    ? Math.round(currentConfidence)
    : Math.max(0, Math.min(100, 50 + Math.round(currentProgress - expectedProgress)))

  // Build series points (x = week index, y = 0..100)
  const burnup = useMemo(() => {
    const pts = snapshots.map(s => {
      const t = new Date(s.periodStart).getTime()
      return { x: weekOf(t), y: Math.min(100, Math.max(0, s.score)) }
    })
    if (pts.length === 0) {
      pts.push({ x: 0, y: 0 })
    }
    pts.push({ x: wNow, y: Math.round(currentProgress) })
    return pts.sort((a, b) => a.x - b.x)
  }, [snapshots, currentProgress, wNow])

  // Confidence series: derive (or fallback to flat at conf)
  const confidence = useMemo(() => {
    return [{ x: 0, y: conf }, { x: wNow, y: conf }]
  }, [conf, wNow])

  // Expected: linear 0..100
  const expected = [{ x: 0, y: 0 }, { x: totalWeeks, y: 100 }]

  // SVG geometry
  const W = 308
  const H = 140
  const padL = 4, padR = 4, padT = 8, padB = 18
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (week: number) => padL + (week / Math.max(1, totalWeeks)) * innerW
  const y = (val: number) => padT + (1 - val / 100) * innerH

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')

  const pace = Math.round(currentProgress - expectedProgress)
  const pacePositive = pace >= 0

  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <header className="flex items-baseline justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Progress &amp; Confidence
        </h3>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          W{wStart} → W{totalWeeks}
        </span>
      </header>

      {/* Twin stats */}
      <div className="grid grid-cols-2 gap-0 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-4 py-3 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tabular-nums leading-none"
              style={{ color: 'var(--ap-accent)', letterSpacing: '-0.02em' }}>
              {Math.round(currentProgress)}%
            </span>
            <span
              className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums"
              style={{
                background: pacePositive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                color: pacePositive ? 'var(--ap-green)' : 'var(--ap-red)',
              }}
            >
              {pacePositive ? '▲' : '▼'}{Math.abs(pace)}pt
            </span>
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tabular-nums leading-none"
              style={{ color: 'var(--ap-orange)', letterSpacing: '-0.02em' }}>
              {conf}<span className="text-[12px] text-muted-foreground font-normal">/100</span>
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 pt-2">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
          {/* Grid baseline */}
          <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB}
            stroke="var(--ap-border)" strokeWidth={1} />
          {/* Expected (dotted grey) */}
          <path d={path(expected)} fill="none"
            stroke="var(--ap-fg-faint)" strokeWidth={1.5} strokeDasharray="2 4" />
          {/* Confidence (orange dashed) */}
          <path d={path(confidence)} fill="none"
            stroke="var(--ap-orange)" strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
          {/* Burn-up (accent solid) */}
          <path d={path(burnup)} fill="none"
            stroke="var(--ap-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {/* Now marker */}
          <circle cx={x(wNow)} cy={y(Math.round(currentProgress))} r={3.5}
            fill="var(--ap-accent)" stroke="var(--ap-bg-raised)" strokeWidth={2} />
        </svg>
      </div>

      {/* Legend pills */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-1">
        <LegendPill color="var(--ap-accent)" label="Burn-up" />
        <LegendPill color="var(--ap-orange)" label="Confidence" dashed />
        <LegendPill color="var(--ap-fg-faint)" label="Expected" dotted />
      </div>
    </section>
  )
}

function LegendPill({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
    >
      <span
        className="inline-block w-3 h-[2px] rounded-full"
        style={{
          background: dotted || dashed ? 'transparent' : color,
          borderTop: dashed ? `2px dashed ${color}` : dotted ? `2px dotted ${color}` : undefined,
        }}
      />
      {label}
    </span>
  )
}
