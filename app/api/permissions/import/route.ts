import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateAllFieldPermLevelCache } from '@/lib/field-filter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportedRole {
  id: string
  name: string
  key: string
  description?: string | null
  color?: string | null
  isSystem?: boolean
  hierarchyLevel?: number | null
  createdById?: string | null
  createdAt?: string
  updatedAt?: string
}

interface ImportedRoleDocTypePermission {
  id: string
  roleId: string
  doctypeKey: string
  permLevel: number
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
  updatedById?: string | null
  updatedAt?: string
}

interface ImportedFeaturePermission {
  id: string
  roleId: string
  featureKey: string
  visible: boolean
  enabled: boolean
  updatedById?: string | null
  updatedAt?: string
}

interface ImportedRecordScopeRule {
  id: string
  targetType: string
  targetId: string
  doctypeKey: string
  fieldName: string
  operator: string
  valueType: string
  staticValue?: string | null
  isActive?: boolean
  createdById?: string | null
  createdAt?: string
}

interface ImportedDocTypeRegistry {
  key: string
  displayName: string
  module: string
  isSubmittable?: boolean
  description?: string | null
  fields?: Array<{
    id: string
    doctypeKey: string
    fieldName: string
    displayLabel: string
    permLevel: number
    isSensitive: boolean
  }>
}

interface PermissionSnapshot {
  version: number
  exportedAt?: string
  exportedBy?: string
  roles: ImportedRole[]
  roleDocTypePermissions: ImportedRoleDocTypePermission[]
  featurePermissions: ImportedFeaturePermission[]
  recordScopeRules: ImportedRecordScopeRule[]
  docTypeRegistry: ImportedDocTypeRegistry[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const REQUIRED_KEYS: Array<keyof PermissionSnapshot> = [
  'roles',
  'roleDocTypePermissions',
  'featurePermissions',
  'recordScopeRules',
  'docTypeRegistry',
]

function validateSnapshot(data: unknown): data is PermissionSnapshot {
  if (typeof data !== 'object' || data === null) return false
  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray((data as Record<string, unknown>)[key])) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Dry-run diff helper
// Returns { added, modified, unchanged } counts for a table by comparing
// incoming IDs / unique combos against what currently exists in the DB.
// ---------------------------------------------------------------------------

async function diffCount(
  existingIds: Set<string>,
  incomingIds: string[]
): Promise<{ added: number; modified: number; unchanged: number }> {
  let added = 0
  let modified = 0
  let unchanged = 0

  for (const id of incomingIds) {
    if (existingIds.has(id)) {
      // We can't cheaply determine field-level diffs here; treat all matched
      // rows as "modified" in the worst case (conservative / informative).
      modified++
    } else {
      added++
    }
  }
  unchanged = existingIds.size - modified

  return { added, modified, unchanged: Math.max(unchanged, 0) }
}

// ---------------------------------------------------------------------------
// POST /api/permissions/import
// Admin-only: Import a permission snapshot produced by /api/permissions/export.
//
// Body: { data: <snapshot object>, dryRun?: boolean }
//
// dryRun=true  → validates shape, returns diff counts per table (no writes)
// dryRun=false → upserts all entities in a $transaction
// ---------------------------------------------------------------------------

export const POST = withRole(['ADMIN'], async (req: NextRequest, { session }) => {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return apiBadRequest('Request body must be a JSON object')
  }

  const { data, dryRun = false } = body as { data: unknown; dryRun?: boolean }

  if (!validateSnapshot(data)) {
    return apiBadRequest(
      `Invalid snapshot shape. Must include top-level arrays: ${REQUIRED_KEYS.join(', ')}`
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any

  // -------------------------------------------------------------------------
  // DRY RUN — compute diff counts without writing
  // -------------------------------------------------------------------------
  if (dryRun) {
    const [
      existingRoleIds,
      existingDoctypePermIds,
      existingFeaturePermIds,
      existingScopeRuleIds,
      existingDoctypeKeys,
    ] = await Promise.all([
      db.role.findMany({ select: { id: true } }).then((rows: Array<{ id: string }>) => new Set(rows.map((r: { id: string }) => r.id))),
      db.roleDocTypePermission.findMany({ select: { id: true } }).then((rows: Array<{ id: string }>) => new Set(rows.map((r: { id: string }) => r.id))),
      db.featurePermission.findMany({ select: { id: true } }).then((rows: Array<{ id: string }>) => new Set(rows.map((r: { id: string }) => r.id))),
      db.recordScopeRule.findMany({ select: { id: true } }).then((rows: Array<{ id: string }>) => new Set(rows.map((r: { id: string }) => r.id))),
      db.docTypeRegistry.findMany({ select: { key: true } }).then((rows: Array<{ key: string }>) => new Set(rows.map((r: { key: string }) => r.key))),
    ])

    const [rolesDiff, doctypePermDiff, featurePermDiff, scopeRuleDiff, doctypeRegistryDiff] =
      await Promise.all([
        diffCount(existingRoleIds, data.roles.map((r) => r.id)),
        diffCount(existingDoctypePermIds, data.roleDocTypePermissions.map((r) => r.id)),
        diffCount(existingFeaturePermIds, data.featurePermissions.map((r) => r.id)),
        diffCount(existingScopeRuleIds, data.recordScopeRules.map((r) => r.id)),
        diffCount(existingDoctypeKeys, data.docTypeRegistry.map((r) => r.key)),
      ])

    return apiSuccess({
      dryRun: true,
      diff: {
        roles: rolesDiff,
        roleDocTypePermissions: doctypePermDiff,
        featurePermissions: featurePermDiff,
        recordScopeRules: scopeRuleDiff,
        docTypeRegistry: doctypeRegistryDiff,
      },
    })
  }

  // -------------------------------------------------------------------------
  // LIVE IMPORT — upsert inside a $transaction
  // -------------------------------------------------------------------------

  // Filter out system roles from import: we never overwrite isSystem=true rows
  // that come from the snapshot. System role keys are preserved as-is; only
  // non-system role metadata is upserted.
  const SYSTEM_ROLE_KEYS = new Set(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'])

  const nonSystemRoles = data.roles.filter((r) => !SYSTEM_ROLE_KEYS.has(r.key))

  // Build upsert operations for each table.
  // We use the exported `id` as the stable key where available; for the
  // unique-compound tables we use the compound key.

  const roleOps = nonSystemRoles.map((r) =>
    db.role.upsert({
      where: { key: r.key },
      create: {
        id: r.id,
        name: r.name,
        key: r.key,
        description: r.description ?? null,
        color: r.color ?? null,
        isSystem: false,
        hierarchyLevel: r.hierarchyLevel ?? null,
        createdById: r.createdById ?? session.user.id,
      },
      update: {
        name: r.name,
        description: r.description ?? null,
        color: r.color ?? null,
        hierarchyLevel: r.hierarchyLevel ?? null,
      },
    })
  )

  const docTypeOps = data.docTypeRegistry.map((dt) =>
    db.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: {
        key: dt.key,
        displayName: dt.displayName,
        module: dt.module,
        isSubmittable: dt.isSubmittable ?? false,
        description: dt.description ?? null,
      },
      update: {
        displayName: dt.displayName,
        module: dt.module,
        isSubmittable: dt.isSubmittable ?? false,
        description: dt.description ?? null,
      },
    })
  )

  // DocType field upserts (nested within each registry entry)
  const fieldOps = data.docTypeRegistry.flatMap((dt) =>
    (dt.fields ?? []).map((f) =>
      db.docTypeFieldRegistry.upsert({
        where: { doctypeKey_fieldName: { doctypeKey: f.doctypeKey, fieldName: f.fieldName } },
        create: {
          id: f.id,
          doctypeKey: f.doctypeKey,
          fieldName: f.fieldName,
          displayLabel: f.displayLabel,
          permLevel: f.permLevel ?? 0,
          isSensitive: f.isSensitive ?? false,
        },
        update: {
          displayLabel: f.displayLabel,
          permLevel: f.permLevel ?? 0,
          isSensitive: f.isSensitive ?? false,
        },
      })
    )
  )

  const roleDocTypePermOps = data.roleDocTypePermissions.map((p) =>
    db.roleDocTypePermission.upsert({
      where: {
        roleId_doctypeKey_permLevel: {
          roleId: p.roleId,
          doctypeKey: p.doctypeKey,
          permLevel: p.permLevel,
        },
      },
      create: {
        id: p.id,
        roleId: p.roleId,
        doctypeKey: p.doctypeKey,
        permLevel: p.permLevel,
        canRead: p.canRead ?? false,
        canWrite: p.canWrite ?? false,
        canCreate: p.canCreate ?? false,
        canDelete: p.canDelete ?? false,
        canSubmit: p.canSubmit ?? false,
        canExport: p.canExport ?? false,
        canPrint: p.canPrint ?? false,
        canShare: p.canShare ?? false,
        canImport: p.canImport ?? false,
        canReport: p.canReport ?? false,
        applyScoping: p.applyScoping ?? false,
        updatedById: session.user.id,
      },
      update: {
        canRead: p.canRead ?? false,
        canWrite: p.canWrite ?? false,
        canCreate: p.canCreate ?? false,
        canDelete: p.canDelete ?? false,
        canSubmit: p.canSubmit ?? false,
        canExport: p.canExport ?? false,
        canPrint: p.canPrint ?? false,
        canShare: p.canShare ?? false,
        canImport: p.canImport ?? false,
        canReport: p.canReport ?? false,
        applyScoping: p.applyScoping ?? false,
        updatedById: session.user.id,
      },
    })
  )

  const featurePermOps = data.featurePermissions.map((f) =>
    db.featurePermission.upsert({
      where: {
        roleId_featureKey: { roleId: f.roleId, featureKey: f.featureKey },
      },
      create: {
        id: f.id,
        roleId: f.roleId,
        featureKey: f.featureKey,
        visible: f.visible ?? true,
        enabled: f.enabled ?? true,
        updatedById: session.user.id,
      },
      update: {
        visible: f.visible ?? true,
        enabled: f.enabled ?? true,
        updatedById: session.user.id,
      },
    })
  )

  const scopeRuleOps = data.recordScopeRules.map((r) =>
    db.recordScopeRule.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        doctypeKey: r.doctypeKey,
        fieldName: r.fieldName,
        operator: r.operator,
        valueType: r.valueType,
        staticValue: r.staticValue ?? null,
        isActive: r.isActive ?? true,
        createdById: r.createdById ?? session.user.id,
      },
      update: {
        targetType: r.targetType,
        targetId: r.targetId,
        doctypeKey: r.doctypeKey,
        fieldName: r.fieldName,
        operator: r.operator,
        valueType: r.valueType,
        staticValue: r.staticValue ?? null,
        isActive: r.isActive ?? true,
      },
    })
  )

  // Execute in a single transaction. Order matters:
  //  1. Roles (referenced by permissions)
  //  2. DocTypeRegistry (referenced by doctypePermissions, scopeRules, fields)
  //  3. DocTypeFieldRegistry (depends on DocTypeRegistry)
  //  4. RoleDocTypePermission / FeaturePermission / RecordScopeRule (depend on both)
  await db.$transaction([
    ...roleOps,
    ...docTypeOps,
    ...fieldOps,
    ...roleDocTypePermOps,
    ...featurePermOps,
    ...scopeRuleOps,
  ])

  // Bust the in-process permission cache so the new data is picked up immediately.
  permissionCache.invalidateAll()
  invalidateAllFieldPermLevelCache()

  return apiSuccess(
    {
      dryRun: false,
      imported: {
        roles: nonSystemRoles.length,
        docTypeRegistry: data.docTypeRegistry.length,
        roleDocTypePermissions: data.roleDocTypePermissions.length,
        featurePermissions: data.featurePermissions.length,
        recordScopeRules: data.recordScopeRules.length,
      },
    },
    { message: 'Permission snapshot imported successfully' }
  )
})
