import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { withRoleOrFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'

export const GET = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.permissions', async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      doctypePermissions: {
        include: { doctype: true },
      },
      featurePermissions: true,
      _count: { select: { userRoles: true } },
    },
  })

  if (!role) return apiNotFound('Role not found')
  return apiSuccess(role)
})

export const PUT = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.permissions', async (request: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const body = await request.json().catch(() => null)
  if (!body) return apiBadRequest('Invalid request body')

  const existing = await prisma.role.findUnique({ where: { id }, select: { id: true, isSystem: true, name: true, key: true } })
  if (!existing) return apiNotFound('Role not found')

  const { name, key, description, color, hierarchyLevel } = body

  if (key !== undefined && key !== existing.key && existing.isSystem) {
    return apiBadRequest('Cannot change the key of a system role')
  }

  const updateData: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return apiBadRequest('name must be a non-empty string')
    if (name.trim() !== existing.name) {
      const nameConflict = await prisma.role.findFirst({
        where: { name: name.trim(), NOT: { id } },
        select: { id: true },
      })
      if (nameConflict) return apiBadRequest('A role with this name already exists')
    }
    updateData.name = name.trim()
  }

  if (key !== undefined && !existing.isSystem) {
    if (typeof key !== 'string' || !key.trim()) return apiBadRequest('key must be a non-empty string')
    const normalizedKey = key.trim().toUpperCase().replace(/\s+/g, '_')
    if (normalizedKey !== existing.key) {
      const keyConflict = await prisma.role.findFirst({
        where: { key: normalizedKey, NOT: { id } },
        select: { id: true },
      })
      if (keyConflict) return apiBadRequest('A role with this key already exists')
    }
    updateData.key = normalizedKey
  }

  if (description !== undefined) updateData.description = description?.trim() ?? null
  if (color !== undefined) updateData.color = color?.trim() ?? null
  if (hierarchyLevel !== undefined) updateData.hierarchyLevel = hierarchyLevel ?? null

  const updated = await prisma.role.update({
    where: { id },
    data: updateData,
    include: {
      doctypePermissions: {
        include: { doctype: true },
      },
      featurePermissions: true,
      _count: { select: { userRoles: true } },
    },
  })

  return apiSuccess(updated, { message: 'Role updated successfully' })
})

export const DELETE = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.permissions', async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, isSystem: true, _count: { select: { userRoles: true } } },
  })

  if (!role) return apiNotFound('Role not found')

  if (role.isSystem) {
    return apiBadRequest('System roles cannot be deleted')
  }

  if (role._count.userRoles > 0) {
    return apiSuccess(
      { error: 'HAS_USERS', count: role._count.userRoles },
      { status: 409 }
    )
  }

  await prisma.role.delete({ where: { id } })
  return apiSuccess(null, { message: 'Role deleted successfully' })
})
