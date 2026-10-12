/**
 * Shared helpers for the metric-mapping routes (KPI-9 adds package KPIs as a
 * metric source next to Key Results and Daily Scrum metrics).
 *
 * KPI visibility follows the package matrix (lib/package/access.ts): a mapping
 * admin sees an employee's KPIs when the `kpis` area is visible to them, and
 * sensitive KPIs (KPI-7) only with `kpis_sensitive`. Hidden KPIs are returned
 * as a redacted placeholder so a re-save keeps the existing link.
 */
import type { Session } from 'next-auth'
import { canManageTemplates, hasPerformancePermission } from '@/lib/performance'
import { filterSubjectsByArea, loadPackageViewer } from '@/lib/package/access'

export async function canManageMappings(
  actor: { userId: string; role: string },
  action: 'read' | 'write' | 'delete',
): Promise<boolean> {
  return await canManageTemplates(actor, 'button.performance.template.map-metric')
    && await hasPerformancePermission(actor, 'metric_source_mapping', action)
}

/** Prisma select for a KPI shown on a mapping or in the picker. */
export const MAPPING_KPI_SELECT = {
  id: true,
  name: true,
  unit: true,
  direction: true,
  frequency: true,
  status: true,
  isSensitive: true,
  ownerId: true,
  timeframe: { select: { id: true, name: true } },
} as const

export type MappingKpiRow = {
  id: string
  name: string
  unit: string
  direction: string
  frequency: string
  status: string
  isSensitive: boolean
  ownerId: string
  timeframe: { id: string; name: string } | null
}

export type MappingKpiView = MappingKpiRow & { redacted: boolean }

export const RESTRICTED_KPI_NAME = 'Restricted KPI'

export interface KpiVisibility {
  canView(ownerId: string, isSensitive: boolean): boolean
}

/** One viewer load + two membership-batched checks for every KPI owner. */
export async function loadKpiVisibility(session: Session, ownerIds: Iterable<string>): Promise<KpiVisibility> {
  const ids = Array.from(new Set(ownerIds)).filter(Boolean)
  if (ids.length === 0) return { canView: () => false }
  const viewer = await loadPackageViewer(session)
  const [kpis, sensitive] = await Promise.all([
    filterSubjectsByArea(viewer, ids, 'kpis', 'view'),
    filterSubjectsByArea(viewer, ids, 'kpis_sensitive', 'view'),
  ])
  return {
    canView: (ownerId, isSensitive) => (isSensitive ? sensitive.has(ownerId) : kpis.has(ownerId)),
  }
}

export function viewKpi(kpi: MappingKpiRow, visibility: KpiVisibility): MappingKpiView {
  if (visibility.canView(kpi.ownerId, kpi.isSensitive)) return { ...kpi, redacted: false }
  return {
    id: kpi.id,
    name: RESTRICTED_KPI_NAME,
    unit: '',
    direction: kpi.direction,
    frequency: kpi.frequency,
    status: kpi.status,
    isSensitive: kpi.isSensitive,
    ownerId: kpi.ownerId,
    timeframe: null,
    redacted: true,
  }
}

/** Redact the `kpi` of every mapping the viewer may not see. */
export async function redactMappingKpis<T extends { kpi: MappingKpiRow | null }>(
  session: Session,
  mappings: T[],
): Promise<Array<Omit<T, 'kpi'> & { kpi: MappingKpiView | null }>> {
  const owners = mappings.flatMap((mapping) => (mapping.kpi ? [mapping.kpi.ownerId] : []))
  const visibility = owners.length > 0 ? await loadKpiVisibility(session, owners) : { canView: () => false }
  return mappings.map((mapping) => ({ ...mapping, kpi: mapping.kpi ? viewKpi(mapping.kpi, visibility) : null }))
}

export function uniqueIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return Array.from(new Set<string>(raw.filter((id: unknown): id is string => typeof id === 'string' && !!id)))
}
