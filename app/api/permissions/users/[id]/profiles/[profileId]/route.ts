import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

type UserProfileParams =
  | { id: string; profileId: string }
  | Promise<{ id: string; profileId: string }>

/**
 * DELETE /api/permissions/users/[id]/profiles/[profileId]
 *
 * Removes a role-profile assignment from a user.
 * Restricted to ADMIN. Self-modification is blocked.
 */
export const DELETE = withRole<UserProfileParams>(['ADMIN'], async (_req, { session, params }) => {
  const { id, profileId } = await resolveParams(params)

  if (!id) return apiBadRequest('Invalid user id')
  if (!profileId) return apiBadRequest('Invalid profile id')

  // Self-modification protection
  if (session.user.id === id) {
    return apiForbidden('Cannot modify own permissions')
  }

  const existing = await prisma.userRoleProfile.findUnique({
    where: { userId_profileId: { userId: id, profileId } },
    select: { id: true },
  })
  if (!existing) return apiNotFound('Role profile assignment not found for this user')

  await prisma.userRoleProfile.delete({
    where: { userId_profileId: { userId: id, profileId } },
  })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(null, { message: 'Role profile removed successfully' })
})
