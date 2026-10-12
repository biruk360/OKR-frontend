/**
 * KPI feature — JSON contract between the KPI API (app/api/package/kpis) and
 * the profile tab. Client-safe. Value sets and labels live in types/package.ts.
 */
import type {
  KpiDirection,
  KpiFrequency,
  KpiRag,
  KpiReadingSource,
  KpiStatus,
  KpiType,
} from '@/types/package'

export interface KpiPeriodView {
  /** `YYYY-MM-DD`, first day. */
  startKey: string
  /** `YYYY-MM-DD`, last day (inclusive). */
  endKey: string
  label: string
}

export interface KpiReadingView {
  id: string
  kpiId: string
  period: KpiPeriodView
  value: number | null
  valueText: string | null
  /** Stored RAG (null = not scored). */
  rag: KpiRag | null
  /** What the numbers say right now (null when not computable or not scored). */
  computedRag: KpiRag | null
  ragOverridden: boolean
  /** False before the KPI's `scoredFrom` (KPI-2: "Measured (not scored)"). */
  scored: boolean
  note: string | null
  source: KpiReadingSource
  enteredBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface KpiItemPermissions {
  canEdit: boolean
  canRetire: boolean
  canEnterReading: boolean
  /** Manager override of a computed RAG (never on one's own KPI). */
  canOverrideRag: boolean
}

export interface KpiView {
  id: string
  externalRef: string | null
  ownerId: string
  timeframeId: string
  packageId: string | null
  name: string
  kpiType: KpiType
  definition: string
  formula: string | null
  dataSource: string | null
  unit: string
  direction: KpiDirection
  baselineText: string | null
  baselineValue: number | null
  targetText: string
  targetValue: number | null
  targetMin: number | null
  targetMax: number | null
  thresholdAmber: number
  frequency: KpiFrequency
  /** ISO date (`YYYY-MM-DD`) or null. */
  scoredFrom: string | null
  keyResultId: string | null
  /** Linked KR; title replaced by the private placeholder when the viewer sees it redacted. */
  keyResult: { id: string; title: string; isRedacted: boolean } | null
  isSensitive: boolean
  status: KpiStatus
  note: string | null
  /** True when the KPI has a numeric target (else RAG is manual — KPI-6). */
  numericTarget: boolean
  createdAt: string
  updatedAt: string
  /** KPI-4 card figures. */
  latest: KpiReadingView | null
  /** Last 12 numeric readings, oldest first. */
  sparkline: number[]
  qtd: { average: number; count: number; quarterLabel: string } | null
  currentPeriod: KpiPeriodView
  currentReading: KpiReadingView | null
  /** KPI-5: ended > 3 working days ago without a reading. */
  overduePeriods: KpiPeriodView[]
  permissions: KpiItemPermissions
}

export interface KpiListPermissions {
  /** Create a KPI for this person (manager chain, department lead, ADMIN/EXEC). */
  canCreate: boolean
  /** May create / edit sensitive KPIs (manager chain, ADMIN/EXEC). */
  canManageSensitive: boolean
  /** Sees sensitive KPIs (owner, manager chain, package.kpi.sensitive.read). */
  canViewSensitive: boolean
  canEnterReadings: boolean
  isSelf: boolean
  /** The timeframe has ended: definitions are read-only (readings may still be entered). */
  timeframeEnded: boolean
}

export interface KpiListResponse {
  data: KpiView[]
  permissions: KpiListPermissions
  timeframe: { id: string; name: string; startDate: string; endDate: string } | null
}

export interface KpiReadingsResponse {
  kpi: KpiView
  data: KpiReadingView[]
  /** Periods the viewer may enter a reading for (current + past within the timeframe), newest first. */
  enterablePeriods: KpiPeriodView[]
}

/** PRF-2 Overview "KPI health" figures. */
export interface KpisProfileSummary {
  green: number
  amber: number
  red: number
  notScored: number
  overdueReadings: number
  total: number
}
