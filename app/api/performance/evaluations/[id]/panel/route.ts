import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManagePanel } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

type PanelInput = { evaluatorId?: string; role?: string }

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManagePanel(actor, id)) return apiForbidden('You cannot manage this evaluator panel')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { assignments: true },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(evaluation.status)) return apiBadRequest('Panel changes are locked after consolidation')
  const body = await request.json().catch(() => ({}))
  const panel = Array.isArray(body.panel) ? body.panel as PanelInput[] : null
  if (!panel || panel.length === 0) return apiBadRequest('At least one evaluator is required')
  const normalized = panel.map((item) => ({ evaluatorId: String(item.evaluatorId ?? ''), role: item.role === 'LEAD' ? 'LEAD' : 'EVALUATOR' }))
  if (normalized.some((item) => !item.evaluatorId)) return apiBadRequest('Every panel member requires an evaluatorId')
  if (new Set(normalized.map((item) => item.evaluatorId)).size !== normalized.length) return apiBadRequest('An evaluator cannot appear twice')
  if (normalized.some((item) => item.evaluatorId === evaluation.employeeId)) return apiBadRequest('Employees cannot evaluate themselves')
  if (normalized.filter((item) => item.role === 'LEAD').length !== 1) return apiBadRequest('Exactly one LEAD evaluator is required')

  const removedSubmitted = evaluation.assignments.filter(
    (assignment) => assignment.status === 'SUBMITTED' && !normalized.some((item) => item.evaluatorId === assignment.evaluatorId),
  )
  if (removedSubmitted.length > 0 && body.confirmDiscardSubmitted !== true) {
    return apiBadRequest('Removing submitted evaluators requires confirmation', {
      evaluatorIds: removedSubmitted.map((assignment) => assignment.evaluatorId),
    })
  }

  await prisma.$transaction(async (tx) => {
    for (const assignment of removedSubmitted) {
      await tx.evaluatorScore.deleteMany({ where: { evaluationId: id, evaluatorId: assignment.evaluatorId } })
    }
    await tx.evaluatorAssignment.deleteMany({ where: { evaluationId: id } })
    await tx.evaluatorAssignment.createMany({
      data: normalized.map((item) => ({ evaluationId: id, evaluatorId: item.evaluatorId, role: item.role })),
    })
  })
  const updated = await prisma.evaluatorAssignment.findMany({
    where: { evaluationId: id },
    include: { evaluator: { select: { id: true, name: true } } },
  })
  return apiSuccess(updated)
})

