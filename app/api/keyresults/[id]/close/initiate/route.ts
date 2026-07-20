import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  canCloseBeforePeriodEnd,
  firstConfidence,
  isTimeframeEnded,
  parseInitiateCloseInput,
} from '@/lib/okr/period-close'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      objective: {
        select: {
          id: true,
          ownerId: true,
          level: true,
          departmentId: true,
          isLocked: true,
          timeframe: { select: { endDate: true } },
        },
      },
      checkIns: { select: { confidence: true, asOfDate: true }, orderBy: { asOfDate: 'asc' } },
    },
  })
  if (!keyResult) return apiNotFound('Key result not found')
  if (keyResult.objective.isLocked) return apiConflict('Reopen the parent Objective before closing this Key Result')
  if (keyResult.closureStatus !== 'OPEN') return apiConflict('Only an open Key Result can begin closing')

  const allowed = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    keyResult,
    keyResult.objective,
  )
  if (!allowed) return apiForbidden('Insufficient permissions to close this Key Result')
  if (!isTimeframeEnded(keyResult.objective.timeframe.endDate) && !canCloseBeforePeriodEnd(session.user.role)) {
    return apiForbidden('Only an administrator or executive can close an OKR before its timeframe ends')
  }

  const body = await request.json().catch(() => null)
  const parsed = parseInitiateCloseInput(body, keyResult.progress)
  if (!parsed.ok) return apiBadRequest(parsed.error)

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.keyResult.update({
      where: { id },
      data: {
        closureStatus: 'CLOSING',
        outcome: parsed.data.outcome,
        finalGrade: parsed.data.finalGrade,
        finalValue: keyResult.currentValue,
        finalProgress: keyResult.progress,
        gradeDelta: parsed.data.finalGrade == null ? null : parsed.data.finalGrade - keyResult.progress / 100,
        finalConfidence: keyResult.confidence,
        initialConfidence: firstConfidence(keyResult.checkIns),
        preCloseConfidence: keyResult.confidence,
        closureNote: parsed.data.closureNote,
        isLocked: false,
      },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
    })
    await tx.okrRetrospective.upsert({
      where: { keyResultId: id },
      create: {
        keyResultId: id,
        entityType: 'KEY_RESULT',
        whatWasAchieved: '',
        whatWeLearned: '',
        recommendedAction: '',
        autoStatsJson: {},
        authorId: session.user.id,
        gradeRationale: parsed.data.gradeRationale,
      },
      update: { gradeRationale: parsed.data.gradeRationale, authorId: session.user.id },
    })
    await recalcNodeAndAncestors(tx, keyResult.objectiveId)
    return updated
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: id,
    objectiveId: keyResult.objectiveId,
    action: 'CLOSURE_INITIATED',
    actorId: session.user.id,
    metadata: { outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade },
  })
  return apiSuccess(result, { message: 'Key Result closure started.' })
})
