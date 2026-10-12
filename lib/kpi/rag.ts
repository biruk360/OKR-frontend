/**
 * KPI RAG (KPI-2, KPI-6) — pure, client-safe.
 *
 * GREEN  on target
 * AMBER  within the amber band: `thresholdAmber` is the fraction of the target
 *        that still counts as amber (0.9 = within 10% of target)
 * RED    outside the band
 * null   not scored: no numeric value, no numeric target (text-only / compound
 *        KPIs take a manual RAG — KPI-6), or the period is before `scoredFrom`
 *
 * Direction:
 *   INCREASE  higher is better: GREEN ≥ target, AMBER ≥ target − |target|·(1 − a)
 *   DECREASE  lower is better:  GREEN ≤ target, AMBER ≤ target + |target|·(1 − a)
 *   RANGE     GREEN within [targetMin, targetMax]; the amber band extends each
 *             bound by |bound|·(1 − a). A missing bound is open-ended.
 */
import { isKpiRag, type KpiDirection, type KpiRag } from '@/types/package'
import { compareDateKeys, storedDateKey } from './periods'

export const DEFAULT_THRESHOLD_AMBER = 0.9

export interface KpiTargetSpec {
  direction: KpiDirection | string
  targetValue?: number | null
  targetMin?: number | null
  targetMax?: number | null
  thresholdAmber?: number | null
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Normalise `thresholdAmber` to a fraction in (0, 1]. Accepts percentages
 * (90 → 0.9); anything missing or out of range falls back to 0.9.
 */
export function normalizeThresholdAmber(value: number | null | undefined): number {
  if (!finite(value) || value <= 0) return DEFAULT_THRESHOLD_AMBER
  const fraction = value > 1 ? value / 100 : value
  return fraction > 0 && fraction <= 1 ? fraction : DEFAULT_THRESHOLD_AMBER
}

function band(bound: number, amber: number): number {
  return Math.abs(bound) * (1 - amber)
}

/** Small tolerance so 0.1 + 0.2-style float noise does not flip a boundary. */
const EPS = 1e-9

function ragIncrease(value: number, target: number, amber: number): KpiRag {
  if (value >= target - EPS) return 'GREEN'
  if (value >= target - band(target, amber) - EPS) return 'AMBER'
  return 'RED'
}

function ragDecrease(value: number, target: number, amber: number): KpiRag {
  if (value <= target + EPS) return 'GREEN'
  if (value <= target + band(target, amber) + EPS) return 'AMBER'
  return 'RED'
}

/** True when the KPI has a numeric target the RAG can be computed against. */
export function hasNumericTarget(spec: KpiTargetSpec): boolean {
  if (spec.direction === 'RANGE') return finite(spec.targetMin) || finite(spec.targetMax) || finite(spec.targetValue)
  return finite(spec.targetValue)
}

/** Computed RAG for a value, or null when it cannot be scored numerically. */
export function computeKpiRag(spec: KpiTargetSpec, value: number | null | undefined): KpiRag | null {
  if (!finite(value)) return null
  const amber = normalizeThresholdAmber(spec.thresholdAmber)
  switch (spec.direction) {
    case 'DECREASE':
      return finite(spec.targetValue) ? ragDecrease(value, spec.targetValue, amber) : null
    case 'RANGE': {
      const min = finite(spec.targetMin) ? spec.targetMin : null
      const max = finite(spec.targetMax) ? spec.targetMax : null
      if (min === null && max === null) {
        return finite(spec.targetValue) ? ragIncrease(value, spec.targetValue, amber) : null
      }
      const low = min === null ? 'GREEN' : ragIncrease(value, min, amber)
      const high = max === null ? 'GREEN' : ragDecrease(value, max, amber)
      if (low === 'RED' || high === 'RED') return 'RED'
      if (low === 'AMBER' || high === 'AMBER') return 'AMBER'
      return 'GREEN'
    }
    case 'INCREASE':
    default:
      return finite(spec.targetValue) ? ragIncrease(value, spec.targetValue, amber) : null
  }
}

/**
 * KPI-2: is a period scored? Readings for periods that end before `scoredFrom`
 * are shown as "Measured (not scored)". A period containing `scoredFrom` is scored.
 */
export function isPeriodScored(
  scoredFrom: Date | string | null | undefined,
  periodEnd: Date | string,
): boolean {
  if (!scoredFrom) return true
  return compareDateKeys(storedDateKey(periodEnd), storedDateKey(scoredFrom)) >= 0
}

export interface ResolvedReadingRag {
  /** The RAG to store and show (null = not scored). */
  rag: KpiRag | null
  /** What the numbers say (null when not computable or not scored). */
  computedRag: KpiRag | null
  /** True when `rag` comes from a manual choice rather than the numbers. */
  overridden: boolean
}

/**
 * RAG for one reading:
 *   - before `scoredFrom` → null (not scored), whatever was chosen;
 *   - a manual RAG (`manualRag`) wins: a manager override of a computed RAG, or
 *     the only RAG of a text-only / compound KPI (KPI-6);
 *   - otherwise the computed RAG.
 */
export function resolveReadingRag(input: {
  spec: KpiTargetSpec
  value: number | null | undefined
  scored: boolean
  manualRag?: string | null
}): ResolvedReadingRag {
  if (!input.scored) return { rag: null, computedRag: null, overridden: false }
  const computedRag = computeKpiRag(input.spec, input.value)
  if (isKpiRag(input.manualRag)) {
    return { rag: input.manualRag, computedRag, overridden: input.manualRag !== computedRag }
  }
  return { rag: computedRag, computedRag, overridden: false }
}

/** Tone for MiniBadge / StatusPill style chips. */
export function kpiRagTone(rag: KpiRag | null | undefined): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (rag === 'GREEN') return 'ok'
  if (rag === 'AMBER') return 'warn'
  if (rag === 'RED') return 'danger'
  return 'neutral'
}
