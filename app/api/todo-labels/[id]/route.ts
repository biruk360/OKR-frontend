import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE')
    return apiForbidden('Only admins can edit labels')
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  const { name, color } = await request.json()
  const label = await prisma.todoLabelDef.findUnique({ where: { id } })
  if (!label) return apiNotFound('Label not found')
  const updated = await prisma.todoLabelDef.update({
    where: { id },
    data: { ...(name && { name }), ...(color && { color }) },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  if (session.user.role !== 'ADMIN') return apiForbidden('Only admins can delete labels')
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  await prisma.todoLabelDef.delete({ where: { id } })
  return apiSuccess(null)
})
