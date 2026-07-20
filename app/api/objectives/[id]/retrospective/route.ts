import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditObjective, canViewObjective } from '@/lib/permissions'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { buildObjectiveEvidence } from '@/lib/okr/evidence'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: { retrospective: true },
  })
  if (!objective) return apiNotFound('Objective not found')
  const visibility = await canViewObjective(session.user.role as any, session.user.id, objective)
  if (!visibility.canView) return apiForbidden('Access denied')
  const evidence = await buildObjectiveEvidence(prisma, id)
  return apiSuccess({ retrospective: objective.retrospective, evidence })
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')
  const locked = await objectiveLockResponse(id)
  if (locked) return locked
  const objective = await prisma.objective.findUnique({ where: { id } })
  if (!objective) return apiNotFound('Objective not found')
  if (objective.closureStatus !== 'CLOSING') return apiConflict('Start the close workflow before editing its retrospective')
  if (!await canEditObjective(session.user.role as any, session.user.id, objective)) return apiForbidden('Insufficient permissions')
  const body = await request.json()
  const retro = await prisma.okrRetrospective.upsert({
    where: { objectiveId: id },
    create: {
      objectiveId: id,
      entityType: 'OBJECTIVE',
      whatWasAchieved: body.whatWasAchieved ?? '',
      whatWentWell: body.whatWentWell || null,
      whatBlockedUs: body.whatBlockedUs || null,
      whatWeLearned: body.whatWeLearned ?? '',
      primaryBlocker: body.primaryBlocker || null,
      wouldSetAgain: body.wouldSetAgain ?? null,
      wasAmbitious: body.wasAmbitious ?? null,
      recommendedAction: body.recommendedAction ?? '',
      gradeRationale: body.gradeRationale || null,
      autoStatsJson: {},
      authorId: session.user.id,
    },
    update: {
      whatWasAchieved: body.whatWasAchieved ?? '',
      whatWentWell: body.whatWentWell || null,
      whatBlockedUs: body.whatBlockedUs || null,
      whatWeLearned: body.whatWeLearned ?? '',
      primaryBlocker: body.primaryBlocker || null,
      wouldSetAgain: body.wouldSetAgain ?? null,
      wasAmbitious: body.wasAmbitious ?? null,
      recommendedAction: body.recommendedAction ?? '',
      gradeRationale: body.gradeRationale || null,
      authorId: session.user.id,
    },
  })
  await recordActivity({ entityType: 'OBJECTIVE', objectiveId: id, action: 'UPDATED', actorId: session.user.id, metadata: { area: 'retrospective' } })
  return apiSuccess(retro, { message: 'Retrospective draft saved.' })
})
