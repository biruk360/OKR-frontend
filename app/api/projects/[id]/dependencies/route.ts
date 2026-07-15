import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { wouldCreateDependencyCycle } from '@/lib/projects/scheduling'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const dependencySchema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.number().int().min(-365).max(365).default(0),
})

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const dependencies = await prisma.activityDependency.findMany({
    where: { predecessor: { milestone: { phase: { projectId: params.id } } } },
    orderBy: { id: 'asc' },
  })
  return apiSuccess(dependencies)
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = dependencySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid dependency payload', parsed.error.flatten())
  const input = parsed.data
  if (input.predecessorId === input.successorId) return apiBadRequest('An activity cannot depend on itself')

  const activities = await prisma.activity.findMany({
    where: {
      id: { in: [input.predecessorId, input.successorId] },
      milestone: { phase: { projectId: params.id } },
    },
    select: { id: true },
  })
  if (activities.length !== 2) return apiBadRequest('Both activities must belong to this project')

  const existing = await prisma.activityDependency.findMany({
    where: { predecessor: { milestone: { phase: { projectId: params.id } } } },
    select: { predecessorId: true, successorId: true },
  })
  if (wouldCreateDependencyCycle(existing, input)) {
    return apiBadRequest('This would create a circular dependency.')
  }

  const dependency = await prisma.activityDependency.upsert({
    where: { predecessorId_successorId: { predecessorId: input.predecessorId, successorId: input.successorId } },
    create: input,
    update: { type: input.type, lagDays: input.lagDays },
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'DEPENDENCY_UPDATED', dependencyId: dependency.id, predecessorId: input.predecessorId, successorId: input.successorId, type: input.type },
  })

  return apiSuccess(dependency, { status: 201 })
})
