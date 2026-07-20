import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { validateCompleteScheduleOrder } from '@/lib/projects/schedule-order'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const schema = z.object({
  kind: z.enum(['phase', 'milestone', 'activity']),
  parentId: z.string().min(1),
  parentActivityId: z.string().nullable().optional(),
  orderedIds: z.array(z.string().min(1)).min(1).max(5000),
})

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid schedule order payload', parsed.error.flatten())
  const input = parsed.data
  if (input.kind === 'phase' && input.parentId !== params.id) return apiBadRequest('Phase order must target this project.')

  const currentIds = input.kind === 'phase'
    ? (await prisma.phase.findMany({ where: { projectId: params.id }, orderBy: { position: 'asc' }, select: { id: true } })).map((item) => item.id)
    : input.kind === 'milestone'
      ? (await prisma.milestone.findMany({ where: { phaseId: input.parentId, phase: { projectId: params.id } }, orderBy: { position: 'asc' }, select: { id: true } })).map((item) => item.id)
      : (await prisma.activity.findMany({
          where: {
            milestoneId: input.parentId,
            parentActivityId: input.parentActivityId ?? null,
            milestone: { phase: { projectId: params.id } },
          },
          orderBy: { position: 'asc' },
          select: { id: true },
        })).map((item) => item.id)

  const validationError = validateCompleteScheduleOrder(currentIds, input.orderedIds)
  if (validationError) return apiBadRequest(validationError)

  await prisma.$transaction(async (tx) => {
    await Promise.all(input.orderedIds.map((id, position) => {
      if (input.kind === 'phase') return tx.phase.update({ where: { id }, data: { position } })
      if (input.kind === 'milestone') return tx.milestone.update({ where: { id }, data: { position } })
      return tx.activity.update({ where: { id }, data: { position } })
    }))
    await recalcProjectRollup(tx, params.id)
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'SCHEDULE_REORDERED', itemKind: input.kind, parentId: input.parentId, parentActivityId: input.parentActivityId ?? null, orderedIds: input.orderedIds },
  })
  return apiSuccess({ reordered: true, kind: input.kind, orderedIds: input.orderedIds })
})
