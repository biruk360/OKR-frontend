/**
 * Report dashboard: derive display status and aggregates from KeyResult rows.
 */

export type KrDisplayStatus =
  | 'not_measurable'
  | 'pending'
  | 'on_track'
  | 'at_risk'
  | 'off_track'

export function getKrDisplayStatus(kr: {
  unit: string
  targetValue: number
  startValue: number
  currentValue: number
  progress: number
  confidence: string
}): KrDisplayStatus {
  const unit = (kr.unit || '').trim().toUpperCase()
  if (unit === 'N/A' || unit === '—' || unit === '-') {
    return 'not_measurable'
  }
  const stagnant =
    kr.progress < 0.5 &&
    Math.abs(kr.currentValue - kr.startValue) < Number.EPSILON * 1e6
  if (stagnant) {
    return 'pending'
  }
  switch (kr.confidence) {
    case 'AT_RISK':
      return 'at_risk'
    case 'OFF_TRACK':
      return 'off_track'
    default:
      return 'on_track'
  }
}

export function statusLabel(s: KrDisplayStatus): string {
  switch (s) {
    case 'not_measurable':
      return 'Not measurable'
    case 'pending':
      return 'Pending'
    case 'on_track':
      return 'On track'
    case 'at_risk':
      return 'At risk'
    case 'off_track':
      return 'Off track'
  }
}

export function progressBuckets(): { label: string; min: number; max: number }[] {
  const ranges: { label: string; min: number; max: number }[] = []
  for (let i = 0; i < 10; i++) {
    const min = i * 10
    const max = i === 9 ? 100 : (i + 1) * 10
    ranges.push({
      label: `${min}–${max}%`,
      min,
      max: max === 100 ? 101 : max,
    })
  }
  return ranges
}

export function bucketProgressCounts(progressValues: number[]): { label: string; count: number }[] {
  const buckets = progressBuckets()
  return buckets.map((b) => ({
    label: b.label,
    count: progressValues.filter((p) => p >= b.min && p < b.max).length,
  }))
}

/** 0–100 average confidence “score” for donut (ON_TRACK=100, AT_RISK=50, OFF_TRACK=0). */
export function avgConfidenceScore(
  items: { confidence: string; displayStatus: KrDisplayStatus }[]
): number {
  if (items.length === 0) return 0
  let sum = 0
  for (const it of items) {
    if (it.displayStatus === 'pending' || it.displayStatus === 'not_measurable') {
      sum += 50
      continue
    }
    switch (it.confidence) {
      case 'ON_TRACK':
        sum += 100
        break
      case 'AT_RISK':
        sum += 50
        break
      case 'OFF_TRACK':
        sum += 0
        break
      default:
        sum += 50
    }
  }
  return Math.round(sum / items.length)
}
