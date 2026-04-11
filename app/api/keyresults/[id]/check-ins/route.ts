import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
} from '@/lib/permissions'
import { parseProgressInput } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'

const CONFIDENCE = new Set(['ON_TRACK', 'AT_RISK', 'OFF_TRACK'])

function krProgressPercent(currentValue: number, targetValue: number): number {
  if (targetValue <= 0) return 0
  return Math.min(Math.max((currentValue / targetValue) * 100, 0), 100)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid key result id' }, { status: 400 })
    }

    const keyResult = await prisma.keyResult.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        objectiveId: true,
        isPrivate: true,
      },
    })

    if (!keyResult) {
      return NextResponse.json({ error: 'Key result not found' }, { status: 404 })
    }

    const visibility = await canViewKeyResult(
      session.user.role as any,
      session.user.id,
      {
        ownerId: keyResult.ownerId,
        objectiveId: keyResult.objectiveId,
        isPrivate: keyResult.isPrivate,
      }
    )

    if (!visibility.canView) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const checkIns = await prisma.keyResultCheckIn.findMany({
      where: { keyResultId: id },
      orderBy: { asOfDate: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json({ success: true, checkIns })
  } catch (error) {
    console.error('Error listing check-ins:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid key result id' }, { status: 400 })
    }

    const body = await request.json()
    const { asOfDate, progress, confidence, analysis } = body

    if (!asOfDate || typeof asOfDate !== 'string') {
      return NextResponse.json({ error: 'Check-in date is required' }, { status: 400 })
    }

    const parsedDate = new Date(asOfDate)
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid check-in date' }, { status: 400 })
    }

    if (!confidence || typeof confidence !== 'string' || !CONFIDENCE.has(confidence)) {
      return NextResponse.json(
        { error: 'Confidence must be ON_TRACK, AT_RISK, or OFF_TRACK' },
        { status: 400 }
      )
    }

    const existingKeyResult = await prisma.keyResult.findUnique({
      where: { id },
      include: {
        objective: {
          select: {
            id: true,
            ownerId: true,
            level: true,
            departmentId: true,
          },
        },
      },
    })

    if (!existingKeyResult) {
      return NextResponse.json({ error: 'Key result not found' }, { status: 404 })
    }

    if (existingKeyResult.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Check-ins can only be recorded on active key results' },
        { status: 400 }
      )
    }

    const canEdit = await canEditKeyResultWithObjectiveContext(
      session.user.role as any,
      session.user.id,
      {
        ownerId: existingKeyResult.ownerId,
        objectiveId: existingKeyResult.objectiveId,
      },
      {
        level: existingKeyResult.objective.level,
        ownerId: existingKeyResult.objective.ownerId,
        departmentId: existingKeyResult.objective.departmentId,
      }
    )

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Insufficient permissions to check in on this key result' },
        { status: 403 }
      )
    }

    const progressParsed = parseProgressInput(progress, existingKeyResult.currentValue)
    if (!progressParsed.ok) {
      return NextResponse.json({ error: progressParsed.message }, { status: 400 })
    }

    const nextValue = Math.max(0, progressParsed.value)
    const nextKrProgress = krProgressPercent(nextValue, existingKeyResult.targetValue)

    const analysisStr =
      typeof analysis === 'string' ? analysis.trim().slice(0, 20000) : ''

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

    return NextResponse.json({
      success: true,
      message: 'Check-in saved.',
      checkIn: result.checkIn,
      keyResult: result.keyResult,
    })
  } catch (error) {
    console.error('Error creating check-in:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
