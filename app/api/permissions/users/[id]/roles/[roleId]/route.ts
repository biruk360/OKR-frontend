import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

type UserRoleParams =
  | { id: string; roleId: string }
  | Promise<{ id: string; roleId: string }>

/**
 * DELETE /api/permissions/users/[id]/roles/[roleId]
 *
 * Removes a role assignment from a user.
 * Restricted to ADMIN. Self-modification is blocked.
 */
export const DELETE = withRole<UserRoleParams>(['ADMIN'], async (_req, { session, params }) => {
  const { id, roleId } = await resolveParams(params)

  if (!id) return apiBadRequest('Invalid user id')
  if (!roleId) return apiBadRequest('Invalid role id')

  // Self-modification protection
  if (session.user.id === id) {
    return apiForbidden('Cannot modify own permissions')
  }

  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: id, roleId } },
    select: { id: true },
  })
  if (!existing) return apiNotFound('Role assignment not found for this user')

  await prisma.userRole.delete({
    where: { userId_roleId: { userId: id, roleId } },
  })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(null, { message: 'Role removed successfully' })
})
