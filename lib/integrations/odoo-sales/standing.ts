/**
 * Odoo sales sync — a salesperson's standing against quota. Pure and client-safe.
 *
 * RAG reuses the KPI RAG rules (lib/kpi/rag.ts) with the pace as the target:
 *   quota     won ÷ expected-by-today    GREEN ≥ 1, AMBER ≥ thresholdAmber, else RED
 *   coverage  coverage ÷ coverage target  same thresholds
 */
import { computeKpiRag, DEFAULT_THRESHOLD_AMBER, type KpiTargetSpec } from '@/lib/kpi/rag'
import { compareDateKeys } from '@/lib/kpi/periods'
import type { KpiRag } from '@/types/package'
import { daysBetween, expectedBy, nextCheckpoint, paceTarget, parsePace, toEtb, type FiscalWindow, type PacePoint } from './pace'

export interface StandingInput {
  /** Annual target (ETB). Defaults to the pace's final checkpoint. */
  target?: number | null
  pace: readonly PacePoint[]
  fyStartKey: string
  fyEndKey: string
  /** Credited won to date (ETB). */
  won: number
  /** Credited open pipeline (ETB). */
  openPipeline: number
  /** Coverage target (x), e.g. 8. Null = coverage not scored. */
  coverageTarget: number | null
  /** KPI `thresholdAmber` (fraction). */
  thresholdAmber?: number | null
  todayKey: string
}

export interface Standing {
  target: number
  won: number
  expected: number
  /** won − expected (negative = behind pace). */
  gap: number
  /** max(target − won, 0). */
  remaining: number
  /** openPipeline ÷ remaining, or null once the quota is met. */
  coverage: number | null
  ragQuota: KpiRag | null
  ragCoverage: KpiRag | null
  nextCheckpoint: (PacePoint & { gap: number }) | null
  /** Remaining quota ÷ months left in the fiscal year (at least one month). */
  perMonthNeeded: number
}

const AVG_DAYS_PER_MONTH = 365.25 / 12

/** Quota RAG: won against the pace-expected value (lib/kpi/rag INCREASE rule). */
export function quotaRag(won: number, expected: number, thresholdAmber?: number | null): KpiRag | null {
  return computeKpiRag({ direction: 'INCREASE', targetValue: expected, thresholdAmber: thresholdAmber ?? DEFAULT_THRESHOLD_AMBER }, won)
}

/** Coverage RAG; GREEN once nothing remains to cover. */
export function coverageRag(coverage: number | null, coverageTarget: number | null, thresholdAmber?: number | null): KpiRag | null {
  if (coverageTarget == null || !Number.isFinite(coverageTarget)) return null
  if (coverage === null) return 'GREEN'
  return computeKpiRag(
    { direction: 'INCREASE', targetValue: coverageTarget, thresholdAmber: thresholdAmber ?? DEFAULT_THRESHOLD_AMBER },
    coverage,
  )
}

export function computeStanding(input: StandingInput): Standing {
  const target = input.target ?? paceTarget(input.pace) ?? 0
  const won = input.won
  const expected = expectedBy(input.pace, input.fyStartKey, input.todayKey)
  const remaining = Math.max(target - won, 0)
  const coverage = remaining > 0 ? input.openPipeline / remaining : null

  const next = nextCheckpoint(input.pace, input.todayKey)
  const daysLeft = compareDateKeys(input.todayKey, input.fyEndKey) < 0 ? daysBetween(input.todayKey, input.fyEndKey) : 0
  const monthsLeft = Math.max(daysLeft / AVG_DAYS_PER_MONTH, 1)

  return {
    target,
    won,
    expected,
    gap: won - expected,
    remaining,
    coverage,
    ragQuota: quotaRag(won, expected, input.thresholdAmber),
    ragCoverage: coverageRag(coverage, input.coverageTarget, input.thresholdAmber),
    nextCheckpoint: next ? { ...next, gap: Math.max(next.cumulative - won, 0) } : null,
    perMonthNeeded: remaining / monthsLeft,
  }
}

/**
 * The RAG a synced reading carries without an override, recomputed from its
 * stored value (used when a manager clears an override):
 *   ODOO_WON   value (in the KPI unit) against the pace-expected value on `atKey`
 *   otherwise  the standard KPI rule (coverage vs its x target, company % vs 100)
 */
export function syncedReadingRag(
  kpi: KpiTargetSpec & { externalSource: string | null; targetText: string; unit: string },
  value: number | null,
  fy: FiscalWindow,
  atKey: string,
): KpiRag | null {
  if (value === null || !Number.isFinite(value)) return null
  if (kpi.externalSource !== 'ODOO_WON') return computeKpiRag(kpi, value)
  try {
    const pace = parsePace(kpi.targetText, kpi.unit, fy)
    if (!pace.length) return null
    return quotaRag(toEtb(value, kpi.unit), expectedBy(pace, fy.startKey, atKey), kpi.thresholdAmber)
  } catch {
    return null
  }
}
