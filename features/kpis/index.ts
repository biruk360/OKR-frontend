/**
 * KPIs (KPI-1 … KPI-7) — client barrel.
 *
 * Server-only modules are imported by direct path from app/:
 *   features/kpis/services/kpis.server.ts            listKpis, getKpi, createKpi, updateKpi, retireKpi,
 *                                                     listKpiReadings, upsertKpiReading, loadKpiCalendar
 *   features/kpis/services/profile-summary.server.ts getKpisProfileSummary
 *   features/kpis/services/http.server.ts            route helpers
 * Pure rules (periods, RAG, QTD, overdue) live in lib/kpi.
 */
export { KpisProfileTab } from './components/KpisProfileTab'
export type { KpisProfileTabProps } from './components/KpisProfileTab'
export { KpiFormModal } from './components/KpiFormModal'
export { KpiReadingModal } from './components/KpiReadingModal'
export { KpiMetricCard } from './components/KpiMetricCard'
export { KpiHistoryTable } from './components/KpiHistoryTable'
export { KpiRagBadge, kpiRagColor } from './components/KpiRagBadge'
export { kpiKeys, useKpis, useKpiReadings, useCreateKpi, useUpdateKpi, useRetireKpi, useSaveKpiReading } from './hooks/queries'
export { kpisApi } from './services/api'
export type { KpiListParams, KpiApiError } from './services/api'
export {
  kpiCreateSchema,
  kpiUpdateSchema,
  kpiReadingUpsertSchema,
  kpiFormSchema,
  kpiReadingFormSchema,
  kpiFormToPayload,
  kpiReadingFormToPayload,
  EMPTY_KPI_FORM,
} from './services/schemas'
export type {
  KpiCreateInput,
  KpiUpdateInput,
  KpiReadingUpsertInput,
  KpiFormValues,
  KpiReadingFormValues,
} from './services/schemas'
export type {
  KpiPeriodView,
  KpiReadingView,
  KpiItemPermissions,
  KpiView,
  KpiListPermissions,
  KpiListResponse,
  KpiReadingsResponse,
  KpisProfileSummary,
} from './types'
