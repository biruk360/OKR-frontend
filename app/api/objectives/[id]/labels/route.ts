import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiConflict,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { params }) => {
  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const body = await request.json()
  const { labelId } = body
  if (!labelId) return apiBadRequest('Label ID is required')

  const objective = await prisma.objective.findUnique({ where: { id: objectiveId } })
  if (!objective) return apiNotFound('Objective not found')

  const label = await prisma.label.findUnique({ where: { id: labelId } })
  if (!label) return apiNotFound('Label not found')

  try {
    const objectiveLabel = await prisma.objectiveLabel.create({
      data: { objectiveId, labelId },
      include: { label: true },
    })
    return apiSuccess(objectiveLabel, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return apiConflict('Label already assigned to this objective')
    }
    throw error
  }
})

export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { params }) => {
  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const { searchParams } = new URL(request.url)
  const labelId = searchParams.get('labelId')
  if (!labelId) return apiBadRequest('Label ID is required')

  await prisma.objectiveLabel.delete({
    where: { objectiveId_labelId: { objectiveId, labelId } },
  })

  return apiSuccess(null, { message: 'Label removed from objective' })
})
