/**
 * Field-level permission filtering for API responses.
 *
 * Redacts fields from API response objects based on the requesting user's
 * effective permLevel for a given doctype. Fields whose registry permLevel
 * exceeds the user's effective permLevel are removed from the returned object.
 *
 * Resolution order for effective permLevel:
 *  1. Collect all active (non-expired) UserRole rows for the user.
 *  2. For each role, find the MAX permLevel across RoleDocTypePermission rows
 *     that match the doctypeKey.
 *  3. Check UserPermissionOverride for any field-level grants/denies; a
 *     field-level grant override bumps the effective level to 3 (full access)
 *     whereas a deny override floors it to 0.
 *  4. Return the resolved permLevel (0–3).
 *
 * Cache key: "fieldlevel:{userId}:{doctypeKey}" — stored in the module-local
 * numeric cache (not the boolean-only permissionCache) with a 30-second TTL.
 *
 * Usage in API route:
 *   import { filterFieldsByPermLevel } from '@/lib/field-filter'
 *   const filtered = await filterFieldsByPermLevel(objective, 'objective', session.user.id)
 *   return apiSuccess(filtered)
 */

import { prisma } from './prisma'
import { permissionCache } from './permission-cache'
import { getUserActiveRoleIds, getUserActiveRoleKeys } from './permission-resolver'

// All new Phase-1 models (UserRole, RoleDocTypePermission, DocTypeFieldRegistry,
// UserPermissionOverride) are accessed via this `db` alias typed as `any`.
// Remove the cast after running `prisma generate` and updating imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// ---------------------------------------------------------------------------
// Module-local numeric perm-level cache
// ---------------------------------------------------------------------------
// The shared permissionCache only stores booleans. We maintain a separate
// in-process Map to cache numeric permLevel results with the same TTL/LRU
// behaviour.

const PERM_LEVEL_TTL_MS = 30_000
const PERM_LEVEL_MAX_ENTRIES = 10_000

type NumericCacheEntry = {
  value: number
  expiresAt: number
}

const permLevelCache = new Map<string, NumericCacheEntry>()

// ---------------------------------------------------------------------------
// Module-local per-field permission cache
// ---------------------------------------------------------------------------
// Cache structure: "fieldrw:{roleId}:{doctypeKey}" → Map<fieldName, {canRead, canWrite}>
// Evicted together with the numeric permLevel cache on invalidation.

const FIELD_RW_TTL_MS = 30_000
const FIELD_RW_MAX_ENTRIES = 5_000

type FieldRwEntry = {
  fields: Map<string, { canRead: boolean; canWrite: boolean }>
  expiresAt: number
}

const fieldRwCache = new Map<string, FieldRwEntry>()

function numericCacheGet(key: string): number | undefined {
  const entry = permLevelCache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    permLevelCache.delete(key)
    return undefined
  }
  return entry.value
}

function numericCacheSet(key: string, value: number): void {
  if (permLevelCache.has(key)) {
    permLevelCache.delete(key)
  } else if (permLevelCache.size >= PERM_LEVEL_MAX_ENTRIES) {
    const firstKey = permLevelCache.keys().next().value
    if (firstKey !== undefined) permLevelCache.delete(firstKey)
  }
  permLevelCache.set(key, { value, expiresAt: Date.now() + PERM_LEVEL_TTL_MS })
}

/** Evict all cached permLevel entries for a user (call on role changes). */
export function invalidateFieldPermLevelCache(userId: string): void {
  const prefix = `fieldlevel:${userId}:`
  for (const key of Array.from(permLevelCache.keys())) {
    if (key.startsWith(prefix)) permLevelCache.delete(key)
  }
}

/**
 * Evict every entry in the numeric permLevel cache and the per-field R/W cache
 * (call when doctype field registry or per-field role permissions are updated globally).
 */
export function invalidateAllFieldPermLevelCache(): void {
  permLevelCache.clear()
  fieldRwCache.clear()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getUserFieldPermLevel
// ---------------------------------------------------------------------------

/**
 * Returns the effective field-visibility permLevel (0–3) for `userId` on
 * records of type `doctypeKey`.
 *
 * The result is memoised in the module-local numeric cache under the key
 * `"fieldlevel:{userId}:{doctypeKey}"` for 30 seconds.
 *
 * permLevel semantics (by convention):
 *  0 — no special field restrictions (public fields visible to all)
 *  1 — basic authenticated access
 *  2 — privileged / manager access
 *  3 — admin / full access
 */
export async function getUserFieldPermLevel(
  userId: string,
  doctypeKey: string,
): Promise<number> {
  const cacheKey = `fieldlevel:${userId}:${doctypeKey}`
  const cached = numericCacheGet(cacheKey)
  if (cached !== undefined) return cached

  const level = await _resolveFieldPermLevel(userId, doctypeKey)
  numericCacheSet(cacheKey, level)
  return level
}

async function _resolveFieldPermLevel(
  userId: string,
  doctypeKey: string,
): Promise<number> {
  // Step 1: Collect effective roles (direct + profile-derived).
  const [roleIds, roleKeys] = await Promise.all([
    getUserActiveRoleIds(userId),
    getUserActiveRoleKeys(userId),
  ])
  if (roleKeys.includes('ADMIN')) return 3

  let effectiveLevel = 0

  if (roleIds.length > 0) {
    // Step 2: Find the MAX permLevel from RoleDocTypePermission rows across all
    // active roles for this doctypeKey.
    const perms: Array<{ permLevel: number }> = await db.roleDocTypePermission.findMany({
      where: {
        roleId: { in: roleIds },
        doctypeKey,
      },
      select: { permLevel: true },
    })

    for (const perm of perms) {
      if (perm.permLevel > effectiveLevel) {
        effectiveLevel = perm.permLevel
      }
    }
  }

  // Step 3: UserPermissionOverride — field-level grants / denies.
  //  • A "grant" override for this doctypeKey with action "field_access" (or
  //    no action) elevates the level to 3 (full access).
  //  • A "deny" override for this doctypeKey floors the level to 0.
  // Only non-expired overrides are considered.
  const overrides: Array<{ overrideType: string }> = await db.userPermissionOverride.findMany({
    where: {
      userId,
      featureKey: null,
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        {
          OR: [
            { doctypeKey },
            { doctypeKey: null },
          ],
        },
        {
          OR: [
            { action: null },
            { action: 'field_access' },
          ],
        },
      ],
    },
    select: { overrideType: true },
  })

  if (overrides.some((override) => override.overrideType === 'deny')) return 0
  if (overrides.some((override) => override.overrideType === 'grant')) return 3

  return effectiveLevel
}

// ---------------------------------------------------------------------------
// Per-field R/W permission helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all RoleDocTypeFieldPermission rows for the given roleIds + doctypeKey,
 * merging across roles (most-permissive wins — canRead/canWrite is true if ANY
 * active role grants it).
 *
 * Results are cached per (sorted roleIds, doctypeKey) for FIELD_RW_TTL_MS.
 */
async function getFieldRwPermissions(
  roleIds: string[],
  doctypeKey: string,
): Promise<Map<string, { canRead: boolean; canWrite: boolean }>> {
  const cacheKey = `fieldrw:${[...roleIds].sort().join(',')}:${doctypeKey}`
  const cached = fieldRwCache.get(cacheKey)
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.fields
  }

  const rows: Array<{ fieldName: string; canRead: boolean; canWrite: boolean }> =
    roleIds.length > 0
      ? await db.roleDocTypeFieldPermission.findMany({
          where: { roleId: { in: roleIds }, doctypeKey },
          select: { fieldName: true, canRead: true, canWrite: true },
        })
      : []

  // Merge: most-permissive-wins across multiple roles.
  const merged = new Map<string, { canRead: boolean; canWrite: boolean }>()
  for (const row of rows) {
    const existing = merged.get(row.fieldName)
    if (existing) {
      merged.set(row.fieldName, {
        canRead: existing.canRead || row.canRead,
        canWrite: existing.canWrite || row.canWrite,
      })
    } else {
      merged.set(row.fieldName, { canRead: row.canRead, canWrite: row.canWrite })
    }
  }

  // Evict oldest entry if at capacity.
  if (!fieldRwCache.has(cacheKey) && fieldRwCache.size >= FIELD_RW_MAX_ENTRIES) {
    const firstKey = fieldRwCache.keys().next().value
    if (firstKey !== undefined) fieldRwCache.delete(firstKey)
  }
  fieldRwCache.set(cacheKey, { fields: merged, expiresAt: Date.now() + FIELD_RW_TTL_MS })

  return merged
}

/**
 * Returns the set of field names that should be redacted for the given user,
 * doctype, and operation based on per-field RoleDocTypeFieldPermission rows.
 *
 * For 'read' operations: redact if canRead === false.
 * For 'write' operations: redact if canWrite === false (field is read-only).
 *
 * Only fields that have an explicit override row are evaluated; fields without
 * a row are not redacted by this check (the permLevel check still applies).
 */
async function getPerFieldRedactSet(
  userId: string,
  doctypeKey: string,
  operation: 'read' | 'write',
): Promise<Set<string>> {
  // Collect active role IDs for the user.
  const roleIds = await getUserActiveRoleIds(userId)
  if (roleIds.length === 0) return new Set()
  const fieldRwMap = await getFieldRwPermissions(roleIds, doctypeKey)

  const toRedact = new Set<string>()
  for (const [fieldName, perms] of fieldRwMap) {
    const shouldRedact =
      operation === 'read' ? !perms.canRead : !perms.canWrite
    if (shouldRedact) {
      toRedact.add(fieldName)
    }
  }
  return toRedact
}

// ---------------------------------------------------------------------------
// filterFieldsByPermLevel
// ---------------------------------------------------------------------------

/**
 * Returns a shallow copy of `obj` with all fields redacted that the user may
 * not access.
 *
 * Two complementary checks are applied:
 *  1. **permLevel check** — fields whose DocTypeFieldRegistry.permLevel exceeds
 *     the user's effective permLevel are redacted.
 *  2. **per-field R/W check** — fields that have an explicit
 *     RoleDocTypeFieldPermission row with canRead=false (for 'read' ops) or
 *     canWrite=false (for 'write' ops) are additionally redacted.
 *
 * Fields that are NOT in the DocTypeFieldRegistry (or have permLevel === 0)
 * pass check 1 automatically; they are still subject to check 2.
 *
 * @param obj        The record to filter.
 * @param doctypeKey The doctype key (matches DocTypeRegistry.key).
 * @param userId     The requesting user's id.
 * @param operation  'read' (default) or 'write' — determines which R/W flag is checked.
 */
export async function filterFieldsByPermLevel<T extends Record<string, unknown>>(
  obj: T,
  doctypeKey: string,
  userId: string,
  operation: 'read' | 'write' = 'read',
): Promise<Partial<T>> {
  // Run both lookups in parallel.
  const [userPermLevel, perFieldRedact] = await Promise.all([
    getUserFieldPermLevel(userId, doctypeKey),
    getPerFieldRedactSet(userId, doctypeKey, operation),
  ])

  // Fetch all restricted fields (permLevel > 0) for this doctype.
  const restrictedFields: Array<{ fieldName: string; permLevel: number }> =
    await db.docTypeFieldRegistry.findMany({
      where: {
        doctypeKey,
        permLevel: { gt: 0 },
      },
      select: { fieldName: true, permLevel: true },
    })

  const result: Partial<T> = { ...obj }

  // Check 1: permLevel-based redaction.
  for (const field of restrictedFields) {
    if (field.permLevel > userPermLevel) {
      delete result[field.fieldName as keyof T]
    }
  }

  // Check 2: per-field R/W redaction (additive — may redact fields not in registry).
  for (const fieldName of perFieldRedact) {
    delete result[fieldName as keyof T]
  }

  return result
}

// ---------------------------------------------------------------------------
// filterArrayByPermLevel
// ---------------------------------------------------------------------------

/**
 * Applies field-level filtering to every item in `arr`.
 *
 * The user's effective permLevel, the restricted-field registry, and the
 * per-field R/W permission set are resolved once and reused across all items
 * for efficiency.
 *
 * @param arr        Array of records to filter.
 * @param doctypeKey The doctype key.
 * @param userId     The requesting user's id.
 * @param operation  'read' (default) or 'write' — determines which R/W flag is checked.
 */
export async function filterArrayByPermLevel<T extends Record<string, unknown>>(
  arr: T[],
  doctypeKey: string,
  userId: string,
  operation: 'read' | 'write' = 'read',
): Promise<Partial<T>[]> {
  if (arr.length === 0) return []

  // Resolve permLevel, field registry, and per-field redact set once, not per item.
  const [userPermLevel, perFieldRedact] = await Promise.all([
    getUserFieldPermLevel(userId, doctypeKey),
    getPerFieldRedactSet(userId, doctypeKey, operation),
  ])

  const restrictedFields: Array<{ fieldName: string; permLevel: number }> =
    await db.docTypeFieldRegistry.findMany({
      where: {
        doctypeKey,
        permLevel: { gt: 0 },
      },
      select: { fieldName: true, permLevel: true },
    })

  // Build the consolidated set of field names to strip.
  const fieldsToStrip = new Set<string>()

  // Check 1: permLevel-based.
  for (const f of restrictedFields) {
    if (f.permLevel > userPermLevel) {
      fieldsToStrip.add(f.fieldName)
    }
  }

  // Check 2: per-field R/W based.
  for (const fieldName of perFieldRedact) {
    fieldsToStrip.add(fieldName)
  }

  if (fieldsToStrip.size === 0) {
    // No fields need stripping — return shallow copies of all items.
    return arr.map((item) => ({ ...item }))
  }

  return arr.map((item) => {
    const copy: Partial<T> = { ...item }
    for (const fieldName of fieldsToStrip) {
      delete copy[fieldName as keyof T]
    }
    return copy
  })
}
