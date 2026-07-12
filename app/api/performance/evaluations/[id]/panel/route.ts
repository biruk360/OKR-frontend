import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManagePanel } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

type PanelInput = { evaluatorId?: string; role?: string }

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManagePanel(actor, id)) return apiForbidden('You cannot manage this evaluator panel')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { assignments: true, cycle: { select: { status: true } } },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(evaluation.status)) return apiBadRequest('Panel changes are locked after consolidation')
  if (evaluation.cycle.status !== 'OPEN') return apiBadRequest('Panel changes require an open review cycle')
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

  const existingByEvaluator = new Map(evaluation.assignments.map((assignment) => [assignment.evaluatorId, assignment]))
  const removed = evaluation.assignments.filter((assignment) => !normalized.some((item) => item.evaluatorId === assignment.evaluatorId))
  const added = normalized.filter((item) => !existingByEvaluator.has(item.evaluatorId))
  const retainedRoleChanges = normalized.filter((item) => {
    const existing = existingByEvaluator.get(item.evaluatorId)
    return !!existing && existing.role !== item.role
  })

  await prisma.$transaction(async (tx) => {
    for (const assignment of removedSubmitted) {
      await tx.evaluatorScore.deleteMany({ where: { evaluationId: id, evaluatorId: assignment.evaluatorId } })
    }
    if (removed.length > 0) {
      await tx.evaluatorAssignment.deleteMany({ where: { evaluationId: id, evaluatorId: { in: removed.map((assignment) => assignment.evaluatorId) } } })
    }
    if (added.length > 0) {
      await tx.evaluatorAssignment.createMany({
        data: added.map((item) => ({ evaluationId: id, evaluatorId: item.evaluatorId, role: item.role })),
      })
    }
    for (const item of retainedRoleChanges) {
      await tx.evaluatorAssignment.update({
        where: { evaluationId_evaluatorId: { evaluationId: id, evaluatorId: item.evaluatorId } },
        data: { role: item.role },
      })
    }
  })
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'PANEL_UPDATED',
    actorId: session.user.id,
    metadata: {
      added: added.map((item) => item.evaluatorId),
      removed: removed.map((assignment) => assignment.evaluatorId),
      roleChanges: retainedRoleChanges.map((item) => ({ evaluatorId: item.evaluatorId, role: item.role })),
      discardedSubmissions: removedSubmitted.map((assignment) => assignment.evaluatorId),
    },
  })
  const updated = await prisma.evaluatorAssignment.findMany({
    where: { evaluationId: id },
    include: { evaluator: { select: { id: true, name: true } } },
  })
  return apiSuccess(updated)
})

