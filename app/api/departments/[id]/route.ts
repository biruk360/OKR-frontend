import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiConflict,
  withAuth,
  withRole,
} from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid department id')

  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
      _count: { select: { memberships: true, objectives: true } },
    },
  })

  if (!department) return apiNotFound('Department not found')
  return apiSuccess(department)
})

export const PATCH = withRole<RouteIdParams>(['ADMIN', 'EXECUTIVE'], async (request: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid department id')

  const body = await request.json()
  const { name, description, isActive } = body

  try {
    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return apiSuccess(department)
  } catch (error: any) {
    if (error?.code === 'P2025') return apiNotFound('Department not found')
    if (error?.code === 'P2002') return apiConflict('Department with this name already exists')
    throw error
  }
})

export const DELETE = withRole<RouteIdParams>(['ADMIN', 'EXECUTIVE'], async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid department id')

  const department = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { memberships: true, objectives: true } } },
  })

  if (!department) return apiNotFound('Department not found')

  if (department._count.memberships > 0 || department._count.objectives > 0) {
    // Soft delete — keep the record around for referential integrity.
    await prisma.department.update({ where: { id }, data: { isActive: false } })
  } else {
    await prisma.department.delete({ where: { id } })
  }

  return apiSuccess(null, { message: 'Department deleted successfully' })
})
