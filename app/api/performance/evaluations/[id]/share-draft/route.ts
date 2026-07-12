import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canShareDraft, createEvaluationReport } from '@/lib/performance'
import { emit } from '@/lib/notifications/dispatcher'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canShareDraft(actor, id)) return apiForbidden('Only the lead evaluator or administrator can share the draft')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    select: { status: true, employeeId: true, cycle: { select: { name: true } } },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (evaluation.status !== 'CONSOLIDATED') return apiBadRequest('Evaluation must be consolidated before sharing')
  const report = await createEvaluationReport(id)
  await prisma.$transaction([
    prisma.evaluation.update({ where: { id }, data: { status: 'DRAFT_SHARED', draftSharedAt: new Date() } }),
    prisma.evaluationAcknowledgement.create({ data: { evaluationId: id, reportId: report.id } }),
  ])
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'DRAFT_SHARED',
    actorId: session.user.id,
    metadata: { reportId: report.id, reportVersion: report.version },
  })
  await emit('PERF_DRAFT_SHARED', {
    actorId: session.user.id,
    explicitRecipients: [evaluation.employeeId],
    data: { evaluationId: id, cycleName: evaluation.cycle.name },
  })
  return apiSuccess(report)
})

