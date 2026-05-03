import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden, apiBadRequest } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { getAiOrgConfig } from '@/lib/ai/config'
import { z } from 'zod'
import type { UserRole } from '@/types'

const BodyZ = z.object({
  todoIds: z.array(z.string()).min(0),
})

/**
 * POST /api/sprints/ai/:planId/accept
 *
 * Body: { todoIds: string[] } — the AI-proposed todos the user wants to keep.
 * Any other AI-suggested todo on this sprint is deleted. Carryover dispositions
 * already stored on existing Todo rows are applied:
 *   KEEP        → todo stays on the new sprint (no-op, sprintId already set)
 *   SPLIT       → original CANCELLED, splitInto creates new todos (TODO follow-up)
 *   RESCHEDULE  → sprintId set to null
 *   DESCOPE     → status CANCELLED
 *   ESCALATE    → kept on sprint + manager notification (TODO follow-up)
 *
 * On success: Sprint flips to ACTIVE, AiSprintPlan.status = ACCEPTED, ActivityLog
 * SPRINT_AI_ACCEPTED is recorded.
 */
export const POST = withAuth(async (req, { session, params }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')
  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const body = await req.json().catch(() => ({}))
  const parsed = BodyZ.safeParse(body)
  if (!parsed.success) return apiBadRequest('Invalid body', parsed.error.flatten())

  const plan = await prisma.aiSprintPlan.findUnique({
    where: { id: planId },
    include: { sprint: { include: { todos: true } } },
  })
  if (!plan) return apiNotFound('Plan not found')
  if (plan.status !== 'DRAFT') return apiBadRequest(`Plan is in state ${plan.status}; cannot accept`)

  const role = session.user.role as UserRole
  const requesterId = session.user.id
  if (
    requesterId !== plan.subjectUserId &&
    requesterId !== plan.generatedById &&
    role !== 'ADMIN' &&
    role !== 'EXECUTIVE'
  ) {
    return apiForbidden('Not your plan')
  }

  const keepIds = new Set(parsed.data.todoIds)
  const proposedTodos = plan.sprint.todos.filter((t) => t.aiSuggested)
  const toDelete = proposedTodos.filter((t) => !keepIds.has(t.id))
  const carryoverTodos = plan.sprint.todos.filter((t) => !t.aiSuggested && t.carryoverDisposition)

  await prisma.$transaction(async (tx) => {
    // Drop unselected proposed todos.
    if (toDelete.length) {
      await tx.todo.deleteMany({ where: { id: { in: toDelete.map((t) => t.id) } } })
    }

    // Apply carryover dispositions on existing todos.
    for (const t of carryoverTodos) {
      switch (t.carryoverDisposition) {
        case 'KEEP':
        case 'ESCALATE':
          await tx.todo.update({
            where: { id: t.id },
            data: {
              carryoverCount: t.carryoverCount + 1,
              lastCarriedAt: new Date(),
              originalSprintId: t.originalSprintId ?? plan.sprint.id,
            },
          })
          break
        case 'RESCHEDULE':
          await tx.todo.update({
            where: { id: t.id },
            data: { sprintId: null, carryoverDisposition: 'RESCHEDULE' },
          })
          break
        case 'DESCOPE':
          await tx.todo.update({
            where: { id: t.id },
            data: { status: 'CANCELLED', sprintId: null },
          })
          await tx.activityLog.create({
            data: {
              entityType: 'TODO',
              todoId: t.id,
              sprintId: plan.sprint.id,
              action: 'TODO_DESCOPED_BY_AI',
              actorId: requesterId,
            },
          })
          break
        case 'SPLIT':
          // SPLIT child generation is deferred — for now we KEEP the original to avoid data loss.
          await tx.todo.update({
            where: { id: t.id },
            data: { carryoverCount: t.carryoverCount + 1, lastCarriedAt: new Date() },
          })
          break
      }
    }

    // Flip sprint + plan state.
    await tx.sprint.update({
      where: { id: plan.sprint.id },
      data: { state: 'ACTIVE' },
    })
    await tx.aiSprintPlan.update({
      where: { id: plan.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    })
    await tx.activityLog.create({
      data: {
        entityType: 'SPRINT',
        sprintId: plan.sprint.id,
        action: 'SPRINT_AI_ACCEPTED',
        actorId: requesterId,
        metadata: {
          acceptedTodoCount: keepIds.size,
          deletedTodoCount: toDelete.length,
        } as unknown as object,
      },
    })
  })

  return apiSuccess({ sprintId: plan.sprint.id, planId: plan.id, accepted: keepIds.size, dropped: toDelete.length })
})
