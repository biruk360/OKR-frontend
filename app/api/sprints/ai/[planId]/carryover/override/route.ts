import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden, apiBadRequest } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { UserRole } from '@/types'
import { getAiOrgConfig } from '@/lib/ai/config'

const BodyZ = z.object({
  todoId: z.string().min(1),
  disposition: z.enum(['KEEP', 'SPLIT', 'RESCHEDULE', 'DESCOPE', 'ESCALATE']),
  reason: z.string().max(500).optional(),
})

/**
 * POST /api/sprints/ai/:planId/carryover/override
 *
 * Owner overrides the AI's (or server-forced) disposition for a single carryover
 * todo. The override is recorded on the Todo row + as an ActivityLog entry; the
 * actual sprint transition happens at /accept time.
 *
 * Note: this does NOT bypass the server-forced rules (KR archived → DESCOPE
 * etc.) — see lib/ai/carryover.ts §3.5.3. Those are reapplied at /accept.
 */
export const POST = withAuth(async (req, { session, params }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')
  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const body = await req.json().catch(() => ({}))
  const parsed = BodyZ.safeParse(body)
  if (!parsed.success) return apiBadRequest('Invalid body', parsed.error.flatten())

  const plan = await prisma.aiSprintPlan.findUnique({ where: { id: planId } })
  if (!plan) return apiNotFound('Plan not found')
  if (plan.status !== 'DRAFT') return apiBadRequest(`Plan is in state ${plan.status}; cannot override`)

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

  const todo = await prisma.todo.findUnique({ where: { id: parsed.data.todoId } })
  if (!todo) return apiNotFound('Todo not found')
  if (todo.sprintId !== plan.sprintId) return apiBadRequest('Todo is not part of this plan')

  await prisma.$transaction(async (tx) => {
    await tx.todo.update({
      where: { id: todo.id },
      data: { carryoverDisposition: parsed.data.disposition },
    })
    await tx.activityLog.create({
      data: {
        entityType: 'TODO',
        todoId: todo.id,
        sprintId: plan.sprintId,
        action: 'CARRYOVER_OVERRIDE',
        actorId: requesterId,
        metadata: {
          fromDisposition: todo.carryoverDisposition,
          toDisposition: parsed.data.disposition,
          reason: parsed.data.reason ?? null,
        } as unknown as object,
      },
    })
  })

  return apiSuccess({ todoId: todo.id, disposition: parsed.data.disposition })
})
