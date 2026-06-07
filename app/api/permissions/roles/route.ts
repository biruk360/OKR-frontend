import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRoleOrFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest } from '@/lib/api/apiResponse'

export const GET = withRoleOrFeature(['ADMIN'], 'page.settings.permissions', async () => {
  const roles = await prisma.role.findMany({
    include: {
      _count: { select: { userRoles: true } },
    },
    orderBy: [{ hierarchyLevel: 'asc' }, { createdAt: 'asc' }],
  })
  return apiSuccess(roles)
})

export const POST = withRoleOrFeature(['ADMIN'], 'page.settings.permissions', async (request: NextRequest, { session }) => {
  const body = await request.json().catch(() => null)
  if (!body) return apiBadRequest('Invalid request body')

  const { name, key, description, color, hierarchyLevel } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return apiBadRequest('name is required')
  }
  if (!key || typeof key !== 'string' || !key.trim()) {
    return apiBadRequest('key is required')
  }

  const normalizedKey = key.trim().toUpperCase().replace(/\s+/g, '_')

  const [nameConflict, keyConflict] = await Promise.all([
    prisma.role.findUnique({ where: { name: name.trim() }, select: { id: true } }),
    prisma.role.findUnique({ where: { key: normalizedKey }, select: { id: true } }),
  ])

  if (nameConflict) return apiBadRequest('A role with this name already exists')
  if (keyConflict) return apiBadRequest('A role with this key already exists')

  const role = await prisma.role.create({
    data: {
      name: name.trim(),
      key: normalizedKey,
      description: description?.trim() ?? null,
      color: color?.trim() ?? null,
      hierarchyLevel: hierarchyLevel ?? null,
      isSystem: false,
      createdById: session.user.id,
    },
    include: {
      _count: { select: { userRoles: true } },
    },
  })

  return apiSuccess(role, { status: 201, message: 'Role created successfully' })
})
