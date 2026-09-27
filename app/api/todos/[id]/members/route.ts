import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { todoWriteGuard } from '@/lib/todos/access'
import { inviteToSprint } from '@/lib/sprints/participants'

/**
 * Single-member add/remove (API-8).
 *
 * Members were only editable by PATCHing the whole `memberIds` array, which is
 * a lost update waiting to happen: two people opening the same card and each
 * adding someone would have the second write erase the first's addition,
 * because each sends the full list as they last saw it. These touch one row.
 *
 * The array form stays for back-compat.
 */
async function guard(todoId: string, session: { user: { id: string; role: string; userType?: string | null } }) {
  // A card write: 404 without read, 403 without canWriteTodo, 409 SPRINT_CLOSED.
  return todoWriteGuard(todoId, session.user, 'You do not have access to this card')
}

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await guard(todoId, session)
  if (denied) return denied

  const { userId } = await request.json().catch(() => ({})) as { userId?: string }
  if (!userId) return apiBadRequest('userId is required')

  const user = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true } })
  if (!user) return apiBadRequest('Unknown or inactive user')

  // Idempotent: adding someone already on the card is a no-op, not a 409.
  // Being put on a sprint card is an invitation to its board (invite-only
  // sprints): the SprintParticipant is upserted in the same transaction.
  await prisma.$transaction(async (tx) => {
    const card = await tx.todo.findUnique({ where: { id: todoId }, select: { sprintId: true } })
    await tx.todoMember.upsert({
      where: { todoId_userId: { todoId, userId } },
      create: { todoId, userId },
      update: {},
    })
    await inviteToSprint(tx, card?.sprintId, [userId])
  })
  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_UPDATED',
    actorId: session.user.id,
    metadata: { memberAdded: userId },
  })
  return apiSuccess({ userId: user.id, name: user.name })
})

export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await guard(todoId, session)
  if (denied) return denied

  const userId = new URL(request.url).searchParams.get('userId')
  if (!userId) return apiBadRequest('userId is required')

  // Leaving a card never removes the person from the sprint's participants.
  await prisma.todoMember.deleteMany({ where: { todoId, userId } })
  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_UPDATED',
    actorId: session.user.id,
    metadata: { memberRemoved: userId },
  })
  return apiSuccess({ removed: true })
})
