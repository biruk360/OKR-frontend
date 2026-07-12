import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canRespondToReport, resolvePerformanceAdmins } from '@/lib/performance'
import { emit } from '@/lib/notifications/dispatcher'
import { recordActivity } from '@/lib/activity-log'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canRespondToReport(actor, 'dispute')) return apiForbidden('You do not have permission to dispute reports')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      acknowledgements: { orderBy: { createdAt: 'desc' }, take: 1 },
      assignments: { where: { role: 'LEAD' }, select: { evaluatorId: true } },
      employee: { select: { name: true } },
      cycle: { select: { name: true } },
    },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (evaluation.employeeId !== session.user.id) return apiForbidden('Only the evaluated employee can dispute this report')
  if (evaluation.status !== 'DRAFT_SHARED' || !evaluation.acknowledgements[0]) return apiBadRequest('No shared draft is awaiting acknowledgement')
  const body = await request.json().catch(() => ({}))
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (!comment) return apiBadRequest('A dispute comment is required')
  await prisma.$transaction([
    prisma.evaluationAcknowledgement.update({
      where: { id: evaluation.acknowledgements[0].id },
      data: { status: 'DISPUTED', comment, acknowledgedAt: new Date() },
    }),
    prisma.evaluation.update({ where: { id }, data: { status: 'CALIBRATION' } }),
  ])
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'EVALUATION_DISPUTED',
    actorId: session.user.id,
    metadata: { comment },
  })
  const admins = await resolvePerformanceAdmins()
  const recipients = Array.from(new Set([...evaluation.assignments.map((assignment) => assignment.evaluatorId), ...admins]))
  await emit('PERF_DISPUTE_RAISED', {
    actorId: session.user.id,
    explicitRecipients: recipients,
    data: { evaluationId: id, employeeName: evaluation.employee.name, cycleName: evaluation.cycle.name },
  })
  return apiSuccess({ disputed: true })
})
