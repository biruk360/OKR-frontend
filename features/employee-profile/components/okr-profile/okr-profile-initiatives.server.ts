/**
 * PRF-11 "Add a milestone or task" from the OKR profile tree —
 * `POST /api/users/[id]/okr-profile/initiatives`.
 *
 * Same rules as the existing KR initiative create (`POST /api/keyresults/[id]/todos`):
 * the route runs `keyResultLockResponse` (423) first; here the KR must exist and be
 * open, and the actor must pass `canEditKeyResultWithObjectiveContext`
 * (lib/permissions.ts). The only difference is that the card carries its FND-4
 * `kind` (MILESTONE | TASK) and an optional due date, which the existing create
 * routes do not accept yet. Writes `INITIATIVE_ADDED` to the KR's activity log in
 * the same transaction.
 *
 * Server only; imported by direct path from the route.
 */
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { canEditKeyResultWithObjectiveContext, type UserRole } from '@/lib/permissions'
import { OkrProfileError } from './okr-profile.server'
import { parseDateOnly, type CreateProfileInitiativeInput } from './schemas'

export interface InitiativeActor {
  id: string
  role: string
}

export interface CreatedProfileInitiative {
  id: string
  cardNumber: number
  title: string
  kind: string
  keyResultId: string
  objectiveId: string
  assigneeId: string | null
  dueDate: string | null
}

export async function createProfileInitiative(
  actor: InitiativeActor,
  profileUserId: string,
  input: CreateProfileInitiativeInput,
): Promise<CreatedProfileInitiative> {
  const kr = await prisma.keyResult.findUnique({
    where: { id: input.keyResultId },
    select: {
      id: true,
      ownerId: true,
      objectiveId: true,
      status: true,
      closureStatus: true,
      objective: { select: { level: true, ownerId: true, departmentId: true, status: true } },
    },
  })
  if (!kr || kr.status === 'DELETED' || kr.objective.status === 'DELETED') {
    throw new OkrProfileError(404, 'Key result not found')
  }
  if (kr.closureStatus !== 'OPEN') {
    throw new OkrProfileError(409, 'This key result is closing or closed. Reopen it to add work.')
  }

  const allowed = await canEditKeyResultWithObjectiveContext(
    actor.role as UserRole,
    actor.id,
    { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
    kr.objective,
  )
  if (!allowed) throw new OkrProfileError(403, 'Insufficient permissions to add work to this key result')

  // Default assignee: the person whose profile this is. `null` leaves it unassigned.
  const requestedAssignee = input.assigneeId === undefined ? profileUserId : input.assigneeId
  let assigneeId: string | null = null
  if (requestedAssignee) {
    const assignee = await prisma.user.findFirst({
      where: { id: requestedAssignee, isActive: true },
      select: { id: true },
    })
    if (!assignee) throw new OkrProfileError(400, 'Invalid assignee')
    assigneeId = assignee.id
  }

  const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null

  const created = await prisma.$transaction(async (tx) => {
    const todo = await tx.todo.create({
      data: {
        title: input.title,
        description: '',
        status: 'PENDING',
        kind: input.kind,
        assigneeId,
        creatorId: actor.id,
        keyResultId: kr.id,
        dueDate,
      },
      select: { id: true, cardNumber: true, title: true, kind: true, assigneeId: true, dueDate: true },
    })
    await recordActivity(
      {
        entityType: 'KEY_RESULT',
        keyResultId: kr.id,
        objectiveId: kr.objectiveId,
        action: 'INITIATIVE_ADDED',
        actorId: actor.id,
        metadata: {
          initiativeId: todo.id,
          title: todo.title,
          assigneeId,
          kind: todo.kind,
          source: 'okr-profile',
        },
      },
      { client: tx, required: true },
    )
    return todo
  })

  return {
    id: created.id,
    cardNumber: created.cardNumber,
    title: created.title,
    kind: created.kind,
    keyResultId: kr.id,
    objectiveId: kr.objectiveId,
    assigneeId: created.assigneeId,
    dueDate: created.dueDate ? created.dueDate.toISOString() : null,
  }
}
