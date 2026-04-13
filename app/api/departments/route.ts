import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  withAuth,
  withRole,
} from '@/lib/api'

export const GET = withAuth(async () => {
  const departments = await prisma.department.findMany({
    include: {
      _count: {
        select: { memberships: true, objectives: true },
      },
    },
    orderBy: { name: 'asc' },
  })
  return apiSuccess(departments)
})

export const POST = withRole(['ADMIN', 'EXECUTIVE'], async (request: NextRequest) => {
  const body = await request.json()
  const { name, description, isActive } = body

  if (!name) {
    return apiBadRequest('Department name is required')
  }

  try {
    const department = await prisma.department.create({
      data: {
        name,
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    })
    return apiSuccess(department, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return apiConflict('Department with this name already exists')
    }
    throw error
  }
})
