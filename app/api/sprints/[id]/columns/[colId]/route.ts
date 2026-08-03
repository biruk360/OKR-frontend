import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  withAuth,
} from '@/lib/api'
import { sprintClosedGuard } from '@/lib/sprints/guards'

type ColParams = { id: string; colId: string } | Promise<{ id: string; colId: string }>

export const PATCH = withAuth<ColParams>(async (request: NextRequest, { params }) => {
  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return apiBadRequest('Invalid id')

  const closed = await sprintClosedGuard(sprintId)
  if (closed) return closed

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.color === 'string' || body.color === null) data.color = body.color
  if (typeof body.position === 'number') data.position = body.position

  try {
    const column = await prisma.sprintColumn.update({
      where: { id: colId },
      data,
    })
    return apiSuccess(column)
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return apiConflict('A column with that name already exists in this sprint')
    }
    throw err
  }
})

export const DELETE = withAuth<ColParams>(async (_request, { params }) => {
  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return apiBadRequest('Invalid id')

  const closed = await sprintClosedGuard(sprintId)
  if (closed) return closed

  // Block deleting the last column — every sprint needs at least one place to put cards.
  const remaining = await prisma.sprintColumn.count({ where: { sprintId } })
  if (remaining <= 1) {
    return apiBadRequest('A sprint must have at least one column')
  }

  await prisma.sprintColumn.delete({ where: { id: colId } })
  return apiSuccess(null)
})
