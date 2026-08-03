import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  withAuth,
} from '@/lib/api'
import { sprintClosedGuard } from '@/lib/sprints/guards'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { params }) => {
  const { id: sprintId } = await resolveParams(params)
  if (!sprintId) return apiBadRequest('Invalid sprint id')

  const closed = await sprintClosedGuard(sprintId)
  if (closed) return closed

  const body = await request.json()
  const name = (body.name || '').trim()
  if (!name) return apiBadRequest('Column name is required')

  const lastColumn = await prisma.sprintColumn.findFirst({
    where: { sprintId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (lastColumn?.position ?? -1) + 1

  try {
    const column = await prisma.sprintColumn.create({
      data: { sprintId, name, position, color: body.color || null },
    })
    return apiSuccess(column, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return apiConflict('A column with that name already exists in this sprint')
    }
    throw err
  }
})
