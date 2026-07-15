import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recordSlipDelayEvent } from '@/lib/projects/delay-ledger'
import { recalcProjectRollup, computeSlipDays } from '@/lib/projects/rollup'
import { shiftSuccessors } from '@/lib/projects/scheduling'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const scheduleSchema = z.object({
  activityId: z.string().min(1),
  mode: z.enum(['move', 'resize-start', 'resize-end']),
  currentStart: z.string().nullable().optional(),
  currentEnd: z.string().nullable().optional(),
  slipReason: z.string().optional(),
  slipOwner: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  slipDetail: z.string().max(2000).optional(),
})

const MS_DAY = 24 * 60 * 60 * 1000

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = scheduleSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid schedule payload', parsed.error.flatten())
  const input = parsed.data

  const activities = await prisma.activity.findMany({
    where: { milestone: { phase: { projectId: params.id } } },
    select: { id: true, currentStart: true, currentEnd: true, baselineEnd: true, slipDays: true },
  })
  const existing = activities.find((a) => a.id === input.activityId)
  if (!existing) return apiNotFound('Activity not found')

  const nextStart = input.currentStart !== undefined ? (input.currentStart ? new Date(input.currentStart) : null) : existing.currentStart
  const nextEnd = input.currentEnd !== undefined ? (input.currentEnd ? new Date(input.currentEnd) : null) : existing.currentEnd
  if (nextStart && nextEnd && nextEnd < nextStart) return apiBadRequest('End date must be on or after start date')

  const dateChanged = +(nextStart ?? 0) !== +(existing.currentStart ?? 0) || +(nextEnd ?? 0) !== +(existing.currentEnd ?? 0)
  if (!dateChanged) return apiSuccess({ changed: [] })
  if (access.baselineCommittedAt && (!input.slipReason || !input.slipOwner)) {
    return apiForbidden('A slip reason and owner are required to change dates on a baselined project')
  }

  const dependencies = await prisma.activityDependency.findMany({
    where: { predecessor: { milestone: { phase: { projectId: params.id } } } },
    select: { predecessorId: true, successorId: true, type: true, lagDays: true },
  })

  const deltaDays = input.mode === 'move'
    ? computeDeltaDays(existing.currentStart ?? existing.currentEnd, nextStart ?? nextEnd)
    : 0
  const successorShifts = input.mode === 'move'
    ? shiftSuccessors(activities, dependencies.map((d) => ({
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        type: d.type as 'FS' | 'SS' | 'FF' | 'SF',
        lagDays: d.lagDays,
      })), input.activityId, deltaDays)
    : []

  const updates = [
    { activityId: input.activityId, currentStart: nextStart, currentEnd: nextEnd },
    ...successorShifts,
  ]
  const byId = new Map(activities.map((a) => [a.id, a]))

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const before = byId.get(update.activityId)
      if (!before) continue
      await tx.activity.update({
        where: { id: update.activityId },
        data: {
          currentStart: update.currentStart,
          currentEnd: update.currentEnd,
          ...(access.baselineCommittedAt ? { slipReason: input.slipReason, slipOwner: input.slipOwner } : {}),
        },
      })
      if (access.baselineCommittedAt) {
        await recordSlipDelayEvent(tx, {
          projectId: params.id,
          activityId: update.activityId,
          slipOwner: input.slipOwner!,
          slipReason: input.slipReason!,
          slipDetail: input.slipDetail,
          oldSlipDays: before.slipDays,
          newSlipDays: computeSlipDays(before.baselineEnd, update.currentEnd),
          baselineEnd: before.baselineEnd,
          newEnd: update.currentEnd,
          recordedById: session.user.id,
        })
      }
    }
    await recalcProjectRollup(tx, params.id)
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'SCHEDULE_SHIFTED', activityId: input.activityId, mode: input.mode, deltaDays, changed: updates.map((u) => u.activityId) },
  })

  return apiSuccess({ changed: updates })
})

function computeDeltaDays(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / MS_DAY)
}
