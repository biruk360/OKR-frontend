import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiConflict,
  withAuth,
} from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const body = await request.json()
  const { labelId } = body
  if (!labelId) return apiBadRequest('Label ID is required')

  const objective = await prisma.objective.findUnique({ where: { id: objectiveId } })
  if (!objective) return apiNotFound('Objective not found')

  const locked = await objectiveLockResponse(objectiveId)
  if (locked) return locked

  const label = await prisma.label.findUnique({ where: { id: labelId } })
  if (!label) return apiNotFound('Label not found')

  try {
    const objectiveLabel = await prisma.objectiveLabel.create({
      data: { objectiveId, labelId },
      include: { label: true },
    })
    await recordActivity({
      entityType: 'OBJECTIVE',
      objectiveId,
      action: 'UPDATED',
      actorId: session.user.id,
      metadata: { labelAdded: { id: label.id, name: label.name } },
    })
    return apiSuccess(objectiveLabel, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return apiConflict('Label already assigned to this objective')
    }
    throw error
  }
})

export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const { searchParams } = new URL(request.url)
  const labelId = searchParams.get('labelId')
  if (!labelId) return apiBadRequest('Label ID is required')

  const locked = await objectiveLockResponse(objectiveId)
  if (locked) return locked

  const label = await prisma.label.findUnique({ where: { id: labelId }, select: { id: true, name: true } })
  await prisma.objectiveLabel.delete({
    where: { objectiveId_labelId: { objectiveId, labelId } },
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { labelRemoved: label ? { id: label.id, name: label.name } : { id: labelId } },
  })

  return apiSuccess(null, { message: 'Label removed from objective' })
})
