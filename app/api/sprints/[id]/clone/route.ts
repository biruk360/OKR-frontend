import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { canCreateSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/sprints/[id]/clone — Create a new Sprint copying goal/dept/participants/columns.
 * Body: { name, startDate, endDate, includeIncompleteTodos? }
 *
 * BR-11: cloning a closed (COMPLETED/CANCELLED) sprint never copies tasks —
 * its tasks were already dispositioned at close.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiBadRequest('name is required')
  const startDate = body.startDate ? new Date(body.startDate) : null
  const endDate = body.endDate ? new Date(body.endDate) : null
  const includeIncompleteTodos = !!body.includeIncompleteTodos

  const source = await prisma.sprint.findUnique({
    where: { id },
    include: {
      participants: { select: { userId: true, role: true } },
      columns: { select: { name: true, statusKey: true, position: true, color: true } },
    },
  })
  if (!source) return apiNotFound('Source sprint not found')

  const sourceClosed = source.state === 'COMPLETED' || source.state === 'CANCELLED'
  if (sourceClosed && includeIncompleteTodos) {
    return apiBadRequest('Cannot copy tasks from a closed sprint — its tasks were already dispositioned')
  }

  const role = session.user.role as UserRole
  const allowedCreate = await canCreateSprint(role, session.user.id, source.departmentId)
  if (!allowedCreate) return apiForbidden('Insufficient permissions to clone sprint in this scope')

  const created = await prisma.sprint.create({
    data: {
      name,
      description: source.description,
      ownerId: session.user.id,
      startDate,
      endDate,
      status: 'ACTIVE',
      state: 'PLANNING',
      goal: source.goal,
      goalLabel: source.goalLabel,
      goalTarget: source.goalTarget,
      goalCurrent: 0,
      goalUnit: source.goalUnit,
      departmentId: source.departmentId,
      columns: {
        create: source.columns.map(c => ({
          name: c.name, statusKey: c.statusKey, position: c.position, color: c.color,
        })),
      },
      ...(source.participants.length > 0 && {
        participants: {
          createMany: {
            data: source.participants.map(p => ({ userId: p.userId, role: p.role })),
            skipDuplicates: true,
          },
        },
      }),
    },
    include: { participants: true },
  })

  if (includeIncompleteTodos && !sourceClosed) {
    const incomplete = await prisma.todo.findMany({
      where: { sprintId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    })
    for (const t of incomplete) {
      await prisma.todo.create({
        data: {
          title: t.title,
          description: t.description,
          status: 'PENDING',
          priority: t.priority,
          coverColor: t.coverColor,
          dueDate: t.dueDate,
          assigneeId: t.assigneeId,
          creatorId: session.user.id,
          keyResultId: t.keyResultId,
          objectiveId: t.objectiveId,
          progressValue: t.progressValue,
          sprintId: created.id,
          taskType: t.taskType,
        },
      })
    }
  }

  await recordActivity({
    entityType: 'SPRINT', sprintId: created.id, action: 'SPRINT_CREATED',
    actorId: session.user.id,
    metadata: { clonedFrom: id, name: created.name },
  })

  return apiSuccess(created, { status: 201 })
})
