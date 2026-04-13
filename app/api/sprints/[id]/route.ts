import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/** Full sprint with columns + activities (board fetch). */
export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      columns: {
        orderBy: { position: 'asc' },
        include: {
          activities: {
            orderBy: { position: 'asc' },
            include: {
              owner: { select: { id: true, name: true, avatar: true } },
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  objective: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sprint) return apiNotFound('Not found')
  return apiSuccess(sprint)
})

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.description === 'string' || body.description === null) data.description = body.description
  if (typeof body.status === 'string') data.status = body.status
  if (body.startDate) data.startDate = new Date(body.startDate)
  if (body.endDate) data.endDate = new Date(body.endDate)

  const sprint = await prisma.sprint.update({ where: { id }, data })
  return apiSuccess(sprint)
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({ where: { id }, select: { ownerId: true } })
  if (!sprint) return apiNotFound('Not found')
  if (sprint.ownerId !== session.user.id && session.user.role !== 'ADMIN') {
    return apiForbidden('Only the owner can delete this sprint')
  }

  await prisma.sprint.delete({ where: { id } })
  return apiSuccess(null)
})
