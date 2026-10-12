/**
 * Employee Operating Package — canonical in-app paths.
 *
 * One place for "where does this package item live?", shared by the activity
 * log hydration (AUD-3), notification deep links (§9) and profile summary
 * cards. Pure and client-safe.
 */
import { profileTabHref, type ProfileTab } from '@/types/package'

export { profileTabHref } from '@/types/package'

/** Company Dependency Map (DEP-6). `?dependency=` focuses one row. */
export const DEPENDENCY_MAP_PATH = '/dashboard/okrs-all/dependencies'
/** Decisions page (DEC-1 list + log). `?decision=` opens one decision. */
export const DECISIONS_PATH = '/dashboard/decisions'

export function dependencyMapHref(dependencyId?: string | null): string {
  return dependencyId ? `${DEPENDENCY_MAP_PATH}?dependency=${encodeURIComponent(dependencyId)}` : DEPENDENCY_MAP_PATH
}

export function decisionHref(decisionId?: string | null): string {
  return decisionId ? `${DECISIONS_PATH}?decision=${encodeURIComponent(decisionId)}` : DECISIONS_PATH
}

export function objectiveHref(objectiveId: string): string {
  return `/dashboard/objectives/${encodeURIComponent(objectiveId)}`
}

export function keyResultHref(keyResultId: string): string {
  return `/dashboard/key-results/${encodeURIComponent(keyResultId)}`
}

/** ActivityLog entity types introduced by the package module (AUD-1). */
export const PACKAGE_ACTIVITY_ENTITY_TYPES = [
  'OKR_LINK',
  'KR_CHECKPOINT',
  'RECURRING_DUTY',
  'ROLE_DEFINITION',
  'KPI',
  'KPI_READING',
  'DEVELOPMENT_ITEM',
  'WORK_DEPENDENCY',
  'DECISION',
  'OPERATING_PACKAGE',
] as const
export type PackageActivityEntityType = (typeof PACKAGE_ACTIVITY_ENTITY_TYPES)[number]

export function isPackageActivityEntityType(value: unknown): value is PackageActivityEntityType {
  return typeof value === 'string' && (PACKAGE_ACTIVITY_ENTITY_TYPES as readonly string[]).includes(value)
}

/** Profile tab that shows each person-owned package entity. */
const ENTITY_TAB: Partial<Record<PackageActivityEntityType, ProfileTab>> = {
  RECURRING_DUTY: 'role',
  ROLE_DEFINITION: 'role',
  KPI: 'kpis',
  KPI_READING: 'kpis',
  DEVELOPMENT_ITEM: 'development',
  OPERATING_PACKAGE: 'overview',
}

/**
 * Metadata convention for package ActivityLog rows (Scrum pattern: ids live in
 * `metadata`, not in dedicated columns). Writers: lib/package/audit.ts.
 */
export interface PackageActivityMetadata {
  /** Id of the package entity the row is about. */
  entityId?: string
  /** The person whose package this belongs to (owner / subject). */
  userId?: string
  timeframeId?: string
  packageId?: string
  /** OKR_LINK: link ends. */
  fromType?: string
  fromId?: string
  toType?: string
  toId?: string
  /** KR_CHECKPOINT / KPI linked KR. */
  keyResultId?: string
  /** PKG-3: the edit happened after the package was APPROVED. */
  editedAfterApproval?: boolean
  [key: string]: unknown
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Deep link for a package ActivityLog row, or null when the row carries too
 * little to place it. Person-owned entities open the owner's profile tab;
 * dependencies and decisions open their company pages; OKR links and KR
 * checkpoints open the OKR item.
 */
export function packageActivityHref(
  entityType: string | null | undefined,
  metadata: unknown,
  columns: { objectiveId?: string | null; keyResultId?: string | null } = {},
): string | null {
  if (!isPackageActivityEntityType(entityType)) return null
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as PackageActivityMetadata
  const entityId = str(m.entityId)
  switch (entityType) {
    case 'WORK_DEPENDENCY':
      return dependencyMapHref(entityId)
    case 'DECISION':
      return decisionHref(entityId)
    case 'KR_CHECKPOINT': {
      const kr = str(m.keyResultId) ?? str(columns.keyResultId)
      return kr ? keyResultHref(kr) : null
    }
    case 'OKR_LINK': {
      const fromType = str(m.fromType)
      const fromId = str(m.fromId)
      if (fromType === 'KEY_RESULT' && fromId) return keyResultHref(fromId)
      if (fromType === 'OBJECTIVE' && fromId) return objectiveHref(fromId)
      if (columns.keyResultId) return keyResultHref(columns.keyResultId)
      if (columns.objectiveId) return objectiveHref(columns.objectiveId)
      return null
    }
    default: {
      const userId = str(m.userId)
      const tab = ENTITY_TAB[entityType]
      return userId && tab ? profileTabHref(userId, tab) : null
    }
  }
}
