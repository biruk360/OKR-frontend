import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { apiSuccess, apiForbidden, apiBadRequest, apiValidationError, withAuth } from '@/lib/api'

/** POST /api/projects/[id]/activities — create an activity under a milestone (B1). */

const createSchema = z.object({
  milestoneId: z.string().min(1),
  parentActivityId: z.string().nullable().optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().max(20000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  ownerParty: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  currentStart: z.string().nullable().optional(),
  currentEnd: z.string().nullable().optional(),
  weight: z.number().min(0).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable().optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  estimatedHours: z.number().min(0).nullable().optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  isMilestone: z.boolean().optional(),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid activity payload', parsed.error.flatten())
  const input = parsed.data

  // Milestone must belong to this project.
  const milestone = await prisma.milestone.findFirst({
    where: { id: input.milestoneId, phase: { projectId: params.id } },
    select: { id: true },
  })
  if (!milestone) return apiBadRequest('Milestone does not belong to this project')

  const start = input.currentStart ? new Date(input.currentStart) : null
  const end = input.currentEnd ? new Date(input.currentEnd) : null
  if (start && end && end < start) return apiBadRequest('End date must be on or after start date')

  const maxPos = await prisma.activity.aggregate({
    where: { milestoneId: input.milestoneId, parentActivityId: input.parentActivityId ?? null },
    _max: { position: true },
  })

  const activityId = await prisma.$transaction(async (tx) => {
    const created = await tx.activity.create({
      data: {
        milestoneId: input.milestoneId,
        parentActivityId: input.parentActivityId ?? null,
        position: (maxPos._max.position ?? -1) + 1,
        title: input.title,
        description: input.description ?? null,
        assigneeId: input.assigneeId ?? null,
        ownerParty: input.ownerParty ?? '360GROUND',
        currentStart: start,
        currentEnd: end,
        weight: input.weight ?? 1,
        priority: input.priority ?? null,
        risk: input.risk ?? null,
        estimatedHours: input.estimatedHours ?? null,
        estimatedCost: input.estimatedCost ?? null,
        isMilestone: input.isMilestone ?? false,
        status: 'NOT_STARTED',
      },
      select: { id: true },
    })
    await recalcProjectRollup(tx, params.id)
    return created.id
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { activityId, title: input.title, milestoneId: input.milestoneId },
  })

  return apiSuccess({ id: activityId }, { status: 201 })
})
