import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

/**
 * GET /api/permissions/users/[id]
 *
 * Returns a user's full permission picture:
 *   - Basic user info (id, name, email, role)
 *   - Direct role assignments (UserRole) with full Role data
 *   - Role-profile assignments (UserRoleProfile) with profile memberships and roles
 *   - All UserPermissionOverrides
 *   - Effective permissions: union of all active roles' RoleDocTypePermission grouped by doctypeKey
 *
 * Restricted to ADMIN.
 */
export const GET = withRole<RouteIdParams>(['ADMIN'], async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      userRoles: {
        include: {
          role: true,
        },
      },
      userRoleProfiles: {
        include: {
          profile: {
            include: {
              memberships: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      },
      permissionOverrides: true,
    },
  })

  if (!user) return apiNotFound('User not found')

  // Collect all active role IDs from direct assignments and profile memberships
  const directRoleIds = user.userRoles.map((ur) => ur.roleId)
  const profileRoleIds = user.userRoleProfiles.flatMap((urp) =>
    urp.profile.memberships.map((m) => m.roleId)
  )
  const allRoleIds = [...new Set([...directRoleIds, ...profileRoleIds])]

  // Fetch all doctype permissions for the resolved role set
  const rawPerms = await prisma.roleDocTypePermission.findMany({
    where: { roleId: { in: allRoleIds } },
    include: { doctype: true },
  })

  // Union permissions per doctypeKey: any role granting a flag makes it true
  const effectivePermissions = Object.values(
    rawPerms.reduce<
      Record<
        string,
        {
          doctypeKey: string
          displayName: string | null
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
      >
    >((acc, perm) => {
      const key = perm.doctypeKey
      if (!acc[key]) {
        acc[key] = {
          doctypeKey: key,
          displayName: perm.doctype?.displayName ?? null,
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
      }
      acc[key].canRead = acc[key].canRead || perm.canRead
      acc[key].canWrite = acc[key].canWrite || perm.canWrite
      acc[key].canCreate = acc[key].canCreate || perm.canCreate
      acc[key].canDelete = acc[key].canDelete || perm.canDelete
      acc[key].canSubmit = acc[key].canSubmit || perm.canSubmit
      acc[key].canExport = acc[key].canExport || perm.canExport
      acc[key].canPrint = acc[key].canPrint || perm.canPrint
      acc[key].canShare = acc[key].canShare || perm.canShare
      acc[key].canImport = acc[key].canImport || perm.canImport
      acc[key].canReport = acc[key].canReport || perm.canReport
      // applyScoping: true only if ALL contributing roles scope this doctype
      acc[key].applyScoping = acc[key].applyScoping && perm.applyScoping
      return acc
    }, {})
  )

  return apiSuccess({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    userRoles: user.userRoles,
    userRoleProfiles: user.userRoleProfiles,
    permissionOverrides: user.permissionOverrides,
    effectivePermissions,
  })
})
