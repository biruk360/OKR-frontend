import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { getAiOrgConfig } from '@/lib/ai/config'
import type { UserRole } from '@/types'

/**
 * GET /api/sprints/ai/:planId — fetch a draft plan with the proposed todos and
 * any carryover dispositions for the review screen.
 */
export const GET = withAuth(async (_req, { session, params }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')

  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const plan = await prisma.aiSprintPlan.findUnique({
    where: { id: planId },
    include: {
      sprint: {
        include: {
          todos: {
            include: {
              keyResult: { select: { id: true, title: true, unit: true, targetValue: true, currentValue: true } },
            },
          },
        },
      },
    },
  })
  if (!plan) return apiNotFound('Plan not found')

  // RBAC: subject + requester are the only ones with access (plus ADMIN/EXEC).
  const requesterId = session.user.id
  const role = session.user.role as UserRole
  if (
    requesterId !== plan.subjectUserId &&
    requesterId !== plan.generatedById &&
    role !== 'ADMIN' &&
    role !== 'EXECUTIVE'
  ) {
    return apiForbidden('Not your plan')
  }

  return apiSuccess({
    planId: plan.id,
    status: plan.status,
    provider: plan.provider,
    modelId: plan.modelId,
    rationale: plan.rationale,
    allocations: plan.allocations,
    prevSprintReview: plan.prevSprintReview,
    carryoverSummary: plan.carryoverSummary,
    feedback: plan.feedback,
    createdAt: plan.createdAt,
    acceptedAt: plan.acceptedAt,
    sprint: {
      id: plan.sprint.id,
      name: plan.sprint.name,
      state: plan.sprint.state,
      startDate: plan.sprint.startDate,
      endDate: plan.sprint.endDate,
    },
    proposedTodos: plan.sprint.todos
      .filter((t) => t.aiSuggested)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        ambitionLevel: t.ambitionLevel,
        progressValue: t.progressValue,
        dueDate: t.dueDate,
        taskType: t.taskType,
        keyResult: t.keyResult,
        objectiveId: t.objectiveId,
      })),
    carryover: plan.sprint.todos
      .filter((t) => !t.aiSuggested && t.carryoverDisposition)
      .map((t) => ({
        id: t.id,
        title: t.title,
        disposition: t.carryoverDisposition,
        carryoverCount: t.carryoverCount,
        progressValue: t.progressValue,
        dueDate: t.dueDate,
        keyResultId: t.keyResultId,
      })),
  })
})
