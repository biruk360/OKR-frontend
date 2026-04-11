import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'

export async function POST(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: keyResultId } = await resolveParams(params)
    if (!keyResultId) {
      return NextResponse.json({ error: 'Invalid key result id' }, { status: 400 })
    }

    // Check if key result exists
    const existingKeyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        objective: {
          select: {
            id: true,
            ownerId: true,
            title: true,
            level: true,
            departmentId: true,
          },
        },
      }
    })

    if (!existingKeyResult) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
      )
    }

    // Check if already active
    if (existingKeyResult.status !== 'ARCHIVED') {
      return NextResponse.json(
        { error: 'Key result is not archived' },
        { status: 400 }
      )
    }

    const canUnarchive = await canEditKeyResultWithObjectiveContext(
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

    if (!canUnarchive) {
      return NextResponse.json(
        { error: 'Insufficient permissions to restore this key result' },
        { status: 403 }
      )
    }

    // Start a transaction to handle unarchiving and progress recalculation
    const result = await prisma.$transaction(async (tx) => {
      // Restore the key result
      const restoredKeyResult = await tx.keyResult.update({
        where: { id: keyResultId },
        data: { 
          status: 'ACTIVE',
          archivedAt: null
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          },
          objective: {
            select: { id: true, title: true }
          }
        }
      })

      await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)

      const updatedObj = await tx.objective.findUnique({
        where: { id: existingKeyResult.objectiveId },
        select: { progress: true },
      })
      const newProgress = updatedObj?.progress ?? 0

      return {
        restoredKeyResult,
        newObjectiveProgress: newProgress,
      }
    })

    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: existingKeyResult.objectiveId,
      action: 'UNARCHIVED',
      actorId: session.user.id,
    })

    return NextResponse.json({
      success: true,
      data: result.restoredKeyResult,
      message: 'Key Result restored.',
      newObjectiveProgress: result.newObjectiveProgress
    })
  } catch (error) {
    console.error('Error restoring key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






