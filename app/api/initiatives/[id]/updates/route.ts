import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'

function todayBucket(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** List daily updates for an initiative. */
export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const updates = await prisma.initiativeUpdate.findMany({
    where: { initiativeId: id },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { updateDate: 'desc' },
    take: 90,
  })
  return apiSuccess(updates)
})

/** Create or update today's daily update (upsert per initiative+date). */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return apiBadRequest('Update content is required')
  if (content.length > 5000) return apiBadRequest('Update too long')

  const initiative = await prisma.todo.findUnique({ where: { id }, select: { id: true } })
  if (!initiative) return apiNotFound('Initiative not found')

  const updateDate = body.updateDate || todayBucket()

  const update = await prisma.initiativeUpdate.upsert({
    where: { initiativeId_updateDate: { initiativeId: id, updateDate } },
    create: {
      initiativeId: id,
      authorId: session.user.id,
      updateDate,
      content,
      status: body.status || null,
      blockers: body.blockers?.trim() || null,
    },
    update: {
      content,
      status: body.status || undefined,
      blockers: body.blockers?.trim() || undefined,
    },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })

  return apiSuccess(update, { status: 201 })
})
