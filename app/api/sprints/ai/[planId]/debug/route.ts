import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@/types'

/**
 * GET /api/sprints/ai/:planId/debug — admin/exec-only diagnostic for a generated
 * plan. Answers "why did this plan come back with zero proposed tasks?" without
 * needing DB shell access.
 */
export const GET = withAuth(async (_req, { session, params }) => {
  const role = session.user.role as UserRole
  if (role !== 'ADMIN' && role !== 'EXECUTIVE') return apiForbidden('Admin/Executive only')

  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const plan = await prisma.aiSprintPlan.findUnique({
    where: { id: planId },
    include: { sprint: { include: { todos: true } } },
  })
  if (!plan) return apiNotFound('Plan not found')
  if (!plan.subjectUserId) return apiNotFound('Plan has no subject user (department-scoped plans not supported here)')
  const subjectUserId = plan.subjectUserId

  const subjectActiveKrs = await prisma.keyResult.findMany({
    where: { ownerId: subjectUserId, status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      objectiveId: true,
      startValue: true,
      currentValue: true,
      targetValue: true,
    },
  })

  const subjectActiveObjectives = await prisma.objective.count({
    where: { ownerId: subjectUserId, status: 'ACTIVE' },
  })

  const logs = await prisma.aiGenerationLog.findMany({
    where: { planId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      createdAt: true,
      status: true,
      errorMessage: true,
      inputTokens: true,
      outputTokens: true,
      latencyMs: true,
      modelId: true,
      responseJson: true,
    },
  })

  const aiTodos = plan.sprint.todos.filter((t) => t.aiSuggested)
  const carryoverTodos = plan.sprint.todos.filter((t) => !t.aiSuggested)

  const krsWithRoom = subjectActiveKrs.filter((kr) => {
    const planned = kr.targetValue - kr.startValue
    const remaining = kr.targetValue - kr.currentValue
    return planned > 0 && remaining > 0
  })

  return apiSuccess({
    planId: plan.id,
    subjectUserId,
    generatedById: plan.generatedById,
    provider: plan.provider,
    modelId: plan.modelId,
    status: plan.status,
    promptTokens: plan.promptTokens,
    outputTokens: plan.outputTokens,
    createdAt: plan.createdAt,
    rationaleSnippet: plan.rationale.slice(0, 400),
    sprint: {
      id: plan.sprint.id,
      state: plan.sprint.state,
      startDate: plan.sprint.startDate,
      endDate: plan.sprint.endDate,
      totalTodos: plan.sprint.todos.length,
      aiSuggestedTodos: aiTodos.length,
      carryoverTodos: carryoverTodos.length,
    },
    subjectContext: {
      activeObjectiveCount: subjectActiveObjectives,
      activeKeyResultCount: subjectActiveKrs.length,
      keyResultsWithRoomToGrow: krsWithRoom.length,
      sampleKeyResults: subjectActiveKrs.slice(0, 5).map((kr) => ({
        id: kr.id,
        title: kr.title,
        startValue: kr.startValue,
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
      })),
    },
    generationLogs: logs,
    diagnosis: diagnose({
      activeKrs: subjectActiveKrs.length,
      krsWithRoom: krsWithRoom.length,
      aiTodos: aiTodos.length,
      logs,
    }),
  })
})

function diagnose(input: {
  activeKrs: number
  krsWithRoom: number
  aiTodos: number
  logs: Array<{
    status: string
    errorMessage: string | null
    outputTokens: number
    responseJson: unknown
  }>
}): string {
  const lastLog = input.logs[0]
  if (input.aiTodos > 0) return 'OK — proposed tasks exist on this plan.'
  if (input.activeKrs === 0) {
    return 'NO_ACTIVE_KRS — subject has no ACTIVE key results, so the bundler had nothing to plan against.'
  }
  if (input.krsWithRoom === 0) {
    return 'NO_KR_HEADROOM — subject has active KRs but all are at/above target, so no work was proposed.'
  }
  if (lastLog?.status === 'ERROR') {
    return `PROVIDER_ERROR — last AI call failed: ${lastLog.errorMessage ?? 'unknown'}`
  }
  if (lastLog && lastLog.outputTokens === 0) {
    return 'PROVIDER_EMPTY_OUTPUT — AI returned 0 output tokens (likely hit max-tokens before emitting visible content).'
  }
  // Response body distinguishes "AI returned empty array" from "AI returned tasks
  // that got filtered out by the in-scope guard". Available for new generations
  // since responseJson logging landed.
  const body = lastLog?.responseJson as { proposedTodos?: unknown[] } | null | undefined
  if (body && Array.isArray(body.proposedTodos)) {
    if (body.proposedTodos.length === 0) {
      return 'AI_RETURNED_EMPTY_ARRAY — provider succeeded but chose to return zero proposedTodos. Inspect responseJson on the latest log row; usually a prompt issue.'
    }
    return `AI_RETURNED_${body.proposedTodos.length}_TODOS_ALL_FILTERED — provider returned ${body.proposedTodos.length} todos but every one referenced a keyResultId/objectiveId outside the bundle scope and was dropped at pipeline.ts:160. Inspect responseJson to see the offending ids.`
  }
  return 'AI_RETURNED_EMPTY_OR_FILTERED — no responseJson recorded for this older plan; cannot distinguish empty-array vs filter drop. Re-generate to get a logged response body.'
}
