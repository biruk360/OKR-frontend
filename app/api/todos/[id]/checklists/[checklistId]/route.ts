import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

type Params = { id: string; checklistId: string }

export const PATCH = withAuth<Params>(async (request: NextRequest, { params }) => {
  const { checklistId } = await resolveParams(params)
  if (!checklistId) return apiBadRequest('Invalid checklist id')
  const { title } = await request.json()
  const checklist = await prisma.todoChecklist.findUnique({ where: { id: checklistId } })
  if (!checklist) return apiNotFound('Checklist not found')
  const updated = await prisma.todoChecklist.update({
    where: { id: checklistId },
    data: { ...(title !== undefined && { title }) },
    include: { items: { orderBy: { position: 'asc' }, include: { assignee: { select: { id: true, name: true, avatar: true } } } } },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { params }) => {
  const { checklistId } = await resolveParams(params)
  if (!checklistId) return apiBadRequest('Invalid checklist id')
  await prisma.todoChecklist.delete({ where: { id: checklistId } })
  return apiSuccess(null)
})
