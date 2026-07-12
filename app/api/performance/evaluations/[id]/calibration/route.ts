import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { assertEvaluationTransition, canResolveCalibration, canViewCalibration } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canViewCalibration(actor, id)) return apiForbidden('Calibration is restricted to the lead evaluator and performance administrators')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      assignments: { include: { evaluator: { select: { id: true, name: true } } } },
      scores: true,
      results: { include: { criterion: { select: { id: true, title: true, maxPoints: true } } } },
    },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  return apiSuccess(evaluation)
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canResolveCalibration(actor, id)) return apiForbidden('You do not have permission to resolve calibration')
  const current = await prisma.evaluation.findUnique({ where: { id }, select: { status: true } })
  if (!current) return apiNotFound('Evaluation not found')
  if (current.status !== 'CALIBRATION') return apiBadRequest('Calibration can only be resolved while the evaluation is in calibration')
  assertEvaluationTransition(current.status, 'CONSOLIDATED')
  const body = await request.json().catch(() => ({}))
  const notes = Array.isArray(body.notes) ? body.notes as Array<{ criterionId?: string; note?: string }> : []
  const flagged = await prisma.criterionResult.findMany({ where: { evaluationId: id, flagged: true } })
  for (const result of flagged) {
    const input = notes.find((note) => note.criterionId === result.criterionId)
    if (!input?.note?.trim()) return apiBadRequest('Every flagged criterion requires a calibration note')
  }
  await prisma.$transaction(async (tx) => {
    for (const note of notes) {
      if (!note.criterionId || !note.note?.trim()) continue
      await tx.criterionResult.update({
        where: { evaluationId_criterionId: { evaluationId: id, criterionId: note.criterionId } },
        data: { calibrationNote: note.note.trim(), resolvedAt: new Date(), resolvedById: session.user.id },
      })
    }
    await tx.evaluation.update({ where: { id }, data: { status: 'CONSOLIDATED' } })
  })
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'CALIBRATION_RESOLVED',
    actorId: session.user.id,
    metadata: { resolvedCriteria: flagged.map((result) => result.criterionId) },
  })
  return apiSuccess({ resolved: flagged.length })
})
