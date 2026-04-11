import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canCreateKeyResultForObjective } from '@/lib/permissions'
import { parseCurrentValue, parseStartAndTarget } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title, description, ownerId, startValue, targetValue, unit, objectiveId, currentValue, isPrivate, checkInCadence: rawCadence } = await request.json()
    const checkInCadence = normalizeCadence(rawCadence)

    // Validate required fields
    if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '' || !objectiveId) {
      return NextResponse.json(
        { error: 'Title, owner, target value, and objective are required' },
        { status: 400 }
      )
    }

    const bounds = parseStartAndTarget(startValue, targetValue)
    if (!bounds.ok) {
      return NextResponse.json({ error: bounds.message }, { status: 400 })
    }

    const currentParsed = parseCurrentValue(currentValue, bounds.start)
    if (!currentParsed.ok) {
      return NextResponse.json({ error: currentParsed.message }, { status: 400 })
    }

    // Check if objective exists and user has permission
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        owner: {
          select: { id: true, name: true }
        }
      }
    })

    if (!objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    const allowed = await canCreateKeyResultForObjective(
      session.user.role as any,
      session.user.id,
      {
        id: objective.id,
        level: objective.level,
        ownerId: objective.ownerId,
        departmentId: objective.departmentId
      }
    )

    if (!allowed) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add key results to this objective' },
        { status: 403 }
      )
    }

    // Validate owner exists
    const owner = await prisma.user.findUnique({
      where: { id: ownerId }
    })

    if (!owner) {
      return NextResponse.json(
        { error: 'Invalid owner' },
        { status: 400 }
      )
    }

    // Create the key result and recalculate objective progress
    const result = await prisma.$transaction(async (tx) => {
      // Create the key result
      const keyResult = await tx.keyResult.create({
        data: {
          title,
          description: description || '',
          ownerId,
          startValue: bounds.start,
          targetValue: bounds.target,
          currentValue: currentParsed.current,
          unit: unit || '%',
          objectiveId,
          status: 'ACTIVE',
          isPrivate: isPrivate ?? false, // Default to public if not specified
          checkInCadence,
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        }
      })

      await recalcNodeAndAncestors(tx, objectiveId)

      return keyResult
    })

    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId: result.id,
      objectiveId,
      action: 'CREATED',
      actorId: session.user.id,
      metadata: { title: result.title },
    })

    return NextResponse.json({
      success: true,
      message: 'Key Result added successfully.',
      keyResult: result
    })
  } catch (error) {
    console.error('Error adding key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






