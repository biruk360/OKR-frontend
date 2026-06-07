import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole, apiSuccess, apiBadRequest } from '@/lib/api'

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
 * GET /api/permissions/profiles
 * Returns all RoleProfiles with their role memberships.
 * Restricted to ADMIN.
 */
export const GET = withRole(['ADMIN'], async () => {
  const profiles = await prisma.roleProfile.findMany({
    orderBy: { name: 'asc' },
    include: {
      memberships: {
        select: membershipRoleSelect,
      },
    },
  })

  return apiSuccess(profiles)
})

/**
 * POST /api/permissions/profiles
 * Creates a new RoleProfile and associates the supplied roleIds.
 * Body: { name: string, description?: string, roleIds: string[] }
 * Restricted to ADMIN.
 */
export const POST = withRole(['ADMIN'], async (req: NextRequest, { session }) => {
  const body = await req.json()
  const { name, description, roleIds } = body as {
    name?: string
    description?: string
    roleIds?: string[]
  }

  if (!name?.trim()) {
    return apiBadRequest('name is required')
  }

  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return apiBadRequest('roleIds must be a non-empty array')
  }

  // Verify all supplied roleIds exist to give a clear error rather than a
  // generic FK constraint violation from Prisma.
  const foundRoles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true },
  })

  if (foundRoles.length !== roleIds.length) {
    const foundIds = new Set(foundRoles.map((r) => r.id))
    const missing = roleIds.filter((id) => !foundIds.has(id))
    return apiBadRequest('One or more roleIds do not exist', { missing })
  }

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.roleProfile.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
        createdById: session.user.id,
      },
    })

    await tx.roleProfileMembership.createMany({
      data: roleIds.map((roleId) => ({
        profileId: created.id,
        roleId,
      })),
    })

    return tx.roleProfile.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        memberships: {
          select: membershipRoleSelect,
        },
      },
    })
  })

  return apiSuccess(profile, { status: 201, message: 'Role profile created' })
})
