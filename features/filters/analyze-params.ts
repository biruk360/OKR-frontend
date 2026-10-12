/**
 * Pure helpers behind the Explorer's Analyze view (useFiltersData): how the
 * multi-select Owner filter maps onto the list APIs, the client-side segment
 * predicates for key results, and merging per-owner progress series.
 *
 * API support (checked 2026-10-12):
 *  - GET /api/objectives                accepts many owners (`ownerId` repeated or comma-separated).
 *  - GET /api/keyresults                accepts ONE `ownerId` → several owners are filtered here.
 *  - GET /api/filters/progress-timeseries accepts ONE `ownerId` → one request per owner, merged here.
 *  - GET /api/todos                     has no assignee filter → always filtered here.
 */
import { normalizeKrCommitment } from '@/lib/okr/kr-commitment'
import type { ProgressTimeseriesPoint, SegmentId } from './types'

/** Cap on parallel per-owner series requests; beyond it the series is left unfiltered by owner. */
export const MAX_PER_OWNER_SERIES = 12

function uniqueOwners(owners: readonly string[] | undefined): string[] {
  return Array.from(new Set((owners ?? []).map((o) => o.trim()).filter(Boolean)))
}

export interface OwnerPlan {
  /** Value for a single-owner API's `ownerId` param, or null to leave it off. */
  serverOwnerId: string | null
  /** Owners the client must keep (several picked on a single-owner API); null = no client filter. */
  clientOwnerIds: ReadonlySet<string> | null
}

/**
 * How to apply the Owner filter to an API that takes a single `ownerId`.
 * One owner → server side; several → no server param and a client filter.
 * The explicit filter overrides an owner a segment set (e.g. "Owned"), as before.
 */
export function planSingleOwnerFilter(owners: readonly string[] | undefined): OwnerPlan {
  const list = uniqueOwners(owners)
  if (list.length === 0) return { serverOwnerId: null, clientOwnerIds: null }
  if (list.length === 1) return { serverOwnerId: list[0], clientOwnerIds: null }
  return { serverOwnerId: null, clientOwnerIds: new Set(list) }
}

/** `ownerId` value for /api/objectives, which ORs a comma-separated list. Null when no owner is picked. */
export function multiOwnerParam(owners: readonly string[] | undefined): string | null {
  const list = uniqueOwners(owners)
  return list.length > 0 ? list.join(',') : null
}

/** Keeps rows whose owner is one of `ownerIds` (no-op when `ownerIds` is null/empty). */
export function filterByOwners<T extends { ownerId?: string | null }>(
  rows: T[],
  ownerIds: ReadonlySet<string> | readonly string[] | null | undefined,
): T[] {
  if (!ownerIds) return rows
  const set = ownerIds instanceof Set ? ownerIds : new Set(ownerIds as readonly string[])
  if (set.size === 0) return rows
  return rows.filter((r) => !!r.ownerId && set.has(r.ownerId))
}

/** Owners to request a progress series for one by one (null = one unfiltered-by-owner request). */
export function perOwnerSeriesOwners(owners: readonly string[] | undefined): string[] | null {
  const list = uniqueOwners(owners)
  if (list.length < 2 || list.length > MAX_PER_OWNER_SERIES) return null
  return list
}

/**
 * Merges progress series fetched per owner (same week buckets, disjoint KR
 * sets — a KR has one owner) into one: avgProgress is weighted by krCount.
 */
export function mergeProgressTimeseries(seriesList: ProgressTimeseriesPoint[][]): ProgressTimeseriesPoint[] {
  const nonEmpty = seriesList.filter((s) => s.length > 0)
  if (nonEmpty.length === 0) return []
  if (nonEmpty.length === 1) return nonEmpty[0]
  const byDate = new Map<string, { label: string; date: string; weighted: number; krCount: number }>()
  for (const series of nonEmpty) {
    for (const p of series) {
      const acc = byDate.get(p.date) ?? { label: p.label, date: p.date, weighted: 0, krCount: 0 }
      acc.weighted += (p.avgProgress ?? 0) * (p.krCount ?? 0)
      acc.krCount += p.krCount ?? 0
      byDate.set(p.date, acc)
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({
      label: a.label,
      date: a.date,
      avgProgress: a.krCount ? Math.round(a.weighted / a.krCount) : 0,
      krCount: a.krCount,
    }))
}

// ─── Key-result segments evaluated on the client ────────────────────────────

/** Query flag sent with the KPI-8 segment so /api/keyresults can filter server side once it supports it. */
export const KR_LINKED_TO_KPI_PARAM = 'linkedToKpi'

/**
 * Number of KPIs a KR row is linked to (KPI-8), from whichever shape the KR
 * list returns: `_count.kpis`, `kpiCount`, or a `kpis` array. Null when the
 * row carries no KPI data at all.
 */
export function linkedKpiCount(kr: Record<string, any>): number | null {
  if (typeof kr?._count?.kpis === 'number') return kr._count.kpis
  if (typeof kr?.kpiCount === 'number') return kr.kpiCount
  if (Array.isArray(kr?.kpis)) return kr.kpis.length
  return null
}

/**
 * Client-side predicate for KR segments the list API can't filter on (null =
 * the segment needs no client filter). "Linked to a KPI" (KPI-8) keeps only
 * rows that report at least one linked KPI, so a list API without KPI data
 * yields an empty segment rather than every KR.
 */
export function krSegmentPredicate(segmentId: SegmentId | null): ((kr: Record<string, any>) => boolean) | null {
  switch (segmentId) {
    case 'kr-tagged-kpi':
      return (kr) => (linkedKpiCount(kr) ?? 0) > 0
    case 'kr-committed':
      return (kr) => normalizeKrCommitment(kr?.commitment) === 'COMMITTED'
    case 'kr-aspirational':
      return (kr) => normalizeKrCommitment(kr?.commitment) === 'ASPIRATIONAL'
    default:
      return null
  }
}
