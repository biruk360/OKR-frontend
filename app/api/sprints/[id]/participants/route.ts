import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { canEditSprint, canViewSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { broadcastSprintEvent } from '@/lib/pusher'

/**
 * Sprint members (invite-only boards, 2026-09-25).
 *
 *   GET    — who is on the board: the owner + SprintParticipants, and whether
 *            the caller may manage them. Requires `canViewSprint` (404 otherwise).
 *   POST   { userId } — invite one person. Requires `canEditSprint`.
 *   DELETE ?userId=    — remove one person. Requires `canEditSprint`. Never
 *            touches their cards: they stay assignee/member, and being put on a
 *            card again re-invites them.
 *
 * Single-row add/remove rather than PATCH /api/sprints/[id] `participantIds`
 * (a full replacement) so a dialog working from a stale list can never erase
 * someone who was invited meanwhile — e.g. auto-invited by a card assignment.
 */

async function loadSprint(id: string) {
  return prisma.sprint.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      departmentId: true,
      owner: { select: { id: true, name: true, avatar: true } },
      participants: {
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, avatar: true, email: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
}

type Session = { user: { id: string; role: string; userType?: string | null } }

async function viewGate(sprint: NonNullable<Awaited<ReturnType<typeof loadSprint>>>, session: Session) {
  return canViewSprint(session.user.role as UserRole, session.user.id, sprint, {
    userType: session.user.userType,
  })
}

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')
  const sprint = await loadSprint(id)
  if (!sprint || !(await viewGate(sprint, session))) return apiNotFound('Sprint not found')

  const canManage = await canEditSprint(session.user.role as UserRole, session.user.id, sprint)
  return apiSuccess({
    owner: sprint.owner,
    participants: sprint.participants
      // The owner may also hold a participant row (backfill); list them once.
      .filter((p) => p.userId !== sprint.ownerId)
      .map((p) => ({ ...p.user, role: p.role, joinedAt: p.joinedAt })),
    canManage,
  })
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')
  const sprint = await loadSprint(id)
  if (!sprint || !(await viewGate(sprint, session))) return apiNotFound('Sprint not found')
  if (!(await canEditSprint(session.user.role as UserRole, session.user.id, sprint))) {
    return apiForbidden('Only the sprint owner or an admin can invite people')
  }

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: unknown }
  if (typeof userId !== 'string' || !userId) return apiBadRequest('userId is required')
  const user = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true } })
  if (!user) return apiBadRequest('Unknown or inactive user')

  // Idempotent: inviting someone already on the board is a no-op, not a 409.
  const { count } = await prisma.sprintParticipant.createMany({
    data: [{ sprintId: id, userId, role: 'MEMBER' }],
    skipDuplicates: true,
  })
  if (count > 0) {
    await recordActivity({
      entityType: 'SPRINT', sprintId: id, action: 'UPDATED',
      actorId: session.user.id,
      metadata: { participantAdded: userId },
    })
    await broadcastSprintEvent(id, 'participants:changed', { added: [userId], actorId: session.user.id })
  }
  return apiSuccess({ userId: user.id, name: user.name, added: count > 0 })
})

export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')
  const sprint = await loadSprint(id)
  if (!sprint || !(await viewGate(sprint, session))) return apiNotFound('Sprint not found')
  if (!(await canEditSprint(session.user.role as UserRole, session.user.id, sprint))) {
    return apiForbidden('Only the sprint owner or an admin can remove people')
  }

  const userId = new URL(request.url).searchParams.get('userId')
  if (!userId) return apiBadRequest('userId is required')
  if (userId === sprint.ownerId) return apiBadRequest('The sprint owner cannot be removed')

  // Board access only — the person's cards are deliberately left alone.
  const { count } = await prisma.sprintParticipant.deleteMany({ where: { sprintId: id, userId } })
  if (count > 0) {
    await recordActivity({
      entityType: 'SPRINT', sprintId: id, action: 'UPDATED',
      actorId: session.user.id,
      metadata: { participantRemoved: userId },
    })
    await broadcastSprintEvent(id, 'participants:changed', { removed: [userId], actorId: session.user.id })
  }
  return apiSuccess({ removed: count > 0 })
})
