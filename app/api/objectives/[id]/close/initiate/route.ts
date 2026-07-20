import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  canCloseBeforePeriodEnd,
  confidenceTierFromScore,
  firstConfidence,
  isTimeframeEnded,
  parseInitiateCloseInput,
} from '@/lib/okr/period-close'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      timeframe: { select: { endDate: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          closureStatus: true,
          confidence: true,
          checkIns: { select: { confidence: true, asOfDate: true }, orderBy: { asOfDate: 'asc' } },
        },
      },
    },
  })
  if (!objective) return apiNotFound('Objective not found')
  if (objective.closureStatus !== 'OPEN') return apiConflict('Only an open objective can begin closing')

  const allowed = await canEditObjective(session.user.role as any, session.user.id, objective)
  if (!allowed) return apiForbidden('Insufficient permissions to close this objective')
  if (!isTimeframeEnded(objective.timeframe.endDate) && !canCloseBeforePeriodEnd(session.user.role)) {
    return apiForbidden('Only an administrator or executive can close an OKR before its timeframe ends')
  }

  const unfinished = objective.keyResults.filter((kr) => kr.closureStatus !== 'CLOSED')
  if (unfinished.length > 0) {
    return apiConflict('Close every active Key Result before closing the Objective', {
      keyResults: unfinished.map((kr) => ({ id: kr.id, title: kr.title, closureStatus: kr.closureStatus })),
    })
  }

  const body = await request.json().catch(() => null)
  const parsed = parseInitiateCloseInput(body, objective.progress)
  if (!parsed.ok) return apiBadRequest(parsed.error)

  const initialConfidence = firstConfidence(objective.keyResults.flatMap((kr) => kr.checkIns))
  const finalConfidence = objective.keyResults.some((kr) => kr.confidence === 'OFF_TRACK')
    ? 'OFF_TRACK'
    : objective.keyResults.some((kr) => kr.confidence === 'AT_RISK')
      ? 'AT_RISK'
      : objective.keyResults.length > 0
        ? 'ON_TRACK'
        : confidenceTierFromScore(objective.confidence)

  const result = await prisma.$transaction(async (tx) => {
    // Freeze the value shown to the user when they graded. Recalculation is still
    // required in this transaction for ancestor consistency, but a leaf Objective
    // with no active KRs must not lose its manually stored progress during close.
    const finalProgress = objective.progress
    await recalcNodeAndAncestors(tx, id)
    const current = await tx.objective.findUniqueOrThrow({ where: { id }, select: { goalStatus: true } })
    const updated = await tx.objective.update({
      where: { id },
      data: {
        closureStatus: 'CLOSING',
        outcome: parsed.data.outcome,
        finalGrade: parsed.data.finalGrade,
        finalProgress,
        gradeDelta: parsed.data.finalGrade == null ? null : parsed.data.finalGrade - finalProgress / 100,
        finalConfidence,
        initialConfidence,
        preCloseGoalStatus: current.goalStatus,
        closureNote: parsed.data.closureNote,
        isLocked: false,
        progress: finalProgress,
      },
      include: { timeframe: true, keyResults: true },
    })
    await tx.okrRetrospective.upsert({
      where: { objectiveId: id },
      create: {
        objectiveId: id,
        entityType: 'OBJECTIVE',
        whatWasAchieved: '',
        whatWeLearned: '',
        recommendedAction: '',
        autoStatsJson: {},
        authorId: session.user.id,
        gradeRationale: parsed.data.gradeRationale,
      },
      update: { gradeRationale: parsed.data.gradeRationale, authorId: session.user.id },
    })
    return updated
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'CLOSURE_INITIATED',
    actorId: session.user.id,
    metadata: { outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade },
  })
  return apiSuccess(result, { message: 'Objective closure started.' })
})
