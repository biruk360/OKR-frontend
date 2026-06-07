import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canViewCalibration, canViewEvaluation, isPerformanceAdmin } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canViewEvaluation(actor, id)) return apiForbidden('You do not have access to this evaluation')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, designation: true, avatar: true } },
      cycle: { select: { id: true, name: true, status: true, periodStart: true, periodEnd: true } },
      template: {
        include: {
          family: { select: { name: true, roleLabel: true } },
          tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } },
        },
      },
      assignments: { include: { evaluator: { select: { id: true, name: true, avatar: true } } } },
      scores: true,
      results: true,
      reports: { orderBy: { version: 'desc' }, take: 1 },
    },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')

  const admin = await isPerformanceAdmin(actor)
  const isEmployee = evaluation.employeeId === session.user.id && !admin
  const calibrationAccess = await canViewCalibration(actor, id)
  if (isEmployee && !['DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)) {
    return apiSuccess({
      id: evaluation.id,
      status: evaluation.status,
      employee: evaluation.employee,
      cycle: evaluation.cycle,
      sealed: true,
    })
  }
  if (isEmployee) {
    return apiSuccess({
      id: evaluation.id,
      status: evaluation.status,
      employee: evaluation.employee,
      cycle: evaluation.cycle,
      template: evaluation.template,
      results: evaluation.results.map(({ calibrationNote: _note, resolvedById: _resolvedBy, ...result }) => result),
      normalized: evaluation.normalized,
      gatekeeperPass: evaluation.gatekeeperPass,
      decisionBand: evaluation.decisionBand,
      report: evaluation.reports[0] ?? null,
    })
  }

  const scores = admin || calibrationAccess
    ? evaluation.scores
    : evaluation.scores.filter((score) => score.evaluatorId === session.user.id)
  return apiSuccess({ ...evaluation, scores })
})
