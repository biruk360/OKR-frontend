import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserIdRouteParams = { userId: string } | Promise<{ userId: string }>

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

/** OR-merge: true wins over false across all roles for each field. */
function mergeDocType(
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
    applyScoping: base.applyScoping && next.applyScoping,
  }
}

function mergeFeature(
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

// ---------------------------------------------------------------------------
// GET /api/permissions/preview/[userId]
// Admin-only: Compute and return the effective permissions for any user.
//
// Response:
//   {
//     user: { id, name, email, role },
//     effectivePermissions: {
//       doctypePermissions: { [key]: {...} },
//       featurePermissions: { [key]: { visible, enabled } },
//     },
//     activeRoles: string[],       // role keys
//     overrides: { grant: [...], deny: [...] },
//     visibleFeatures: string[],
//     hiddenFeatures: string[],
//   }
// ---------------------------------------------------------------------------

export const GET = withRole<UserIdRouteParams>(
  ['ADMIN'],
  async (_req: NextRequest, { params }) => {
    const { userId } = await resolveParams(params)
    if (!userId) return apiBadRequest('Invalid userId')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any

    // ------------------------------------------------------------------
    // 1. Load the user
    // ------------------------------------------------------------------
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    if (!user) return apiNotFound('User not found')

    // ------------------------------------------------------------------
    // 2. Load active UserRoles with nested role + doctype/feature perms
    // ------------------------------------------------------------------
    const activeUserRoles = await db.userRole.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      },
      include: {
        role: {
          include: {
            doctypePermissions: true,
            featurePermissions: true,
          },
        },
      },
    })

    // ------------------------------------------------------------------
    // 3. Load UserRoleProfiles → resolve their member roles
    // ------------------------------------------------------------------
    const userProfiles = await db.userRoleProfile.findMany({
      where: { userId },
      include: {
        profile: {
          include: {
            memberships: {
              include: {
                role: {
                  include: {
                    doctypePermissions: true,
                    featurePermissions: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    // Flatten all effective roles (from direct assignments + profile memberships)
    // Deduplicate by role id so that a role granted both directly and via a profile
    // is only counted once.
    const roleMap = new Map<string, { key: string; doctypePermissions: unknown[]; featurePermissions: unknown[] }>()

    for (const ur of activeUserRoles) {
      const r = ur.role
      if (!roleMap.has(r.id)) roleMap.set(r.id, r)
    }

    for (const up of userProfiles) {
      for (const membership of up.profile.memberships) {
        const r = membership.role
        if (!roleMap.has(r.id)) roleMap.set(r.id, r)
      }
    }

    // ------------------------------------------------------------------
    // 4. Load UserPermissionOverrides
    // ------------------------------------------------------------------
    const overrides = await db.userPermissionOverride.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      },
      orderBy: { grantedAt: 'asc' },
    })

    const grantOverrides = overrides.filter((o: { overrideType: string }) => o.overrideType === 'grant')
    const denyOverrides  = overrides.filter((o: { overrideType: string }) => o.overrideType === 'deny')

    // ------------------------------------------------------------------
    // 5. Build effective permission maps (same union logic as /me)
    // ------------------------------------------------------------------
    const doctypePermissions: DocTypePermissionMap = {}
    const featurePermissions: FeaturePermissionMap = {}

    for (const role of roleMap.values()) {
      for (const perm of role.doctypePermissions as Array<Record<string, unknown>>) {
        const key = perm.doctypeKey as string
        const incoming: DocTypePermissionMap[string] = {
          canRead:      perm.canRead      as boolean,
          canWrite:     perm.canWrite     as boolean,
          canCreate:    perm.canCreate    as boolean,
          canDelete:    perm.canDelete    as boolean,
          canSubmit:    perm.canSubmit    as boolean,
          canExport:    perm.canExport    as boolean,
          canPrint:     perm.canPrint     as boolean,
          canShare:     perm.canShare     as boolean,
          canImport:    perm.canImport    as boolean,
          canReport:    perm.canReport    as boolean,
          applyScoping: perm.applyScoping as boolean,
        }
        doctypePermissions[key] = key in doctypePermissions
          ? mergeDocType(doctypePermissions[key], incoming)
          : incoming
      }

      for (const feat of role.featurePermissions as Array<Record<string, unknown>>) {
        const key = feat.featureKey as string
        const incoming: FeaturePermissionMap[string] = {
          visible: feat.visible as boolean,
          enabled: feat.enabled as boolean,
        }
        featurePermissions[key] = key in featurePermissions
          ? mergeFeature(featurePermissions[key], incoming)
          : incoming
      }
    }

    // ------------------------------------------------------------------
    // 6. Derive visible/hidden feature lists
    // ------------------------------------------------------------------
    const visibleFeatures: string[] = []
    const hiddenFeatures: string[]  = []

    for (const [key, fp] of Object.entries(featurePermissions)) {
      if (fp.visible) {
        visibleFeatures.push(key)
      } else {
        hiddenFeatures.push(key)
      }
    }

    visibleFeatures.sort()
    hiddenFeatures.sort()

    // ------------------------------------------------------------------
    // 7. Return aggregated preview
    // ------------------------------------------------------------------
    return apiSuccess({
      user,
      activeRoles: Array.from(roleMap.values()).map((r) => r.key),
      effectivePermissions: {
        doctypePermissions,
        featurePermissions,
      },
      overrides: {
        grant: grantOverrides,
        deny:  denyOverrides,
      },
      visibleFeatures,
      hiddenFeatures,
    })
  }
)
