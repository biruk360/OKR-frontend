import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
} from '@/lib/permissions'
import { parseProgressInput } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { computeKrConfidence } from '@/lib/confidence-calc'

const CONFIDENCE = new Set(['ON_TRACK', 'AT_RISK', 'OFF_TRACK'])

function tierToScore(t: string): number {
  if (t === 'ON_TRACK') return 85
  if (t === 'AT_RISK') return 55
  if (t === 'OFF_TRACK') return 25
  return 50
}
function scoreToTier(n: number): 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' {
  if (n >= 70) return 'ON_TRACK'
  if (n >= 40) return 'AT_RISK'
  return 'OFF_TRACK'
}

function krProgressPercent(currentValue: number, targetValue: number): number {
  if (targetValue <= 0) return 0
  return Math.min(Math.max((currentValue / targetValue) * 100, 0), 100)
}

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return apiNotFound('Key result not found')

  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, {
    ownerId: keyResult.ownerId,
    objectiveId: keyResult.objectiveId,
    isPrivate: keyResult.isPrivate,
  })
  if (!visibility.canView) return apiForbidden('Access denied')

  const checkIns = await prisma.keyResultCheckIn.findMany({
    where: { keyResultId: id },
    orderBy: { asOfDate: 'asc' },
    include: {
      createdBy: { select: { id: true, name: true, avatar: true } },
    },
  })

  return apiSuccess(checkIns)
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const body = await request.json()
  const { asOfDate, progress, confidence, confidenceScore, analysis } = body

  if (!asOfDate || typeof asOfDate !== 'string') {
    return apiBadRequest('Check-in date is required')
  }
  const parsedDate = new Date(asOfDate)
  if (Number.isNaN(parsedDate.getTime())) return apiBadRequest('Invalid check-in date')

  // Resolve user-supplied confidence to both numeric (confidenceScore) and enum tier.
  // Prefer explicit confidenceScore when both are provided.
  let userScore: number
  if (typeof confidenceScore === 'number') {
    if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
      return apiBadRequest('confidenceScore must be between 0 and 100')
    }
    userScore = Math.round(confidenceScore)
  } else if (typeof confidence === 'string' && CONFIDENCE.has(confidence)) {
    userScore = tierToScore(confidence)
  } else {
    return apiBadRequest('Provide confidenceScore (0-100) or confidence (ON_TRACK | AT_RISK | OFF_TRACK)')
  }
  void scoreToTier // re-exported pattern; tier mapping kept here for callers/tests

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      objective: {
        select: {
          id: true, ownerId: true, level: true, departmentId: true,
          startDate: true, endDate: true,
          timeframe: { select: { startDate: true, endDate: true } },
        },
      },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')
  if (existingKeyResult.status !== 'ACTIVE') {
    return apiBadRequest('Check-ins can only be recorded on active key results')
  }

  const canEdit = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    { ownerId: existingKeyResult.ownerId, objectiveId: existingKeyResult.objectiveId },
    {
      level: existingKeyResult.objective.level,
      ownerId: existingKeyResult.objective.ownerId,
      departmentId: existingKeyResult.objective.departmentId,
    }
  )

  if (!canEdit) return apiForbidden('Insufficient permissions to check in on this key result')

  const progressParsed = parseProgressInput(progress, existingKeyResult.currentValue)
  if (!progressParsed.ok) return apiBadRequest(progressParsed.message)

  const nextValue = Math.max(0, progressParsed.value)
  const nextKrProgress = krProgressPercent(nextValue, existingKeyResult.targetValue)
  const analysisStr = typeof analysis === 'string' ? analysis.trim().slice(0, 20000) : ''

  // Compute system confidence from time-elapsed vs progress (overrides user-supplied value).
  // We build a minimal KrForCalc shape using data already in memory; the check-in we're
  // about to create is included as the first entry so velocity calculations see it.
  const krForCalc = {
    ...existingKeyResult,
    currentValue: nextValue,
    progress: nextKrProgress,
    todos: [],
    checkIns: [{ asOfDate: parsedDate, value: nextValue }],
    _count: { checkIns: 0, todos: 0 },
    objective: {
      ...existingKeyResult.objective,
      title: '',
      timeframe: existingKeyResult.objective.timeframe ?? { startDate: new Date(), endDate: new Date() },
    },
  }
  const computed = computeKrConfidence(krForCalc as any)
  const autoConfidence = computed.confidence
  const periodStart = new Date().toISOString().slice(0, 10)

  const result = await prisma.$transaction(async (tx) => {
    const checkIn = await tx.keyResultCheckIn.create({
      data: {
        keyResultId: existingKeyResult.id,
        asOfDate: parsedDate,
        value: nextValue,
        confidence: autoConfidence,
        confidenceScore: userScore,
        analysis: analysisStr || null,
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    const updatedKr = await tx.keyResult.update({
      where: { id: existingKeyResult.id },
      data: {
        currentValue: nextValue,
        confidence: autoConfidence,
        progress: nextKrProgress,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    return { checkIn, keyResult: updatedKr }
  })

  // Persist confidence snapshot for timeline tracking.
  await prisma.confidenceSnapshot.upsert({
    where: { entityType_entityId_periodStart: { entityType: 'KEY_RESULT', entityId: existingKeyResult.id, periodStart } },
    create: {
      entityType: 'KEY_RESULT', entityId: existingKeyResult.id, periodStart,
      confidence: autoConfidence, score: computed.score,
      factors: JSON.stringify({ ...computed.factors, source: 'check-in' }),
      previousConf: existingKeyResult.confidence,
    },
    update: {
      confidence: autoConfidence, score: computed.score,
      factors: JSON.stringify({ ...computed.factors, source: 'check-in' }),
    },
  })

  // Roll up objective goalStatus = worst-of active KR confidences.
  const siblingConfs = await prisma.keyResult.findMany({
    where: { objectiveId: existingKeyResult.objectiveId, status: 'ACTIVE' },
    select: { confidence: true },
  })
  const worstConf = siblingConfs.some(k => k.confidence === 'OFF_TRACK')
    ? 'OFF_TRACK'
    : siblingConfs.some(k => k.confidence === 'AT_RISK')
    ? 'AT_RISK'
    : 'ON_TRACK'
  await prisma.objective.update({
    where: { id: existingKeyResult.objectiveId },
    data: { goalStatus: worstConf },
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: existingKeyResult.id,
    objectiveId: existingKeyResult.objectiveId,
    action: 'CHECKIN',
    actorId: session.user.id,
    changes: {
      currentValue: { from: existingKeyResult.currentValue, to: nextValue },
      confidence: { from: existingKeyResult.confidence, to: autoConfidence },
      progress: { from: existingKeyResult.progress, to: nextKrProgress },
    },
    metadata: { asOfDate: parsedDate.toISOString(), analysis: analysisStr || null },
  })

  // Fire: KR_PROGRESS_UPDATED, plus KR_AT_RISK/KR_COMPLETED on transition.
  const emitBase = {
    actorId: session.user.id,
    entityType: 'KEY_RESULT' as const,
    entityId: existingKeyResult.id,
    entityTitle: existingKeyResult.title,
    isPrivate: existingKeyResult.isPrivate,
    data: {
      actorName: session.user.name,
      objectiveId: existingKeyResult.objectiveId,
      progress: Math.round(nextKrProgress),
      deepLink: `/dashboard/objectives/${existingKeyResult.objectiveId}`,
    },
  }
  await emit('KR_PROGRESS_UPDATED', emitBase)
  if (autoConfidence !== 'ON_TRACK' && existingKeyResult.confidence === 'ON_TRACK') {
    await emit('KR_AT_RISK', emitBase)
  }
  if (nextKrProgress >= 100 && existingKeyResult.progress < 100) {
    await emit('KR_COMPLETED', emitBase)
  }

  return apiSuccess(result, { status: 201, message: 'Check-in saved.' })
})
