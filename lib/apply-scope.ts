/**
 * apply-scope.ts
 *
 * Builds a Prisma WHERE clause addition based on RecordScopeRule rows.
 * Used by list API routes to restrict the result set to records the
 * calling user is allowed to see, as configured by admins via the
 * Permission → Record Scope Rules UI.
 */

import { prisma } from './prisma'
import { getUserActiveRoleIds } from './permission-resolver'
import type { DocTypeAction } from './permission-resolver'

// Cast to any so we can access RBAC models that may not yet appear in the
// generated Prisma client types (added in Phase 1 schema migrations).
const db = prisma as any

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScopeContext = {
  userId: string
  /** The user's primary department (isPrimary=true membership), or null. */
  primaryDeptId: string | null
  /** All department IDs the user currently belongs to. */
  deptIds: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a user's scope context: primary department and all memberships.
 */
async function getScopeContext(userId: string): Promise<ScopeContext> {
  const memberships = await db.departmentMembership.findMany({
    where: { userId, endedAt: null },
    select: { departmentId: true, isPrimary: true },
  })

  const primaryRow = memberships.find((m: { isPrimary: boolean }) => m.isPrimary)
  const primaryDeptId: string | null = primaryRow?.departmentId ?? null
  const deptIds: string[] = memberships.map((m: { departmentId: string }) => m.departmentId)

  return { userId, primaryDeptId, deptIds }
}

/**
 * Returns the flat list of IDs for a department subtree rooted at `deptId`,
 * including `deptId` itself. Traversal is BFS-limited to depth 5 to prevent
 * runaway recursion on pathological data.
 */
async function getDeptAndDescendants(deptId: string): Promise<string[]> {
  const MAX_DEPTH = 5
  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = [{ id: deptId, depth: 0 }]

  while (queue.length > 0) {
    const item = queue.shift()!
    if (visited.has(item.id)) continue
    visited.add(item.id)

    if (item.depth < MAX_DEPTH) {
      const children: Array<{ id: string }> = await db.department.findMany({
        where: { parentId: item.id },
        select: { id: true },
      })
      for (const child of children) {
        if (!visited.has(child.id)) {
          queue.push({ id: child.id, depth: item.depth + 1 })
        }
      }
    }
  }

  return Array.from(visited)
}

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Builds a Prisma `where` fragment that enforces RecordScopeRule constraints
 * for the given user + doctype combination.
 *
 * Returns `null` when:
 *   - No active scope rules exist for this user/doctype, OR
 *   - Any of the user's roles has `applyScoping = false` for this doctype
 *     (meaning that role bypasses row-level filtering entirely).
 *
 * The caller merges the returned object into their existing `where` clause:
 *
 *   const scope = await buildScopeFilter(userId, 'objective')
 *   if (scope) Object.assign(where, scope)  // or wrap in AND
 */
export async function buildScopeFilter(
  userId: string,
  doctypeKey: string,
  action?: DocTypeAction,
): Promise<Record<string, unknown> | null> {
  // ── 1. Resolve the user's role IDs ───────────────────────────────────────
  const roleIds = await getUserActiveRoleIds(userId)

  // ── 2. Check if any role has applyScoping=false for this doctype ──────────
  //    Such a role grants an unrestricted view → return null (no filtering).
  let scopedRoleIds = roleIds
  if (roleIds.length > 0) {
    const actionFields: Record<DocTypeAction, string> = {
      read: 'canRead', write: 'canWrite', create: 'canCreate', delete: 'canDelete',
      submit: 'canSubmit', export: 'canExport', print: 'canPrint', share: 'canShare',
      import: 'canImport', report: 'canReport',
    }
    const grantingPerms: Array<{ roleId: string; applyScoping: boolean }> =
      await db.roleDocTypePermission.findMany({
        where: {
          roleId: { in: roleIds },
          doctypeKey,
          ...(action ? { [actionFields[action]]: true } : {}),
        },
        select: { roleId: true, applyScoping: true },
      })
    if (grantingPerms.some((perm) => !perm.applyScoping)) return null
    if (action) {
      scopedRoleIds = Array.from(new Set(grantingPerms.map((perm) => perm.roleId)))
    }
  }

  // ── 3. Fetch all active scope rules that apply to this user/doctype ───────
  const rules: Array<{
    targetType: string
    targetId: string
    roleId?: string
    fieldName: string
    operator: string
    valueType: string
    staticValue: string | null
  }> = await db.recordScopeRule.findMany({
    where: {
      doctypeKey,
      isActive: true,
      OR: [
        ...(scopedRoleIds.length > 0 ? [{ targetType: 'role', targetId: { in: scopedRoleIds } }] : []),
        { targetType: 'user', targetId: userId },
      ],
    },
  })

  if (rules.length === 0) return null

  // ── 4. Resolve scope context once (all rules share the same user) ─────────
  const ctx = await getScopeContext(userId)

  // ── 5. Build a per-rule WHERE fragment ────────────────────────────────────
  async function ruleToFragment(
    rule: (typeof rules)[number]
  ): Promise<Record<string, unknown> | null> {
    const { fieldName, operator, valueType } = rule

    if (operator === 'equals' || operator === 'is_owner') {
      if (valueType === 'user_id' || operator === 'is_owner') {
        return { [fieldName]: ctx.userId }
      }
      if (valueType === 'user_department') {
        if (ctx.deptIds.length === 0) return null
        return { [fieldName]: { in: ctx.deptIds } }
      }
      if (valueType === 'user_primary_dept') {
        if (!ctx.primaryDeptId) return null
        return { [fieldName]: ctx.primaryDeptId }
      }
    }

    if (operator === 'is_child_of' && valueType === 'user_primary_dept') {
      if (!ctx.primaryDeptId) return null
      const depts = await getDeptAndDescendants(ctx.primaryDeptId)
      if (depts.length === 0) return null
      return { [fieldName]: { in: depts } }
    }

    if (operator === 'in' && valueType === 'user_department') {
      if (ctx.deptIds.length === 0) return null
      return { [fieldName]: { in: ctx.deptIds } }
    }

    // Unknown operator/valueType combination — skip rather than crash.
    return null
  }

  // ── 6. Group rules by targetId (role or user) ────────────────────────────
  //    Rules within a group are AND-ed; groups (roles) are OR-ed.
  const groups = new Map<string, (typeof rules)[number][]>()
  for (const rule of rules) {
    const key = `${rule.targetType}:${rule.targetId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(rule)
  }

  const groupFragments: Record<string, unknown>[] = []

  for (const groupRules of Array.from(groups.values())) {
    const fragments: Record<string, unknown>[] = []
    for (const rule of groupRules) {
      const frag = await ruleToFragment(rule)
      if (frag !== null) fragments.push(frag)
    }

    if (fragments.length === 0) continue

    // AND within a single role/user group.
    const groupFilter =
      fragments.length === 1
        ? fragments[0]
        : { AND: fragments }

    groupFragments.push(groupFilter)
  }

  if (groupFragments.length === 0) return null

  // OR across groups.
  if (groupFragments.length === 1) return groupFragments[0]
  return { OR: groupFragments }
}
