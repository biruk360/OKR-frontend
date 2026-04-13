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
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

const CONFIDENCE = new Set(['ON_TRACK', 'AT_RISK', 'OFF_TRACK'])

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
  const { asOfDate, progress, confidence, analysis } = body

  if (!asOfDate || typeof asOfDate !== 'string') {
    return apiBadRequest('Check-in date is required')
  }
  const parsedDate = new Date(asOfDate)
  if (Number.isNaN(parsedDate.getTime())) return apiBadRequest('Invalid check-in date')

  if (!confidence || typeof confidence !== 'string' || !CONFIDENCE.has(confidence)) {
    return apiBadRequest('Confidence must be ON_TRACK, AT_RISK, or OFF_TRACK')
  }

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      objective: { select: { id: true, ownerId: true, level: true, departmentId: true } },
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

  const result = await prisma.$transaction(async (tx) => {
    const checkIn = await tx.keyResultCheckIn.create({
      data: {
        keyResultId: existingKeyResult.id,
        asOfDate: parsedDate,
        value: nextValue,
        confidence,
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
        confidence,
        progress: nextKrProgress,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    return { checkIn, keyResult: updatedKr }
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: existingKeyResult.id,
    objectiveId: existingKeyResult.objectiveId,
    action: 'CHECKIN',
    actorId: session.user.id,
    changes: {
      currentValue: { from: existingKeyResult.currentValue, to: nextValue },
      confidence: { from: existingKeyResult.confidence, to: confidence },
      progress: { from: existingKeyResult.progress, to: nextKrProgress },
    },
    metadata: { asOfDate: parsedDate.toISOString(), analysis: analysisStr || null },
  })

  return apiSuccess(result, { status: 201, message: 'Check-in saved.' })
})
