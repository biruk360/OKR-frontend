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
  const labels = await prisma.label.findMany({ orderBy: { name: 'asc' } })
  return apiSuccess(labels)
})

export const POST = withRole(['ADMIN', 'EXECUTIVE'], async (request: NextRequest) => {
  const body = await request.json()
  const { name, color, description } = body

  if (!name) {
    return apiBadRequest('Label name is required')
  }

  try {
    const label = await prisma.label.create({
      data: {
        name,
        color: color || '#3B82F6',
        description: description || null,
      },
    })
    return apiSuccess(label, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return apiConflict('Label with this name already exists')
    }
    throw error
  }
})
