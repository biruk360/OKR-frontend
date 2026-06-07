/**
 * DB-backed permission resolver for the new role/permission system.
 *
 * Covers:
 *  - resolveDocTypePermission  — per-doctype CRUD/submit/export etc.
 *  - resolveFeaturePermission  — UI feature visibility
 *  - getUserActiveRoleKeys     — convenience helper for role key enumeration
 *
 * Resolution order (doctype):
 *  1. ADMIN shortcut — any effective role with role.key="ADMIN" → true.
 *  2. UserPermissionOverride deny — (userId, doctypeKey|null, action|null) non-expired → false.
 *  3. UserPermissionOverride grant — (userId, doctypeKey, action) non-expired → true.
 *  4. RoleDocTypePermission across all effective roles — any match → true.
 *
 * Cache keys:
 *  perm:{userId}:{doctypeKey}:{action}   — doctype resolution
 *  perm:{userId}:feat:{featureKey}       — feature resolution
 */

import { prisma } from './prisma'
import { permissionCache } from './permission-cache'

// The Phase-1 Prisma models (Role, UserRole, UserPermissionOverride, etc.) are
// present in prisma/schema.prisma but the Prisma client must be regenerated
// before TypeScript can see them. We access all new models through this `db`
// alias typed as `any`. Remove the cast after running `prisma generate`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DocTypeAction =
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'submit'
  | 'export'
  | 'print'
  | 'share'
  | 'import'
  | 'report'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map from DocTypeAction to the corresponding boolean column name. */
const ACTION_FIELD: Record<DocTypeAction, string> = {
  read:   'canRead',
  write:  'canWrite',
  create: 'canCreate',
  delete: 'canDelete',
  submit: 'canSubmit',
  export: 'canExport',
  print:  'canPrint',
  share:  'canShare',
  import: 'canImport',
  report: 'canReport',
}

/** Returns a fresh Date for expiry comparisons (avoids capturing a stale timestamp). */
const now = (): Date => new Date()

/**
 * Fetch all effective roles assigned either directly or through a role profile.
 * Direct roles are active when expiresAt IS NULL OR expiresAt > now().
 */
async function fetchActiveUserRoles(userId: string): Promise<Array<{ roleId: string; role: { key: string } }>> {
  const [directRoles, profileAssignments] = await Promise.all([
    db.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now() } },
        ],
      },
      include: { role: true },
    }),
    db.userRoleProfile.findMany({
      where: { userId },
      include: {
        profile: {
          include: {
            memberships: { include: { role: true } },
          },
        },
      },
    }),
  ])

  const roles = new Map<string, { roleId: string; role: { key: string } }>()
  for (const assignment of directRoles) {
    roles.set(assignment.roleId, { roleId: assignment.roleId, role: assignment.role })
  }
  for (const assignment of profileAssignments) {
    for (const membership of assignment.profile.memberships) {
      roles.set(membership.roleId, { roleId: membership.roleId, role: membership.role })
    }
  }
  return Array.from(roles.values())
}

/** Returns the IDs for all roles currently effective for a user. */
export async function getUserActiveRoleIds(userId: string): Promise<string[]> {
  const activeRoles = await fetchActiveUserRoles(userId)
  return activeRoles.map((role) => role.roleId)
}

// ---------------------------------------------------------------------------
// resolveDocTypePermission
// ---------------------------------------------------------------------------

/**
 * Resolves whether `userId` may perform `action` on records of `doctypeKey`.
 *
 * Results are memoised in the in-process PermissionCache (TTL 30 s) under the
 * key `perm:{userId}:{doctypeKey}:{action}`.
 */
export async function resolveDocTypePermission(
  userId: string,
  doctypeKey: string,
  action: DocTypeAction,
): Promise<boolean> {
  const cacheKey = `perm:${userId}:${doctypeKey}:${action}`
  const cached = permissionCache.get(cacheKey)
  if (cached !== undefined) return cached

  const result = await _resolveDocTypePermission(userId, doctypeKey, action)
  permissionCache.set(cacheKey, result)
  return result
}

async function _resolveDocTypePermission(
  userId: string,
  doctypeKey: string,
  action: DocTypeAction,
): Promise<boolean> {
  // Step 1: ADMIN shortcut.
  // If the user has any active UserRole whose linked Role has key="ADMIN", all
  // permissions are granted without further checks.
  const activeRoles = await fetchActiveUserRoles(userId)
  if (activeRoles.some((role) => role.role.key === 'ADMIN')) return true

  // Step 2: UserPermissionOverride — deny.
  // A deny override fires when:
  //   - doctypeKey matches the override OR override has no doctypeKey (wildcard)
  //   - action    matches the override OR override has no action    (wildcard)
  //   - override is non-expired
  const denyOverride = await db.userPermissionOverride.findFirst({
    where: {
      userId,
      overrideType: 'deny',
      featureKey: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now() } },
      ],
      AND: [
        {
          OR: [
            { doctypeKey },
            { doctypeKey: null },
          ],
        },
        {
          OR: [
            { action },
            { action: null },
          ],
        },
      ],
    },
    select: { id: true },
  })
  if (denyOverride) return false

  // Step 3: UserPermissionOverride — explicit grant for this exact (doctypeKey, action).
  const grantOverride = await db.userPermissionOverride.findFirst({
    where: {
      userId,
      doctypeKey,
      action,
      overrideType: 'grant',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now() } },
      ],
    },
    select: { id: true },
  })
  if (grantOverride) return true

  // Step 4: Role-based doctype permissions.
  // Collect all active UserRole IDs, then check whether any of the associated
  // RoleDocTypePermission rows grant the requested action.
  if (activeRoles.length === 0) return false

  const roleIds = activeRoles.map((ur) => ur.roleId)
  const actionField = ACTION_FIELD[action]

  // Use a dynamic property key for the action column. The `db` alias is already
  // typed `any`, so no additional cast is needed here.
  const matchingPerm = await db.roleDocTypePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      doctypeKey,
      [actionField]: true,
    },
    select: { id: true },
  })

  return matchingPerm !== null
}

// ---------------------------------------------------------------------------
// resolveFeaturePermission
// ---------------------------------------------------------------------------

/**
 * Resolves whether `userId` has visibility of `featureKey`.
 *
 * A feature is available when ANY effective role has a FeaturePermission row
 * for that featureKey with both `visible = true` and `enabled = true`, unless
 * a user-level override grants or denies it.
 *
 * Results are memoised in the in-process PermissionCache (TTL 30 s) under the
 * key `perm:{userId}:feat:{featureKey}`.
 */
export async function resolveFeaturePermission(
  userId: string,
  featureKey: string,
): Promise<boolean> {
  const cacheKey = `perm:${userId}:feat:${featureKey}`
  const cached = permissionCache.get(cacheKey)
  if (cached !== undefined) return cached

  const result = await _resolveFeaturePermission(userId, featureKey)
  permissionCache.set(cacheKey, result)
  return result
}

async function _resolveFeaturePermission(
  userId: string,
  featureKey: string,
): Promise<boolean> {
  const activeRoles = await fetchActiveUserRoles(userId)
  if (activeRoles.some((role) => role.role.key === 'ADMIN')) return true

  const denyOverride = await db.userPermissionOverride.findFirst({
    where: {
      userId,
      overrideType: 'deny',
      doctypeKey: null,
      action: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      AND: [{ OR: [{ featureKey }, { featureKey: null }] }],
    },
    select: { id: true },
  })
  if (denyOverride) return false

  const grantOverride = await db.userPermissionOverride.findFirst({
    where: {
      userId,
      overrideType: 'grant',
      doctypeKey: null,
      featureKey,
      action: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
    },
    select: { id: true },
  })
  if (grantOverride) return true

  if (activeRoles.length === 0) return false

  const roleIds = activeRoles.map((ur) => ur.roleId)

  const matchingPerm = await db.featurePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      featureKey,
      visible: true,
      enabled: true,
    },
    select: { id: true },
  })

  return matchingPerm !== null
}

// ---------------------------------------------------------------------------
// getUserActiveRoleKeys
// ---------------------------------------------------------------------------

/**
 * Returns the `key` strings (e.g. "ADMIN", "EMPLOYEE") for all active
 * (non-expired) UserRole rows belonging to `userId`.
 *
 * Useful for quick role presence checks at API boundaries without running the
 * full doctype resolver. No cache is applied here because the return type
 * (string[]) does not fit the boolean-only PermissionCache; callers that need
 * per-request memoisation should wrap this themselves.
 */
export async function getUserActiveRoleKeys(userId: string): Promise<string[]> {
  const activeRoles = await fetchActiveUserRoles(userId)
  return activeRoles.map((ur) => ur.role.key)
}
