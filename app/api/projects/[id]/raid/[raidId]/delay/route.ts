import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { isOverdueClientDependency } from '@/lib/projects/raid'

const delaySchema = z.object({
  reasonDetail: z.string().trim().max(2000).optional(),
})

export const POST = withAuth<{ id: string; raidId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = delaySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid delay payload', parsed.error.flatten())

  const item = await prisma.raidItem.findFirst({
    where: { id: params.raidId, projectId: params.id },
  })
  if (!item) return apiNotFound('RAID item not found')
  if (!isOverdueClientDependency(item)) {
    return apiBadRequest('Only overdue client dependencies can generate a delay event')
  }

  const detail = parsed.data.reasonDetail || `RAID ${item.refCode}: ${item.title}`
  const existing = await prisma.delayEvent.findFirst({
    where: {
      projectId: params.id,
      eventType: 'BLOCKED',
      owner: 'CLIENT',
      reason: 'CLIENT_DEPENDENCY_NOT_PROVIDED',
      reasonDetail: detail,
      endedAt: null,
    },
    select: { id: true },
  })
  if (existing) return apiSuccess({ id: existing.id, alreadyExists: true })

  const now = new Date()
  const delay = await prisma.delayEvent.create({
    data: {
      projectId: params.id,
      eventType: 'BLOCKED',
      daysLost: Math.max(1, businessDaysBetween(item.neededByDate!, now)),
      owner: 'CLIENT',
      reason: 'CLIENT_DEPENDENCY_NOT_PROVIDED',
      reasonDetail: detail,
      startedAt: item.neededByDate!,
      endedAt: null,
      isAutoDetected: false,
      recordedById: session.user.id,
    },
    select: { id: true, daysLost: true },
  })

  await recordActivity({
    entityType: 'PROJECT_DELAY_EVENT',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { delayEventId: delay.id, raidItemId: item.id, refCode: item.refCode, source: 'raid_dependency' },
  })

  return apiSuccess(delay, { status: 201 })
})
