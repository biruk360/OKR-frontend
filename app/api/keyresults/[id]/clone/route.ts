import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'

export async function POST(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user can clone key results (objective owner or admin)
    if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to clone key results' },
        { status: 403 }
      )
    }

    const { id: keyResultId } = await resolveParams(params)
    if (!keyResultId) {
      return NextResponse.json({ error: 'Invalid key result id' }, { status: 400 })
    }
    const { title, description, ownerId, startValue, targetValue, unit, objectiveId } = await request.json()

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

    // Check if original key result exists
    const originalKeyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        objective: {
          include: {
            owner: {
              select: { id: true, name: true }
            }
          }
        },
        owner: {
          select: { id: true, name: true }
        }
      }
    })

    if (!originalKeyResult) {
      return NextResponse.json(
        { error: 'Original key result not found' },
        { status: 404 }
      )
    }

    // Check permissions - only objective owner or admin can clone
    const canClone = session.user.role === 'ADMIN' || 
                     session.user.id === originalKeyResult.objective.ownerId

    if (!canClone) {
      return NextResponse.json(
        { error: 'Insufficient permissions to clone this key result' },
        { status: 403 }
      )
    }

    // Validate objective exists
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId }
    })

    if (!objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
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

    // Check if key result with same title already exists in the objective
    const existingKeyResult = await prisma.keyResult.findFirst({
      where: {
        title,
        objectiveId,
        status: 'ACTIVE'
      }
    })

    if (existingKeyResult) {
      return NextResponse.json(
        { error: 'A key result with this title already exists in this objective' },
        { status: 400 }
      )
    }

    // Create the cloned key result and recalculate objective progress
    const result = await prisma.$transaction(async (tx) => {
      // Create the new key result
      const clonedKeyResult = await tx.keyResult.create({
        data: {
          title,
          description: description || '',
          ownerId,
          startValue: bounds.start,
          targetValue: bounds.target,
          currentValue: bounds.start,
          unit: unit || '%',
          objectiveId,
          status: 'ACTIVE'
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        }
      })

      await recalcNodeAndAncestors(tx, objectiveId)

      return clonedKeyResult
    })

    return NextResponse.json({
      success: true,
      message: 'Key Result cloned successfully.',
      keyResult: result
    })
  } catch (error) {
    console.error('Error cloning key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






