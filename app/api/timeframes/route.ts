import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  withAuth,
  withRole,
  withRoleOrFeature,
} from '@/lib/api'
import { emit } from '@/lib/notifications'

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('activeOnly') === 'true'

  const timeframes = await prisma.timeframe.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { startDate: 'desc' },
  })
  return apiSuccess(timeframes)
})

export const POST = withRoleOrFeature(['ADMIN'], 'page.settings.timeframes', async (request: NextRequest) => {
  const body = await request.json()
  const { name, type, startDate, endDate } = body

  if (!name || !startDate || !endDate) {
    return apiBadRequest('Name, start date, and end date are required')
  }

  const validTypes = ['MONTHLY', 'QUARTERLY', 'SIX_MONTH', 'YEARLY']
  const timeframeType = type || 'QUARTERLY'
  if (!validTypes.includes(timeframeType)) {
    return apiBadRequest(
      'Invalid timeframe type. Must be MONTHLY, QUARTERLY, SIX_MONTH, or YEARLY'
    )
  }

  const existingTimeframe = await prisma.timeframe.findUnique({ where: { name } })
  if (existingTimeframe) {
    return apiConflict('Timeframe with this name already exists')
  }

  const timeframesCount = await prisma.timeframe.count()
  const isActive = timeframesCount === 0

  if (isActive) {
    await prisma.timeframe.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return apiBadRequest('Invalid date format')
  }
  if (start >= end) {
    return apiBadRequest('End date must be after start date')
  }

  const timeframe = await prisma.timeframe.create({
    data: { name, type: timeframeType, startDate: start, endDate: end, isActive },
  })

  await emit('TIMEFRAME_OPENED', {
    entityType: 'TIMEFRAME', entityId: timeframe.id,
    data: {
      timeframeName: timeframe.name,
      startDate: timeframe.startDate.toISOString().slice(0, 10),
      endDate: timeframe.endDate.toISOString().slice(0, 10),
    },
  })

  return apiSuccess(timeframe, { status: 201 })
})
