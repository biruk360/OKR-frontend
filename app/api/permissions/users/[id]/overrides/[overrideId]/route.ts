import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

type UserOverrideParams =
  | { id: string; overrideId: string }
  | Promise<{ id: string; overrideId: string }>

/**
 * DELETE /api/permissions/users/[id]/overrides/[overrideId]
 *
 * Deletes a specific UserPermissionOverride, verifying it belongs to
 * the given user before deletion.
 * Restricted to ADMIN. Self-modification is blocked.
 */
export const DELETE = withRole<UserOverrideParams>(['ADMIN'], async (_req, { session, params }) => {
  const { id, overrideId } = await resolveParams(params)

  if (!id) return apiBadRequest('Invalid user id')
  if (!overrideId) return apiBadRequest('Invalid override id')

  // Self-modification protection
  if (session.user.id === id) {
    return apiForbidden('Cannot modify own permissions')
  }

  // Verify the override exists and belongs to the specified user
  const existing = await prisma.userPermissionOverride.findFirst({
    where: { id: overrideId, userId: id },
    select: { id: true },
  })
  if (!existing) return apiNotFound('Permission override not found for this user')

  await prisma.userPermissionOverride.delete({ where: { id: overrideId } })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(null, { message: 'Permission override deleted successfully' })
})
