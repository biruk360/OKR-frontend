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
import { canEditSprint, canDeleteSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { broadcastSprintEvent } from '@/lib/pusher'

/** Full sprint with columns + activities (board fetch). */
export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      participants: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      columns: {
        orderBy: { position: 'asc' },
        include: {
          activities: {
            orderBy: { position: 'asc' },
            include: {
              owner: { select: { id: true, name: true, avatar: true } },
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  objective: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sprint) return apiNotFound('Not found')
  return apiSuccess(sprint)
})

const VALID_STATES = new Set(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const existing = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  })
  if (!existing) return apiNotFound('Sprint not found')

  const role = session.user.role as UserRole
  const allowed = await canEditSprint(role, session.user.id, {
    ownerId: existing.ownerId,
    departmentId: existing.departmentId,
    participants: existing.participants,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to edit this sprint')

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.description === 'string' || body.description === null) data.description = body.description
  if (typeof body.status === 'string') data.status = body.status
  if (body.startDate) data.startDate = new Date(body.startDate)
  if (body.endDate) data.endDate = new Date(body.endDate)

  // Sprint v2 fields
  if ('goal' in body) data.goal = body.goal ?? null
  if ('goalLabel' in body) data.goalLabel = body.goalLabel ?? null
  if ('goalTarget' in body) data.goalTarget = body.goalTarget ?? null
  if ('goalCurrent' in body) data.goalCurrent = body.goalCurrent ?? null
  if ('goalUnit' in body) data.goalUnit = body.goalUnit ?? null
  if ('departmentId' in body) data.departmentId = body.departmentId ?? null
  if ('reflectionNote' in body) data.reflectionNote = body.reflectionNote ?? null

  let stateChanged = false
  let nextState = existing.state
  if (typeof body.state === 'string') {
    if (!VALID_STATES.has(body.state)) return apiBadRequest('Invalid state value')
    if (body.state !== existing.state) {
      const allowedNext = ALLOWED_TRANSITIONS[existing.state] || []
      if (!allowedNext.includes(body.state)) {
        return apiBadRequest(`Invalid state transition: ${existing.state} -> ${body.state}`)
      }
      data.state = body.state
      nextState = body.state
      stateChanged = true
      if (body.state === 'COMPLETED') {
        data.endedAt = new Date()
        data.endedById = session.user.id
      }
    }
  }

  // Goal-field change detection for activity log
  const goalFields = ['goal', 'goalLabel', 'goalTarget', 'goalCurrent', 'goalUnit']
  const goalChanges: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of goalFields) {
    if (f in body && (existing as any)[f] !== body[f]) {
      goalChanges[f] = { from: (existing as any)[f], to: body[f] }
    }
  }

  // Optional participants full replacement
  const sprint = await prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({ where: { id }, data })
    if (Array.isArray(body.participantIds)) {
      const ids = Array.from(new Set(body.participantIds.filter((x: unknown) => typeof x === 'string'))) as string[]
      await tx.sprintParticipant.deleteMany({ where: { sprintId: id } })
      if (ids.length > 0) {
        await tx.sprintParticipant.createMany({
          data: ids.map(userId => ({ sprintId: id, userId, role: 'MEMBER' })),
          skipDuplicates: true,
        })
      }
    }
    return updated
  })

  if (stateChanged) {
    const action =
      nextState === 'ACTIVE' ? 'SPRINT_STARTED'
      : nextState === 'COMPLETED' ? 'SPRINT_ENDED'
      : nextState === 'CANCELLED' ? 'SPRINT_CANCELLED'
      : 'SPRINT_GOAL_UPDATED'
    await recordActivity({
      entityType: 'SPRINT', sprintId: id, action: action as any,
      actorId: session.user.id,
      changes: { state: { from: existing.state, to: nextState } },
    })
  }
  if (Object.keys(goalChanges).length > 0) {
    await recordActivity({
      entityType: 'SPRINT', sprintId: id, action: 'SPRINT_GOAL_UPDATED',
      actorId: session.user.id, changes: goalChanges,
    })
    if ('goalCurrent' in goalChanges) {
      await broadcastSprintEvent(id, 'goal:updated', {
        goalCurrent: (sprint as any).goalCurrent ?? null,
        actorId: session.user.id,
      })
    }
  }

  if (Array.isArray(body.participantIds)) {
    await broadcastSprintEvent(id, 'participants:changed', {
      participantIds: body.participantIds,
      actorId: session.user.id,
    })
  }

  return apiSuccess(sprint)
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) return apiNotFound('Not found')

  const role = session.user.role as UserRole
  const allowed = await canDeleteSprint(role, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  // Preserve original behavior: owner can always delete.
  if (!allowed && sprint.ownerId !== session.user.id) {
    return apiForbidden('Insufficient permissions to delete this sprint')
  }

  await prisma.sprint.delete({ where: { id } })
  return apiSuccess(null)
})
