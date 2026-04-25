'use client'

import { useMemo } from 'react'

interface CheckIn {
  asOfDate: string | Date
  value: number
  confidence?: string | null
}

interface Props {
  checkIns: CheckIn[]
  startValue: number
  targetValue: number
  currentValue: number
  currentConfidence: number
  previousConfidence?: number | null
  timeframeStart: Date | string
  timeframeEnd: Date | string
}

/**
 * Apple Pro KR right-rail "PROGRESS & CONFIDENCE" card.
 * Series:
 *   - Burn-up (accent solid)   = (currentValue - startValue) / (target - start) * 100 over time
 *   - Confidence (orange dash) = numeric confidence per check-in (or flat current)
 *   - Expected (grey dotted)   = linear pace 0 → 100
 */
export default function KrProgressConfidenceCard({
  checkIns,
  startValue,
  targetValue,
  currentValue,
  currentConfidence,
  previousConfidence,
  timeframeStart,
  timeframeEnd,
}: Props) {
  const start = new Date(timeframeStart).getTime()
  const end = new Date(timeframeEnd).getTime()
  const now = Date.now()

  const weekOf = (d: number) => Math.max(0, Math.floor((d - start) / (1000 * 60 * 60 * 24 * 7)))
  const totalWeeks = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 7)))
  const wStart = 0
  const wNow = Math.min(totalWeeks, weekOf(now))

  const span = targetValue - startValue
  const pctOf = (v: number) => {
    if (span === 0) return 0
    return Math.min(100, Math.max(0, ((v - startValue) / span) * 100))
  }

  const currentPct = pctOf(currentValue)
  const expectedPct = Math.min(100, Math.max(0, (wNow / totalWeeks) * 100))
  const pace = Math.round(currentPct - expectedPct)
  const pacePositive = pace >= 0

  const confidenceDelta =
    typeof previousConfidence === 'number'
      ? Math.round(currentConfidence - previousConfidence)
      : 0

  const burnup = useMemo(() => {
    const sorted = [...checkIns]
      .map((c) => ({ t: new Date(c.asOfDate).getTime(), value: c.value }))
      .sort((a, b) => a.t - b.t)
    const pts = sorted.map((s) => ({ x: weekOf(s.t), y: pctOf(s.value) }))
    if (pts.length === 0) pts.push({ x: 0, y: pctOf(startValue) })
    pts.push({ x: wNow, y: currentPct })
    return pts.sort((a, b) => a.x - b.x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIns, currentPct, wNow])

  const confidenceSeries = useMemo(() => {
    const sorted = [...checkIns]
      .filter((c) => c.confidence != null)
      .map((c) => {
        const num =
          typeof c.confidence === 'number'
            ? c.confidence
            : c.confidence === 'ON_TRACK'
            ? 85
            : c.confidence === 'AT_RISK'
            ? 55
            : c.confidence === 'OFF_TRACK'
            ? 25
            : 50
        return { x: weekOf(new Date(c.asOfDate).getTime()), y: Math.max(0, Math.min(100, num)) }
      })
      .sort((a, b) => a.x - b.x)
    const pts = sorted.length > 0 ? sorted : [{ x: 0, y: currentConfidence }]
    pts.push({ x: wNow, y: currentConfidence })
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIns, currentConfidence, wNow])

  const expected = [
    { x: 0, y: 0 },
    { x: totalWeeks, y: 100 },
  ]

  const W = 308
  const H = 140
  const padL = 4
  const padR = 4
  const padT = 8
  const padB = 18
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (week: number) => padL + (week / Math.max(1, totalWeeks)) * innerW
  const y = (val: number) => padT + (1 - val / 100) * innerH

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')

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

      <div className="grid grid-cols-2 gap-0 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-4 py-3 border-r" style={{ borderColor: 'var(--ap-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className="text-[22px] font-semibold tabular-nums leading-none"
              style={{ color: 'var(--ap-accent)', letterSpacing: '-0.02em' }}
            >
              {Math.round(currentPct)}%
            </span>
            <span
              className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums"
              style={{
                background: pacePositive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                color: pacePositive ? 'var(--ap-green)' : 'var(--ap-red)',
              }}
            >
              {pacePositive ? '▲' : '▼'}
              {Math.abs(pace)}pt
            </span>
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className="text-[22px] font-semibold tabular-nums leading-none"
              style={{ color: 'var(--ap-orange)', letterSpacing: '-0.02em' }}
            >
              {Math.round(currentConfidence)}
              <span className="text-[12px] text-muted-foreground font-normal">/100</span>
            </span>
            {confidenceDelta !== 0 && (
              <span
                className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums"
                style={{
                  background: confidenceDelta >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                  color: confidenceDelta >= 0 ? 'var(--ap-green)' : 'var(--ap-red)',
                }}
              >
                {confidenceDelta >= 0 ? '▲' : '▼'}
                {Math.abs(confidenceDelta)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pt-2">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
          <line
            x1={padL}
            x2={W - padR}
            y1={H - padB}
            y2={H - padB}
            stroke="var(--ap-border)"
            strokeWidth={1}
          />
          <path d={path(expected)} fill="none" stroke="var(--ap-fg-faint)" strokeWidth={1.5} strokeDasharray="2 4" />
          <path
            d={path(confidenceSeries)}
            fill="none"
            stroke="var(--ap-orange)"
            strokeWidth={2}
            strokeDasharray="5 3"
            strokeLinecap="round"
          />
          <path
            d={path(burnup)}
            fill="none"
            stroke="var(--ap-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={x(wNow)}
            cy={y(currentPct)}
            r={3.5}
            fill="var(--ap-accent)"
            stroke="var(--ap-bg-raised)"
            strokeWidth={2}
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-1">
        <LegendPill color="var(--ap-accent)" label="Burn-up" />
        <LegendPill color="var(--ap-orange)" label="Confidence" dashed />
        <LegendPill color="var(--ap-fg-faint)" label="Expected" dotted />
      </div>
    </section>
  )
}

function LegendPill({
  color,
  label,
  dashed,
  dotted,
}: {
  color: string
  label: string
  dashed?: boolean
  dotted?: boolean
}) {
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
