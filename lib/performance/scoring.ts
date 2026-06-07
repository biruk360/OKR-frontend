import type {
  DecisionBand,
  GatekeeperConfig,
  MetricScoringRule,
  RubricAnchors,
} from './types'

export function mean(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot average an empty score set')
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function rangeVariance(values: number[]): number {
  if (values.length <= 1) return 0
  return Math.max(...values) - Math.min(...values)
}

export function normalizeScore(rawTotal: number, maxTotal: number): number {
  if (!Number.isFinite(rawTotal) || !Number.isFinite(maxTotal) || maxTotal <= 0) {
    throw new Error('A positive maxTotal is required for normalization')
  }
  return (rawTotal / maxTotal) * 100
}

export function scoreMetric(
  actual: number,
  target: number | null | undefined,
  rule: MetricScoringRule,
): number {
  if (!Number.isFinite(actual)) throw new Error('Metric actual must be finite')

  if (rule.type === 'MANUAL') {
    throw new Error('Manual metric rules do not compute an automatic score')
  }

  if (rule.type === 'LINEAR_CAPPED') {
    if (!Number.isFinite(target) || Number(target) <= 0) {
      throw new Error('Linear metric rules require a positive target')
    }
    const maxScore = rule.maxScore ?? 10
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new Error('Linear metric rules require a positive maxScore')
    }
    return Math.max(0, Math.min(maxScore, (actual / Number(target)) * maxScore))
  }

  if (rule.bands.length === 0) throw new Error('Inverse metric rules require at least one band')
  const sorted = [...rule.bands].sort((a, b) => {
    if (a.maxActual === null) return 1
    if (b.maxActual === null) return -1
    return a.maxActual - b.maxActual
  })
  const match = sorted.find((band) => band.maxActual === null || actual <= band.maxActual)
  if (!match || !Number.isFinite(match.score)) {
    throw new Error('Inverse metric rule does not cover the actual value')
  }
  return match.score
}

export function validateDecisionBands(bands: DecisionBand[]): string[] {
  const errors: string[] = []
  if (bands.length === 0) return ['At least one decision band is required']
  for (const band of bands) {
    if (!band.label?.trim()) errors.push('Every decision band requires a label')
    if (!Number.isFinite(band.min) || band.min < 0 || band.min > 100) {
      errors.push('Decision band minimums must be between 0 and 100')
    }
  }
  for (let index = 1; index < bands.length; index++) {
    if (bands[index - 1].min <= bands[index].min) {
      errors.push('Decision bands must be ordered from highest minimum to lowest minimum')
      break
    }
  }
  if (bands[bands.length - 1]?.min !== 0) {
    errors.push('Decision bands must include a final band beginning at 0')
  }
  return Array.from(new Set(errors))
}

export function resolveDecisionBand(
  normalized: number,
  gatekeeperPass: boolean,
  bands: DecisionBand[],
  failureBand = 'Not Ready',
): string {
  const errors = validateDecisionBands(bands)
  if (errors.length > 0) throw new Error(errors.join('; '))
  if (!gatekeeperPass) return failureBand
  const band = bands.find((candidate) => normalized >= candidate.min)
  return band?.label ?? bands[bands.length - 1].label
}

export function resolveGatekeeper(
  tierSubtotals: Array<{ id: string; name: string; subtotal: number }>,
  config: GatekeeperConfig,
): boolean {
  const tier = config.tierId
    ? tierSubtotals.find((candidate) => candidate.id === config.tierId)
    : tierSubtotals.find((candidate) => candidate.name === config.tierName)
  if (!tier) throw new Error('Configured gatekeeper tier was not found')
  if (!Number.isFinite(config.threshold)) throw new Error('Gatekeeper threshold must be finite')
  return tier.subtotal >= config.threshold
}

export function resolveNextAnchor(score: number, anchors: RubricAnchors): string | null {
  const levels = Object.keys(anchors)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const next = levels.find((level) => level > score)
  if (next === undefined) return null
  const value = anchors[String(next)]
  if (typeof value === 'string') return value
  return value?.en ?? value?.am ?? null
}

export function roundPerformanceValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

