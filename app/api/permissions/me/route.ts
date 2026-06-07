import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess } from '@/lib/api/apiResponse'
import { getUserActiveRoleIds, getUserActiveRoleKeys } from '@/lib/permission-resolver'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocTypePermissionMap {
  [doctypeKey: string]: {
    canRead: boolean
    canWrite: boolean
    canCreate: boolean
    canDelete: boolean
    canSubmit: boolean
    canExport: boolean
    canPrint: boolean
    canShare: boolean
    canImport: boolean
    canReport: boolean
    applyScoping: boolean
  }
}

interface FeaturePermissionMap {
  [featureKey: string]: {
    visible: boolean
    enabled: boolean
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** OR-merge two doctype permission objects: true wins over false. */
function mergeDocTypePermission(
  base: DocTypePermissionMap[string],
  next: DocTypePermissionMap[string]
): DocTypePermissionMap[string] {
  return {
    canRead:      base.canRead      || next.canRead,
    canWrite:     base.canWrite     || next.canWrite,
    canCreate:    base.canCreate    || next.canCreate,
    canDelete:    base.canDelete    || next.canDelete,
    canSubmit:    base.canSubmit    || next.canSubmit,
    canExport:    base.canExport    || next.canExport,
    canPrint:     base.canPrint     || next.canPrint,
    canShare:     base.canShare     || next.canShare,
    canImport:    base.canImport    || next.canImport,
    canReport:    base.canReport    || next.canReport,
    applyScoping: base.applyScoping && next.applyScoping, // AND: scoping only drops if all roles drop it
  }
}

/** Merge features without combining visible/enabled flags from different roles. */
function mergeFeaturePermission(
  base: FeaturePermissionMap[string],
  next: FeaturePermissionMap[string]
): FeaturePermissionMap[string] {
  const available = (base.visible && base.enabled) || (next.visible && next.enabled)
  return {
    visible: base.visible || next.visible,
    enabled: available,
  }
}

const now = (): Date => new Date()

const ACTION_FIELDS: Record<string, keyof DocTypePermissionMap[string]> = {
  read: 'canRead',
  write: 'canWrite',
  create: 'canCreate',
  delete: 'canDelete',
  submit: 'canSubmit',
  export: 'canExport',
  print: 'canPrint',
  share: 'canShare',
  import: 'canImport',
  report: 'canReport',
}

const EMPTY_DOCTYPE_PERMISSION: DocTypePermissionMap[string] = {
  canRead: false,
  canWrite: false,
  canCreate: false,
  canDelete: false,
  canSubmit: false,
  canExport: false,
  canPrint: false,
  canShare: false,
  canImport: false,
  canReport: false,
  applyScoping: false,
}

// ---------------------------------------------------------------------------
// GET /api/permissions/me
// Returns the calling user's effective permissions (union across active roles).
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req, { session }) => {
  const userId = session.user.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any

  const [activeRoleIds, activeRoleKeys, overrides] = await Promise.all([
    getUserActiveRoleIds(userId),
    getUserActiveRoleKeys(userId),
    db.userPermissionOverride.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }] },
      orderBy: { grantedAt: 'asc' },
    }),
  ])

  const activeRoles = await db.role.findMany({
    where: { id: { in: activeRoleIds } },
    include: {
      doctypePermissions: true,
      featurePermissions: true,
    },
  })

  // Build union maps
  const doctypePermissions: DocTypePermissionMap = {}
  const featurePermissions: FeaturePermissionMap = {}

  for (const role of activeRoles) {
    for (const perm of role.doctypePermissions) {
      const key: string = perm.doctypeKey
      const incoming: DocTypePermissionMap[string] = {
        canRead:      perm.canRead,
        canWrite:     perm.canWrite,
        canCreate:    perm.canCreate,
        canDelete:    perm.canDelete,
        canSubmit:    perm.canSubmit,
        canExport:    perm.canExport,
        canPrint:     perm.canPrint,
        canShare:     perm.canShare,
        canImport:    perm.canImport,
        canReport:    perm.canReport,
        applyScoping: perm.applyScoping,
      }
      doctypePermissions[key] = key in doctypePermissions
        ? mergeDocTypePermission(doctypePermissions[key], incoming)
        : incoming
    }

    for (const feat of role.featurePermissions) {
      const key: string = feat.featureKey
      const incoming: FeaturePermissionMap[string] = {
        visible: feat.visible,
        enabled: feat.enabled,
      }
      featurePermissions[key] = key in featurePermissions
        ? mergeFeaturePermission(featurePermissions[key], incoming)
        : incoming
    }
  }

  const isAdmin = activeRoleKeys.includes('ADMIN')
  if (isAdmin) {
    const [doctypes, features] = await Promise.all([
      db.docTypeRegistry.findMany({ select: { key: true } }),
      db.featurePermission.findMany({ distinct: ['featureKey'], select: { featureKey: true } }),
    ])
    for (const doctype of doctypes) {
      doctypePermissions[doctype.key] = {
        ...EMPTY_DOCTYPE_PERMISSION,
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: true,
        canSubmit: true,
        canExport: true,
        canPrint: true,
        canShare: true,
        canImport: true,
        canReport: true,
      }
    }
    for (const feature of features) {
      featurePermissions[feature.featureKey] = { visible: true, enabled: true }
    }
  }

  const effectiveOverrides = isAdmin ? [] : overrides

  // Grants are exact-match only, matching permission-resolver semantics.
  for (const override of effectiveOverrides.filter((item: { overrideType: string }) => item.overrideType === 'grant')) {
    if (override.featureKey && override.doctypeKey === null && override.action === null) {
      featurePermissions[override.featureKey] = { visible: true, enabled: true }
    }
    if (override.doctypeKey && override.action && override.featureKey === null) {
      const actionField = ACTION_FIELDS[override.action]
      if (!actionField || actionField === 'applyScoping') continue
      const permission = doctypePermissions[override.doctypeKey] ?? { ...EMPTY_DOCTYPE_PERMISSION }
      permission[actionField] = true
      doctypePermissions[override.doctypeKey] = permission
    }
  }

  // Denies are applied last and may use null targets/actions as wildcards.
  for (const override of effectiveOverrides.filter((item: { overrideType: string }) => item.overrideType === 'deny')) {
    if (override.doctypeKey === null && override.action === null) {
      const featureKeys = override.featureKey ? [override.featureKey] : Object.keys(featurePermissions)
      for (const key of featureKeys) featurePermissions[key] = { visible: false, enabled: false }
    }
    if (override.featureKey !== null) continue
    const doctypeKeys = override.doctypeKey ? [override.doctypeKey] : Object.keys(doctypePermissions)
    for (const key of doctypeKeys) {
      const permission = doctypePermissions[key] ?? { ...EMPTY_DOCTYPE_PERMISSION }
      const actionField = override.action ? ACTION_FIELDS[override.action] : undefined
      if (actionField && actionField !== 'applyScoping') {
        permission[actionField] = false
      } else if (!override.action) {
        for (const field of Object.values(ACTION_FIELDS)) permission[field] = false
      }
      doctypePermissions[key] = permission
    }
  }

  return apiSuccess({ isAdmin, activeRoleKeys, doctypePermissions, featurePermissions })
})
