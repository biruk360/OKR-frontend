import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

/**
 * POST /api/permissions/users/[id]/profiles
 *
 * Assigns a RoleProfile to a user (upserts the UserRoleProfile record).
 *
 * Body: { profileId: string }
 * Restricted to ADMIN.
 */
export const POST = withRole<RouteIdParams>(['ADMIN'], async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  // Self-modification protection
  if (session.user.id === id) {
    return apiForbidden('Cannot modify own permissions')
  }

  const body = await req.json().catch(() => null)
  if (!body) return apiBadRequest('Invalid request body')

  const { profileId } = body as { profileId?: string }

  if (!profileId || typeof profileId !== 'string' || !profileId.trim()) {
    return apiBadRequest('profileId is required')
  }

  // Verify the target user exists
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return apiNotFound('User not found')

  // Verify the profile exists
  const profile = await prisma.roleProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  })
  if (!profile) return apiNotFound('Role profile not found')

  const userRoleProfile = await prisma.userRoleProfile.upsert({
    where: { userId_profileId: { userId: id, profileId } },
    update: {},
    create: {
      userId: id,
      profileId,
      grantedById: session.user.id,
    },
    include: {
      profile: {
        include: {
          memberships: {
            include: { role: true },
          },
        },
      },
    },
  })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(userRoleProfile, { status: 201, message: 'Role profile assigned successfully' })
})
