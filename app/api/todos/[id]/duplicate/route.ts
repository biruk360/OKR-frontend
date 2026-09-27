import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, apiForbidden, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { canViewSprint, type UserRole } from '@/lib/permissions'
import { canReadTodo } from '@/lib/todos/access'
import { inviteToSprint } from '@/lib/sprints/participants'

/**
 * POST /api/todos/[id]/duplicate — copy a card (CDM-3).
 *
 * Copies the things that describe the work — title, description, priority,
 * cover, labels, members, checklists (unticked), OKR link — and deliberately
 * does NOT copy the things that describe its history: comments, attachments,
 * activity, carryover lineage, or completion. A duplicate is a fresh piece of
 * work, not a clone of a conversation.
 *
 * The copy lands directly below the original so it does not appear at the
 * bottom of a long lane where the user will not see it.
 */
export const POST = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid todo id')

  const source = await prisma.todo.findUnique({
    where: { id },
    include: {
      members: { select: { userId: true } },
      labels: { select: { labelDefId: true } },
      checklists: { include: { items: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } },
      sprint: { select: { state: true, ownerId: true, participants: { select: { userId: true } } } },
    },
  })
  if (!source) return apiNotFound('To-do not found')

  // The source must be readable (404 otherwise, so ids cannot be probed), and a
  // copy lands on the same board, so a sprint card may only be duplicated by
  // someone who can view that sprint (invite-only boards).
  if (!(await canReadTodo(session.user, id))) return apiNotFound('To-do not found')
  if (source.sprintId && source.sprint) {
    const canViewTarget = await canViewSprint(session.user.role as UserRole, session.user.id, source.sprint, {
      userType: session.user.userType,
    })
    if (!canViewTarget) return apiForbidden('You do not have access to this sprint')
  }

  if (source.sprint && (source.sprint.state === 'COMPLETED' || source.sprint.state === 'CANCELLED')) {
    return apiBadRequest('This sprint is closed and read-only')
  }

  const created = await prisma.$transaction(async (tx) => {
    const todo = await tx.todo.create({
      data: {
        title: `${source.title} (copy)`.slice(0, 255),
        description: source.description,
        // A copy starts as new work regardless of where the original stood.
        status: 'PENDING',
        priority: source.priority,
        coverColor: source.coverColor,
        coverSize: source.coverSize,
        startDate: source.startDate,
        dueDate: source.dueDate,
        startTime: source.startTime,
        endTime: source.endTime,
        assigneeId: source.assigneeId,
        creatorId: session.user.id,
        keyResultId: source.keyResultId,
        objectiveId: source.objectiveId,
        progressValue: source.progressValue,
        taskType: source.taskType,
        sprintId: source.sprintId,
        columnId: source.columnId,
        // Directly below the original rather than at the end of the lane.
        sprintPosition: source.sprintPosition + 1,
        ...(source.members.length > 0 && {
          members: { createMany: { data: source.members.map((m) => ({ userId: m.userId })), skipDuplicates: true } },
        }),
        ...(source.labels.length > 0 && {
          labels: { createMany: { data: source.labels.map((l) => ({ labelDefId: l.labelDefId })), skipDuplicates: true } },
        }),
      },
      select: { id: true, title: true },
    })

    // The copy's assignee and members are put on a sprint card — an invitation
    // to its board (normally a no-op: they are on the original already).
    await inviteToSprint(tx, source.sprintId, [source.assigneeId, ...source.members.map((m) => m.userId)])

    for (const list of source.checklists) {
      await tx.todoChecklist.create({
        data: {
          todoId: todo.id,
          title: list.title,
          position: list.position,
          items: {
            createMany: {
              // Unticked: the copy's checklist is work still to do.
              data: list.items.map((i) => ({
                title: i.title,
                completed: false,
                position: i.position,
                assigneeId: i.assigneeId,
                dueDate: i.dueDate,
                startDate: i.startDate,
              })),
            },
          },
        },
      })
    }
    return todo
  })

  await recordActivity({
    entityType: 'TODO',
    todoId: created.id,
    sprintId: source.sprintId,
    action: 'INITIATIVE_CREATED',
    actorId: session.user.id,
    metadata: { duplicatedFrom: id },
  })

  return apiSuccess(created, { status: 201 })
})
