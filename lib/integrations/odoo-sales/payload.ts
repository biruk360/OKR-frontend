/**
 * Odoo sales sync — the OKR → Odoo payload contract (`okr-sales-targets/v1`).
 * Pure and client-safe.
 *
 * Full state every time (not a delta): Odoo upserts `x_sales_target` by
 * (login, fiscal-year name) and archives targets of the same fiscal year whose
 * email is absent. Amounts are plain ETB numbers; dates are `YYYY-MM-DD`.
 */
import type { KpiRag } from '@/types/package'
import type { OkrActionItem } from './okr-items'
import type { PacePoint } from './pace'

export const SALES_TARGETS_SCHEMA = 'okr-sales-targets/v1'

export interface SalesTargetEntry {
  email: string
  kpiRef: string
  kpiName: string
  target: number
  unit: 'ETB'
  pace: PacePoint[]
  coverageTarget: number | null
  coverageKpiRef: string | null
  okr: {
    /** Credited won to date (ETB), or null when the person is not matched in Odoo. */
    won: number | null
    expected: number
    rag: KpiRag | null
    coverage: number | null
    items: OkrActionItem[]
  }
  okrUrl: string
}

export interface SalesTargetsPayload {
  secret?: string
  schema: typeof SALES_TARGETS_SCHEMA
  sentAt: string
  fiscalYear: { name: string; start: string; end: string }
  company: { kpiRef: string; target: number; pace: PacePoint[] } | null
  targets: SalesTargetEntry[]
}

/** "FY 2026/27" → "FY2026/27" (the key Odoo stores in `x_fiscal_year`). */
export function fiscalYearName(timeframeName: string): string {
  return timeframeName.replace(/\s+/g, '')
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundRatio(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100
}

function roundPace(pace: readonly PacePoint[]): PacePoint[] {
  return pace.map((p) => ({ date: p.date, cumulative: roundMoney(p.cumulative) }))
}

export interface BuildPayloadInput {
  sentAt: Date
  fiscalYear: { name: string; startKey: string; endKey: string }
  company: { kpiRef: string; target: number; pace: readonly PacePoint[] } | null
  targets: readonly SalesTargetEntry[]
}

/**
 * The payload, ordered by email. Pass `secret` only for the webhook POST; the
 * read-only endpoint serves it without one.
 */
export function buildSalesTargetsPayload(input: BuildPayloadInput, secret?: string): SalesTargetsPayload {
  const targets = [...input.targets]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((t) => ({
      ...t,
      target: roundMoney(t.target),
      pace: roundPace(t.pace),
      okr: {
        ...t.okr,
        won: t.okr.won === null ? null : roundMoney(t.okr.won),
        expected: Math.round(t.okr.expected),
        coverage: roundRatio(t.okr.coverage),
      },
    }))
  return {
    ...(secret ? { secret } : {}),
    schema: SALES_TARGETS_SCHEMA,
    sentAt: input.sentAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    fiscalYear: { name: input.fiscalYear.name, start: input.fiscalYear.startKey, end: input.fiscalYear.endKey },
    company: input.company
      ? { kpiRef: input.company.kpiRef, target: roundMoney(input.company.target), pace: roundPace(input.company.pace) }
      : null,
    targets,
  }
}
