import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps an action name (e.g. "create") to the matching boolean field on RoleDocTypePermission. */
const ACTION_FIELD_MAP: Record<string, string> = {
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

interface RoleGrantDetail {
  roleName: string
  roleKey: string
  action: string
  granted: boolean
}

interface ScopeRuleDetail {
  fieldName: string
  operator: string
  valueType: string
}

interface ExplainDetails {
  adminBypass: boolean
  explicitDeny: { reason: string; expiresAt: string | null } | null
  explicitGrant: { reason: string; expiresAt: string | null } | null
  roleGrants: RoleGrantDetail[]
  scopingApplied: boolean
  scopeRules: ScopeRuleDetail[]
}

interface ExplainResponse {
  allowed: boolean
  explanation: string
  details: ExplainDetails
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = (): Date => new Date()

/**
 * Returns true if the override is currently active (not expired).
 */
function isActiveOverride(override: { expiresAt: Date | null }): boolean {
  if (!override.expiresAt) return true
  return override.expiresAt > now()
}

/**
 * Looks up the boolean field value on a RoleDocTypePermission record for the
 * given action, e.g. action "create" → perm.canCreate.
 */
function getActionValue(perm: Record<string, unknown>, action: string): boolean {
  const fieldName = ACTION_FIELD_MAP[action.toLowerCase()]
  if (!fieldName) return false
  return Boolean(perm[fieldName])
}

/**
 * Returns a human-readable label for a valueType, used in scope-rule sentences.
 * e.g. "user_primary_dept" → "user's primary department"
 */
function humanizeValueType(valueType: string): string {
  switch (valueType) {
    case 'user_id':           return "user's own ID"
    case 'user_department':   return "user's department(s)"
    case 'user_primary_dept': return "user's primary department"
    case 'user_team':         return "user's team"
    case 'static':            return 'a static value'
    default:                  return valueType
  }
}

/**
 * Produces the plain-English explanation string from all resolved facts.
 */
function buildExplanation(
  userName: string,
  action: string,
  doctypeKey: string,
  allowed: boolean,
  details: ExplainDetails
): string {
  const subject = `User ${userName}`
  const verb = allowed ? 'CAN' : 'CANNOT'

  // 1. Admin bypass
  if (details.adminBypass) {
    return `Access GRANTED. Role 'Administrator' grants '${action}' on '${doctypeKey}' (admin bypass).`
  }

  // 2. Explicit deny
  if (details.explicitDeny) {
    const expiry = details.explicitDeny.expiresAt
      ? ` (expires ${details.explicitDeny.expiresAt})`
      : ''
    return `Access DENIED via explicit override${expiry}. Reason: ${details.explicitDeny.reason}`
  }

  // 3. Explicit grant
  if (details.explicitGrant) {
    const expiry = details.explicitGrant.expiresAt
      ? ` (expires ${details.explicitGrant.expiresAt})`
      : ''
    return `Access GRANTED via explicit override${expiry}. Reason: ${details.explicitGrant.reason}`
  }

  // 4. Role grants (allowed via a role)
  if (allowed) {
    const grantingRole = details.roleGrants.find((r) => r.granted)
    if (grantingRole) {
      let sentence = `Access GRANTED. Role '${grantingRole.roleName}' grants '${action}' on '${doctypeKey}'.`
      if (details.scopingApplied && details.scopeRules.length > 0) {
        const scopeParts = details.scopeRules
          .map((sr) => `${sr.fieldName} ${sr.operator} ${humanizeValueType(sr.valueType)}`)
          .join('; ')
        sentence += ` Record scoping ON: filtered to ${scopeParts}.`
      }
      return sentence
    }
  }

  // 5. Denied — no role grants
  const checkedRoles = details.roleGrants.map((r) => `'${r.roleName}'`).join(', ')
  if (checkedRoles) {
    return `Access DENIED. No active role grants '${action}' on '${doctypeKey}'. Checked roles: ${checkedRoles}. No user override exists.`
  }

  // 6. No roles at all
  return `Access DENIED. ${subject} has no active roles that grant '${action}' on '${doctypeKey}'. No user override exists.`
}

// ---------------------------------------------------------------------------
// GET /api/permissions/explain
//
// Query params:
//   userId      — target user's id
//   doctypeKey  — e.g. "objective", "letter"
//   action      — e.g. "create", "read", "delete"
//
// Returns a structured explanation of why the user can or cannot perform the
// action on the given doctype, tracing overrides, role grants, and scope rules.
// ---------------------------------------------------------------------------

export const GET = withRole(
  'ADMIN',
  async (req: NextRequest) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any

    const { searchParams } = new URL(req.url)
    const userId     = searchParams.get('userId')?.trim()
    const doctypeKey = searchParams.get('doctypeKey')?.trim()
    const action     = searchParams.get('action')?.trim()?.toLowerCase()

    // ------------------------------------------------------------------
    // Validate query params
    // ------------------------------------------------------------------
    if (!userId)     return apiBadRequest('Query param "userId" is required')
    if (!doctypeKey) return apiBadRequest('Query param "doctypeKey" is required')
    if (!action)     return apiBadRequest('Query param "action" is required')

    if (!ACTION_FIELD_MAP[action]) {
      return apiBadRequest(
        `Unknown action "${action}". Valid values: ${Object.keys(ACTION_FIELD_MAP).join(', ')}`
      )
    }

    // ------------------------------------------------------------------
    // 1. Load target user
    // ------------------------------------------------------------------
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    })
    if (!user) return apiNotFound('User not found')

    const userName: string = (user.name as string | null) ?? (user.email as string)

    // ------------------------------------------------------------------
    // 2. Admin-bypass short-circuit
    //    The built-in ADMIN system role means the user bypasses all
    //    doctype permission checks regardless of RoleDocTypePermission rows.
    // ------------------------------------------------------------------
    const adminBypass = (user.role as string) === 'ADMIN'

    // ------------------------------------------------------------------
    // 3. Load active UserPermissionOverrides for (userId, doctypeKey, action)
    // ------------------------------------------------------------------
    const overrides: Array<{
      id: string
      doctypeKey: string | null
      action: string | null
      overrideType: string
      reason: string
      grantedAt: Date
      expiresAt: Date | null
      grantedById: string
    }> = await db.userPermissionOverride.findMany({
      where: {
        userId,
        featureKey: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
        AND: [
          { OR: [{ doctypeKey }, { doctypeKey: null }] },
          { OR: [{ action }, { action: null }] },
        ],
      },
      orderBy: { grantedAt: 'desc' },
    })

    const activeOverrides = overrides.filter(isActiveOverride)

    const denyOverride  = activeOverrides.find((o) => o.overrideType === 'deny')  ?? null
    const grantOverride = activeOverrides.find((o) =>
      o.overrideType === 'grant' && o.doctypeKey === doctypeKey && o.action === action
    ) ?? null

    const explicitDeny: ExplainDetails['explicitDeny'] = denyOverride
      ? {
          reason:    denyOverride.reason,
          expiresAt: denyOverride.expiresAt ? denyOverride.expiresAt.toISOString() : null,
        }
      : null

    const explicitGrant: ExplainDetails['explicitGrant'] = grantOverride
      ? {
          reason:    grantOverride.reason,
          expiresAt: grantOverride.expiresAt ? grantOverride.expiresAt.toISOString() : null,
        }
      : null

    // ------------------------------------------------------------------
    // 4. Load active UserRoles with their role + doctype permissions
    // ------------------------------------------------------------------
    const activeUserRoles: Array<{
      role: {
        id: string
        name: string
        key: string
        doctypePermissions: Array<Record<string, unknown>>
      }
    }> = await db.userRole.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      },
      include: {
        role: {
          include: {
            doctypePermissions: {
              where: { doctypeKey },
            },
          },
        },
      },
    })

    const profileAssignments: Array<{
      profile: { memberships: Array<{ role: (typeof activeUserRoles)[number]['role'] }> }
    }> = await db.userRoleProfile.findMany({
      where: { userId },
      include: {
        profile: {
          include: {
            memberships: {
              include: {
                role: { include: { doctypePermissions: { where: { doctypeKey } } } },
              },
            },
          },
        },
      },
    })

    const effectiveRoleMap = new Map<string, (typeof activeUserRoles)[number]>()
    for (const assignment of activeUserRoles) effectiveRoleMap.set(assignment.role.id, assignment)
    for (const assignment of profileAssignments) {
      for (const membership of assignment.profile.memberships) {
        effectiveRoleMap.set(membership.role.id, { role: membership.role })
      }
    }
    const effectiveRoles = Array.from(effectiveRoleMap.values())
    const effectiveAdminBypass = adminBypass || effectiveRoles.some(({ role }) => role.key === 'ADMIN')

    // ------------------------------------------------------------------
    // 5. Build roleGrants array
    //    For each active role, find if any of its RoleDocTypePermission
    //    rows for this doctypeKey grants the requested action (OR across
    //    permLevels — any single row granting is sufficient).
    // ------------------------------------------------------------------
    const roleGrants: RoleGrantDetail[] = effectiveRoles.map(({ role }) => {
      const granted = role.doctypePermissions.some((perm) =>
        getActionValue(perm, action)
      )
      return {
        roleName: role.name as string,
        roleKey:  role.key  as string,
        action,
        granted,
      }
    })

    // ------------------------------------------------------------------
    // 6. Determine if scoping is active
    //    Scoping is applied when at least one granting RoleDocTypePermission
    //    row has applyScoping = true.
    // ------------------------------------------------------------------
    let scopingApplied = false
    const grantingRoleIds: string[] = []

    for (const { role } of effectiveRoles) {
      for (const perm of role.doctypePermissions) {
        if (getActionValue(perm, action) && Boolean(perm.applyScoping)) {
          scopingApplied = true
          if (!grantingRoleIds.includes(role.id)) {
            grantingRoleIds.push(role.id)
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 7. Load RecordScopeRules for the granting roles + doctypeKey
    // ------------------------------------------------------------------
    let scopeRules: ScopeRuleDetail[] = []

    if (scopingApplied && grantingRoleIds.length > 0) {
      const rawRules: Array<{
        fieldName: string
        operator: string
        valueType: string
        isActive: boolean
      }> = await db.recordScopeRule.findMany({
        where: {
          targetType: 'role',
          targetId:   { in: grantingRoleIds },
          doctypeKey,
          isActive:   true,
        },
        select: {
          fieldName: true,
          operator:  true,
          valueType: true,
          isActive:  true,
        },
      })

      // De-duplicate by fieldName+operator+valueType
      const seen = new Set<string>()
      for (const r of rawRules) {
        const key = `${r.fieldName}|${r.operator}|${r.valueType}`
        if (!seen.has(key)) {
          seen.add(key)
          scopeRules.push({
            fieldName: r.fieldName,
            operator:  r.operator,
            valueType: r.valueType,
          })
        }
      }
    }

    // ------------------------------------------------------------------
    // 8. Determine final allowed state
    // ------------------------------------------------------------------
    let allowed: boolean

    if (effectiveAdminBypass) {
      allowed = true
    } else if (denyOverride) {
      // Explicit deny always wins over role grants and explicit grants
      allowed = false
    } else if (grantOverride) {
      allowed = true
    } else {
      allowed = roleGrants.some((r) => r.granted)
    }

    // ------------------------------------------------------------------
    // 9. Build details + explanation
    // ------------------------------------------------------------------
    const details: ExplainDetails = {
      adminBypass: effectiveAdminBypass,
      explicitDeny,
      explicitGrant,
      roleGrants,
      scopingApplied,
      scopeRules,
    }

    const explanation = buildExplanation(userName, action, doctypeKey, allowed, details)

    const response: ExplainResponse = { allowed, explanation, details }

    return apiSuccess(response)
  }
)
