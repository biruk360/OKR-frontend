import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

/**
 * POST /api/permissions/users/[id]/roles
 *
 * Assigns a role to a user (upserts the UserRole record).
 * If the user already has the role the expiresAt is updated.
 *
 * Body: { roleId: string, expiresAt?: string (ISO-8601) }
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

  const { roleId, expiresAt } = body as { roleId?: string; expiresAt?: string }

  if (!roleId || typeof roleId !== 'string' || !roleId.trim()) {
    return apiBadRequest('roleId is required')
  }

  // Validate expiresAt is a future date if provided
  let expiresAtDate: Date | null = null
  if (expiresAt !== undefined && expiresAt !== null) {
    expiresAtDate = new Date(expiresAt)
    if (isNaN(expiresAtDate.getTime())) {
      return apiBadRequest('expiresAt must be a valid ISO-8601 date string')
    }
    if (expiresAtDate <= new Date()) {
      return apiBadRequest('expiresAt must be a future date')
    }
  }

  // Verify the target user exists
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return apiNotFound('User not found')

  // Verify the role exists
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } })
  if (!role) return apiNotFound('Role not found')

  const userRole = await prisma.userRole.upsert({
    where: { userId_roleId: { userId: id, roleId } },
    update: {
      expiresAt: expiresAtDate,
    },
    create: {
      userId: id,
      roleId,
      grantedById: session.user.id,
      expiresAt: expiresAtDate,
    },
    include: {
      role: true,
    },
  })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(userRole, { status: 201, message: 'Role assigned successfully' })
})
