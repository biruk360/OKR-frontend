/**
 * Pure KPI rules for the API: per-item permissions (§8 / KPI-7) and the
 * row → KpiView / KpiReadingView mapping (KPI-2, KPI-4, KPI-5). No I/O, so it is
 * unit-tested directly (kpi-view.test.ts).
 */
import {
  canEditPackageAreaResolved,
  canEnterKpiReadingResolved,
  canViewPackageAreaResolved,
  type PackageAccessFacts,
} from '@/lib/package/access'
import {
  compareDateKeys,
  dateKeyInZone,
  formatDateKey,
  kpiPeriodForKey,
  listKpiPeriods,
  storedDateKey,
  type KpiPeriod,
  type KpiPeriodOptions,
} from '@/lib/kpi/periods'
import { computeKpiRag, hasNumericTarget, isPeriodScored, normalizeThresholdAmber } from '@/lib/kpi/rag'
import { findOverduePeriods, maxDateKey, quarterToDateAverage, sparklineSeries } from '@/lib/kpi/stats'
import {
  isKpiDirection,
  isKpiFrequency,
  isKpiRag,
  isKpiReadingSource,
  isKpiStatus,
  isKpiType,
  type KpiFrequency,
} from '@/types/package'
import type {
  KpiItemPermissions,
  KpiListPermissions,
  KpiPeriodView,
  KpiReadingView,
  KpiView,
} from '../types'

// ---------------------------------------------------------------------------
// Row shapes (what the server service selects)
// ---------------------------------------------------------------------------

export interface KpiRow {
  id: string
  externalRef: string | null
  ownerId: string
  timeframeId: string
  packageId: string | null
  name: string
  kpiType: string
  definition: string
  formula: string | null
  dataSource: string | null
  unit: string
  direction: string
  baselineText: string | null
  baselineValue: number | null
  targetText: string
  targetValue: number | null
  targetMin: number | null
  targetMax: number | null
  thresholdAmber: number
  frequency: string
  scoredFrom: Date | null
  keyResultId: string | null
  isSensitive: boolean
  status: string
  note: string | null
  createdAt: Date
  updatedAt: Date
}

export interface KpiReadingRow {
  id: string
  kpiId: string
  periodStart: Date
  periodEnd: Date
  value: number | null
  valueText: string | null
  rag: string | null
  ragOverridden: boolean
  note: string | null
  source: string
  enteredBy: { id: string; name: string } | null
  createdAt: Date
  updatedAt: Date
}

export interface KpiCalendar {
  /** Today in the org timezone. */
  todayKey: string
  timeZone: string
  holidays: ReadonlySet<string>
}

export interface KpiTimeframeWindow {
  /** Month (0–11) the fiscal year starts in (from the timeframe start). */
  fiscalStartMonth: number
  startKey: string
  endKey: string
}

// ---------------------------------------------------------------------------
// Permissions (§8, KPI-7)
// ---------------------------------------------------------------------------

/** True when the timeframe's last day is before today. */
export function isTimeframeEnded(window: Pick<KpiTimeframeWindow, 'endKey'>, todayKey: string): boolean {
  return compareDateKeys(window.endKey, todayKey) < 0
}

/** May the viewer see this KPI at all? Sensitive KPIs need the `kpis_sensitive` area (KPI-7). */
export function canViewKpi(f: PackageAccessFacts, kpi: { isSensitive: boolean }): boolean {
  if (!canViewPackageAreaResolved(f, 'kpis')) return false
  return !kpi.isSensitive || canViewPackageAreaResolved(f, 'kpis_sensitive')
}

/**
 * Create / edit / retire a KPI definition. Self never edits their own
 * definitions; sensitive KPIs need the manager chain or ADMIN/EXEC. Past
 * timeframes are read-only (PRF-3) except for ADMIN/EXEC.
 */
export function canEditKpiDefinition(
  f: PackageAccessFacts,
  kpi: { isSensitive: boolean },
  opts: { timeframeEnded: boolean },
): boolean {
  if (opts.timeframeEnded && !f.seesAll) return false
  if (!canEditPackageAreaResolved(f, 'kpis')) return false
  return !kpi.isSensitive || canEditPackageAreaResolved(f, 'kpis_sensitive')
}

export function kpiItemPermissions(
  f: PackageAccessFacts,
  kpi: { isSensitive: boolean; status: string },
  opts: { timeframeEnded: boolean },
): KpiItemPermissions {
  const canEdit = canEditKpiDefinition(f, kpi, opts)
  const canEnterReading = kpi.status === 'ACTIVE' && canEnterKpiReadingResolved(f, { isSensitive: kpi.isSensitive })
  return {
    canEdit,
    canRetire: canEdit && kpi.status === 'ACTIVE',
    canEnterReading,
    canOverrideRag: canEnterReading && !f.isSelf,
  }
}

export function kpiListPermissions(f: PackageAccessFacts, opts: { timeframeEnded: boolean }): KpiListPermissions {
  return {
    canCreate: canEditKpiDefinition(f, { isSensitive: false }, opts),
    canManageSensitive: canEditKpiDefinition(f, { isSensitive: true }, opts),
    canViewSensitive: canViewPackageAreaResolved(f, 'kpis_sensitive'),
    canEnterReadings: canEnterKpiReadingResolved(f),
    isSelf: f.isSelf,
    timeframeEnded: opts.timeframeEnded,
  }
}

/**
 * Who may set a manual RAG on a reading:
 *   - text-only / compound KPIs (no numeric target): anyone entering the reading (KPI-6)
 *   - numeric KPIs: only an override by someone other than the owner (manager)
 */
export function canSetManualRag(perms: KpiItemPermissions, numericTarget: boolean): boolean {
  if (!perms.canEnterReading) return false
  return numericTarget ? perms.canOverrideRag : true
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function frequencyOf(kpi: Pick<KpiRow, 'frequency'>): KpiFrequency {
  return isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY'
}

function periodView(p: KpiPeriod): KpiPeriodView {
  return { startKey: p.startKey, endKey: p.endKey, label: p.label }
}

/** Period of a stored reading; labels a non-canonical (legacy) span by its dates. */
export function readingPeriodView(kpi: Pick<KpiRow, 'frequency'>, reading: Pick<KpiReadingRow, 'periodStart' | 'periodEnd'>, opts: KpiPeriodOptions): KpiPeriodView {
  const startKey = storedDateKey(reading.periodStart)
  const endKey = storedDateKey(reading.periodEnd)
  const canonical = kpiPeriodForKey(frequencyOf(kpi), startKey, opts)
  if (canonical.startKey === startKey && canonical.endKey === endKey) return periodView(canonical)
  return { startKey, endKey, label: `${formatDateKey(startKey)} – ${formatDateKey(endKey)}` }
}

export function toKpiReadingView(kpi: KpiRow, reading: KpiReadingRow, opts: KpiPeriodOptions): KpiReadingView {
  const scored = isPeriodScored(kpi.scoredFrom, reading.periodEnd)
  return {
    id: reading.id,
    kpiId: reading.kpiId,
    period: readingPeriodView(kpi, reading, opts),
    value: reading.value,
    valueText: reading.valueText,
    rag: scored && isKpiRag(reading.rag) ? reading.rag : null,
    computedRag: scored ? computeKpiRag(kpi, reading.value) : null,
    ragOverridden: reading.ragOverridden,
    scored,
    note: reading.note,
    source: isKpiReadingSource(reading.source) ? reading.source : 'MANUAL',
    enteredBy: reading.enteredBy,
    createdAt: reading.createdAt.toISOString(),
    updatedAt: reading.updatedAt.toISOString(),
  }
}

/** The period readings currently go into: today's, clamped to the timeframe. */
export function currentKpiPeriod(kpi: Pick<KpiRow, 'frequency'>, window: KpiTimeframeWindow, todayKey: string): KpiPeriod {
  let ref = todayKey
  if (compareDateKeys(ref, window.endKey) > 0) ref = window.endKey
  if (compareDateKeys(ref, window.startKey) < 0) ref = window.startKey
  return kpiPeriodForKey(frequencyOf(kpi), ref, { fiscalStartMonth: window.fiscalStartMonth })
}

/**
 * Periods a reading may be entered for: every period overlapping the timeframe
 * that has started by today, newest first (capped).
 */
export function enterableKpiPeriods(
  kpi: Pick<KpiRow, 'frequency'>,
  window: KpiTimeframeWindow,
  todayKey: string,
  limit = 60,
): KpiPeriod[] {
  const last = compareDateKeys(todayKey, window.endKey) < 0 ? todayKey : window.endKey
  const periods = listKpiPeriods(frequencyOf(kpi), window.startKey, last, { fiscalStartMonth: window.fiscalStartMonth })
  return periods.reverse().slice(0, limit)
}

/** Is `periodStartKey` one of the enterable periods? */
export function isEnterablePeriod(kpi: Pick<KpiRow, 'frequency'>, window: KpiTimeframeWindow, todayKey: string, periodStartKey: string): boolean {
  const opts = { fiscalStartMonth: window.fiscalStartMonth }
  const period = kpiPeriodForKey(frequencyOf(kpi), periodStartKey, opts)
  if (compareDateKeys(period.startKey, todayKey) > 0) return false
  // Overlaps the timeframe.
  return compareDateKeys(period.endKey, window.startKey) >= 0 && compareDateKeys(period.startKey, window.endKey) <= 0
}

export function toKpiView(input: {
  kpi: KpiRow
  readings: readonly KpiReadingRow[]
  window: KpiTimeframeWindow
  calendar: KpiCalendar
  permissions: KpiItemPermissions
  keyResult: { id: string; title: string; isRedacted: boolean } | null
}): KpiView {
  const { kpi, window, calendar } = input
  const opts = { fiscalStartMonth: window.fiscalStartMonth }
  const frequency = frequencyOf(kpi)
  const readingViews = [...input.readings]
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((r) => toKpiReadingView(kpi, r, opts))
  const latest = readingViews.length ? readingViews[readingViews.length - 1] : null
  const current = currentKpiPeriod(kpi, window, calendar.todayKey)
  const currentReading = readingViews.find((r) => r.period.startKey === current.startKey) ?? null

  const plain = readingViews.map((r) => ({ periodStart: r.period.startKey, value: r.value }))
  const qtdRef = compareDateKeys(calendar.todayKey, window.endKey) > 0 ? window.endKey : calendar.todayKey
  const qtd = quarterToDateAverage(plain, qtdRef, window.fiscalStartMonth)

  const overdue =
    kpi.status === 'ACTIVE'
      ? findOverduePeriods({
          frequency,
          fiscalStartMonth: window.fiscalStartMonth,
          windowStartKey: maxDateKey(window.startKey, dateKeyInZone(kpi.createdAt, calendar.timeZone)),
          windowEndKey: window.endKey,
          todayKey: calendar.todayKey,
          readingStartKeys: new Set(readingViews.map((r) => r.period.startKey)),
          holidays: calendar.holidays,
        })
      : []

  return {
    id: kpi.id,
    externalRef: kpi.externalRef,
    ownerId: kpi.ownerId,
    timeframeId: kpi.timeframeId,
    packageId: kpi.packageId,
    name: kpi.name,
    kpiType: isKpiType(kpi.kpiType) ? kpi.kpiType : 'LEADING',
    definition: kpi.definition,
    formula: kpi.formula,
    dataSource: kpi.dataSource,
    unit: kpi.unit,
    direction: isKpiDirection(kpi.direction) ? kpi.direction : 'INCREASE',
    baselineText: kpi.baselineText,
    baselineValue: kpi.baselineValue,
    targetText: kpi.targetText,
    targetValue: kpi.targetValue,
    targetMin: kpi.targetMin,
    targetMax: kpi.targetMax,
    thresholdAmber: normalizeThresholdAmber(kpi.thresholdAmber),
    frequency,
    scoredFrom: kpi.scoredFrom ? storedDateKey(kpi.scoredFrom) : null,
    keyResultId: kpi.keyResultId,
    keyResult: input.keyResult,
    isSensitive: kpi.isSensitive,
    status: isKpiStatus(kpi.status) ? kpi.status : 'ACTIVE',
    note: kpi.note,
    numericTarget: hasNumericTarget(kpi),
    createdAt: kpi.createdAt.toISOString(),
    updatedAt: kpi.updatedAt.toISOString(),
    latest,
    sparkline: sparklineSeries(plain),
    qtd: qtd ? { average: qtd.average, count: qtd.count, quarterLabel: qtd.quarter.label } : null,
    currentPeriod: periodView(current),
    currentReading,
    overduePeriods: overdue.map(periodView),
    permissions: input.permissions,
  }
}
