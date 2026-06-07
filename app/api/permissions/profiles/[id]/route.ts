import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { withRole, apiSuccess, apiNotFound, apiBadRequest, apiError } from '@/lib/api'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateAllFieldPermLevelCache } from '@/lib/field-filter'

const membershipRoleSelect = {
  id: true,
  role: {
    select: {
      id: true,
      name: true,
      key: true,
      color: true,
    },
  },
} as const

/**
 * GET /api/permissions/profiles/[id]
 * Returns a single RoleProfile with its memberships and the count of users
 * currently assigned this profile.
 * Restricted to ADMIN.
 */
export const GET = withRole<RouteIdParams>(['ADMIN'], async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid profile id')

  const profile = await prisma.roleProfile.findUnique({
    where: { id },
    include: {
      memberships: {
        select: membershipRoleSelect,
      },
      _count: {
        select: { userProfiles: true },
      },
    },
  })

  if (!profile) return apiNotFound('Role profile not found')

  return apiSuccess(profile)
})

/**
 * PUT /api/permissions/profiles/[id]
 * Updates name and/or description. If roleIds is provided, replaces all
 * existing memberships with the new set (inside a transaction).
 * Body: { name?: string, description?: string, roleIds?: string[] }
 * Restricted to ADMIN.
 */
export const PUT = withRole<RouteIdParams>(['ADMIN'], async (req: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid profile id')

  const existing = await prisma.roleProfile.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) return apiNotFound('Role profile not found')

  const body = await req.json()
  const { name, description, roleIds } = body as {
    name?: string
    description?: string
    roleIds?: string[]
  }

  if (name !== undefined && !name.trim()) {
    return apiBadRequest('name cannot be empty')
  }

  if (roleIds !== undefined) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return apiBadRequest('roleIds must be a non-empty array when provided')
    }

    // Validate all roleIds exist before starting the transaction.
    const foundRoles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    })

    if (foundRoles.length !== roleIds.length) {
      const foundIds = new Set(foundRoles.map((r) => r.id))
      const missing = roleIds.filter((rid) => !foundIds.has(rid))
      return apiBadRequest('One or more roleIds do not exist', { missing })
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Update scalar fields if provided.
    await tx.roleProfile.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
      },
    })

    // Replace memberships when roleIds was explicitly supplied.
    if (roleIds !== undefined) {
      await tx.roleProfileMembership.deleteMany({ where: { profileId: id } })
      await tx.roleProfileMembership.createMany({
        data: roleIds.map((roleId) => ({ profileId: id, roleId })),
      })
    }

    return tx.roleProfile.findUniqueOrThrow({
      where: { id },
      include: {
        memberships: {
          select: membershipRoleSelect,
        },
        _count: {
          select: { userProfiles: true },
        },
      },
    })
  })

  if (roleIds !== undefined) {
    permissionCache.invalidateAll()
    invalidateAllFieldPermLevelCache()
  }

  return apiSuccess(updated, { message: 'Role profile updated' })
})

/**
 * DELETE /api/permissions/profiles/[id]
 * Deletes the profile if it has no assigned users.
 * Returns 409 { error: 'HAS_USERS' } when users are still assigned.
 * Restricted to ADMIN.
 */
export const DELETE = withRole<RouteIdParams>(['ADMIN'], async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid profile id')

  const profile = await prisma.roleProfile.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { userProfiles: true } },
    },
  })

  if (!profile) return apiNotFound('Role profile not found')

  if (profile._count.userProfiles > 0) {
    return apiError('HAS_USERS', { status: 409, code: 'HAS_USERS' })
  }

  // Cascade: memberships are deleted by the DB relation (or explicit deleteMany
  // below to be safe regardless of cascade config in schema).
  await prisma.$transaction([
    prisma.roleProfileMembership.deleteMany({ where: { profileId: id } }),
    prisma.roleProfile.delete({ where: { id } }),
  ])

  return apiSuccess(null, { message: 'Role profile deleted' })
})
