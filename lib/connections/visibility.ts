/**
 * Connections — pure visibility verdicts for the non-OKR items a connections
 * payload can contain (CON-8). Objectives and key results use
 * lib/okr/visibility-scope.ts; duties, KPIs and development items use the §8
 * matrix in lib/package/access.ts (see `buildPackageVisibility` in ./service.ts).
 * This file covers the remaining pieces: the KPI area, project milestones and the
 * quick "is the viewer a party" decision rule.
 */
import type { PackageArea } from '@/types/package'

/** Areas of lib/package/access.ts that a connection row can fall under. */
export type PackageItemArea = Extract<PackageArea, 'duties' | 'kpis' | 'kpis_sensitive' | 'development'>

/** `(area, ownerId) => visible in full`; false means render the row redacted. */
export type PackageVisibilityFn = (area: PackageItemArea, ownerId: string) => boolean

/** KPI area: sensitive KPIs need the sensitive rule (KPI-7). */
export function kpiArea(kpi: { isSensitive: boolean }): PackageItemArea {
  return kpi.isSensitive ? 'kpis_sensitive' : 'kpis'
}

/**
 * Mirrors `getReadableProject` (lib/projects/access.ts): ADMIN/EXECUTIVE, the project
 * manager, a project member, or a member of the project's department.
 */
export function projectReadable(
  viewer: { userId: string; seesAll: boolean; departmentIds: ReadonlySet<string> },
  project: { projectManagerId: string; departmentId: string | null; memberIds: readonly string[] },
): boolean {
  if (viewer.seesAll) return true
  if (project.projectManagerId === viewer.userId) return true
  if (project.memberIds.includes(viewer.userId)) return true
  return !!project.departmentId && viewer.departmentIds.has(project.departmentId)
}

/**
 * Fast path for a decision linked to an item: shown when the viewer is a party to it
 * (decider, requester or a linked USER) or sees everything. Seeing the linked item is
 * NOT enough — company / department KRs are public, and the §8 decision rule is
 * record-level. When this says no, the service asks `resolveDecisionAccess`
 * (lib/package/access.ts: HR, managers / leads / peers of the people involved), the
 * same rule GET /api/decisions/[id] applies.
 */
export function decisionVisible(
  viewer: { userId: string; seesAll: boolean },
  decision: { deciderId: string; requestedById: string | null; linkedUserIds: readonly string[] },
): boolean {
  if (viewer.seesAll) return true
  if (decision.deciderId === viewer.userId || decision.requestedById === viewer.userId) return true
  return decision.linkedUserIds.includes(viewer.userId)
}
