import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'

export const GET = withAuth(async () => {
  const labels = await prisma.todoLabelDef.findMany({ orderBy: { createdAt: 'asc' } })
  return apiSuccess(labels)
})

export const POST = withAuth(async (request: NextRequest) => {
  const { name, color } = await request.json()
  if (!name?.trim()) return apiBadRequest('Name required')
  const label = await prisma.todoLabelDef.create({
    data: { name: name.trim(), color: color || '#6366F1' },
  })
  return apiSuccess(label, { status: 201 })
})
