/**
 * apply-scope.ts
 *
 * Builds a Prisma WHERE clause addition based on RecordScopeRule rows.
 * Used by list API routes to restrict the result set to records the
 * calling user is allowed to see, as configured by admins via the
 * Permission → Record Scope Rules UI.
 *
 * Operators: `equals` / `is_owner` / `in` / `is_child_of` compare ONE column of the
 * doctype to a value derived from the user. `is_participant` (valueType `user_id`)
 * applies a code-defined OR of relationships for the doctype (see
 * PARTICIPANT_SCOPES; `todo` only) — used by the seeded EMPLOYEE to-do rule.
 * Combination: rules of one role/user are ANDed; roles/users are ORed.
 */

import { prisma } from './prisma'
import { getUserActiveRoleIds } from './permission-resolver'
import type { DocTypeAction } from './permission-resolver'
import { todoParticipantScopeWhere } from './todos/visibility'

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

/** The RecordScopeRule columns the engine reads. */
export type ScopeRule = {
  targetType: string
  targetId: string
  doctypeKey: string
  fieldName: string
  operator: string
  valueType: string
  staticValue: string | null
}

/** DB lookups a rule may need; injectable so the fragment builder is unit-testable. */
export type ScopeLoaders = {
  getDeptAndDescendants: (deptId: string) => Promise<string[]>
  getWatchedIds: (userId: string, entityType: string) => Promise<string[]>
}

/** Matches no row. Used when a rule is recognised but cannot be evaluated (fail closed). */
export const MATCH_NO_ROWS: Record<string, unknown> = { id: { in: [] } }

/**
 * `is_participant` — a named, code-defined relationship set per doctype. Unlike the
 * single-field operators it can OR several fields and relation filters (e.g. card
 * members, the card's sprint participants, watchers), which a row of
 * `fieldName operator value` cannot express. Only doctypes registered here accept
 * the operator; a rule for any other doctype matches NOTHING rather than being
 * skipped (skipping would silently widen the role's scope).
 */
const PARTICIPANT_SCOPES: Record<
  string,
  (ctx: ScopeContext, action: DocTypeAction | undefined, loaders: ScopeLoaders) => Promise<Record<string, unknown>>
> = {
  todo: (ctx, action, loaders) =>
    todoParticipantScopeWhere(ctx.userId, action, (userId) => loaders.getWatchedIds(userId, 'TODO')) as Promise<
      Record<string, unknown>
    >,
}

export const PARTICIPANT_SCOPE_DOCTYPES: readonly string[] = Object.keys(PARTICIPANT_SCOPES)

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

async function getWatchedIds(userId: string, entityType: string): Promise<string[]> {
  const rows: Array<{ entityId: string }> = await db.watcher.findMany({
    where: { userId, entityType },
    select: { entityId: true },
  })
  return rows.map((r) => r.entityId)
}

const dbLoaders: ScopeLoaders = { getDeptAndDescendants, getWatchedIds }

/**
 * One RecordScopeRule → a Prisma `where` fragment for `ctx`'s user, or `null` when
 * the rule does not restrict (unknown legacy operator/valueType combination, or a
 * department rule for a user with no department — the engine's historical
 * behaviour, kept unchanged). `action` is the permission being scoped (undefined =
 * a plain list read).
 */
export async function scopeRuleToFragment(
  rule: ScopeRule,
  ctx: ScopeContext,
  action?: DocTypeAction,
  loaders: ScopeLoaders = dbLoaders,
): Promise<Record<string, unknown> | null> {
  const { fieldName, operator, valueType } = rule

  if (operator === 'is_participant') {
    const build = PARTICIPANT_SCOPES[rule.doctypeKey]
    if (!build || valueType !== 'user_id') return MATCH_NO_ROWS
    return build(ctx, action, loaders)
  }

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
    const depts = await loaders.getDeptAndDescendants(ctx.primaryDeptId)
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
  const rules: ScopeRule[] = await db.recordScopeRule.findMany({
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

  // ── 5. Build a per-rule WHERE fragment (see scopeRuleToFragment) ───────
  const ruleToFragment = (rule: ScopeRule) => scopeRuleToFragment(rule, ctx, action)

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
