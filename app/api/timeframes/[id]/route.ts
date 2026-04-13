import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, withRole } from '@/lib/api'

export const PATCH = withRole<RouteIdParams>('ADMIN', async (request: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid timeframe id')

  const body = await request.json()
  const { name, type, startDate, endDate, isActive } = body

  if (type) {
    const validTypes = ['MONTHLY', 'QUARTERLY', 'SIX_MONTH', 'YEARLY']
    if (!validTypes.includes(type)) {
      return apiBadRequest(
        'Invalid timeframe type. Must be MONTHLY, QUARTERLY, SIX_MONTH, or YEARLY'
      )
    }
  }

  if (isActive === true) {
    await prisma.timeframe.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })
  }

  const timeframe = await prisma.timeframe.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(type && { type }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(isActive !== undefined && { isActive }),
    },
  })
  return apiSuccess(timeframe)
})

export const DELETE = withRole<RouteIdParams>('ADMIN', async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid timeframe id')

  const objectivesCount = await prisma.objective.count({ where: { timeframeId: id } })
  if (objectivesCount > 0) {
    return apiBadRequest('Cannot delete timeframe with existing objectives')
  }

  await prisma.timeframe.delete({ where: { id } })
  return apiSuccess(null, { message: 'Timeframe deleted successfully' })
})
