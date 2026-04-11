export type TimeframeLike = {
  startDate: string | Date
  endDate: string | Date
  name?: string
} | null

export type CheckInForChart = {
  asOfDate: string | Date
  value: number
}

export function formatAxisValue(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  if (abs >= 100) return `${Math.round(n)}`
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export function buildChartRows(
  kr: { startValue?: number; targetValue?: number; currentValue?: number; createdAt?: string | Date },
  checkIns: CheckInForChart[],
  timeframe: TimeframeLike
): { combined: { t: number; expected: number; actual: number }[]; t0: number; t1: number } {
  const now = Date.now()
  const t0 = new Date(timeframe?.startDate ?? kr.createdAt ?? now).getTime()
  const tfEnd = timeframe?.endDate ? new Date(timeframe.endDate).getTime() : now
  const t1 = Math.max(tfEnd, now, t0 + 86400000)

  const actualPoints: { t: number; v: number }[] = [{ t: t0, v: Number(kr.startValue) || 0 }]
  for (const c of checkIns) {
    const ts = new Date(c.asOfDate).getTime()
    if (Number.isFinite(ts)) {
      actualPoints.push({ t: ts, v: c.value })
    }
  }
  const last = actualPoints[actualPoints.length - 1]
  if (!last || last.t < now) {
    actualPoints.push({ t: now, v: Number(kr.currentValue) || 0 })
  } else {
    actualPoints[actualPoints.length - 1] = { t: last.t, v: Number(kr.currentValue) || 0 }
  }

  const startV = Number(kr.startValue) || 0
  const targetV = Number(kr.targetValue) || 0
  const span = Math.max(t1 - t0, 1)
  const expectedAt = (t: number) => {
    const r = (t - t0) / span
    return startV + (targetV - startV) * Math.min(Math.max(r, 0), 1)
  }

  const times = new Set<number>()
  actualPoints.forEach((p) => times.add(p.t))
  times.add(t0)
  times.add(t1)
  const sorted = Array.from(times).sort((a, b) => a - b)

  const combined = sorted.map((t) => {
    let actual = startV
    for (let i = 0; i < actualPoints.length; i++) {
      if (actualPoints[i].t <= t) {
        actual = actualPoints[i].v
      }
    }
    return {
      t,
      expected: expectedAt(t),
      actual,
    }
  })

  return { combined, t0, t1 }
}
