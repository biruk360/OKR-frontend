import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  redactKeyResult,
} from '@/lib/permissions'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity, recordUpdateIfChanged } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'

export async function GET(
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

    const keyResult = await prisma.keyResult.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        objective: {
          select: {
            id: true,
            title: true,
            level: true,
            ownerId: true,
            departmentId: true,
            isPrivate: true
          }
        },
        todos: {
          include: {
            assignee: {
              select: { id: true, name: true, avatar: true }
            }
          }
        }
      }
    })

    if (!keyResult) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
      )
    }

    // Check visibility permissions
    const visibility = await canViewKeyResult(
      session.user.role as any,
      session.user.id,
      {
        ownerId: keyResult.ownerId,
        objectiveId: keyResult.objectiveId,
        isPrivate: keyResult.isPrivate
      }
    )

    if (!visibility.canView) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Apply redaction if needed
    let processedKeyResult = keyResult
    if (visibility.isRedacted) {
      processedKeyResult = redactKeyResult(keyResult) as any
    }

    return NextResponse.json({
      success: true,
      data: processedKeyResult
    })
  } catch (error) {
    console.error('Error fetching key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
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
    const { title, description, ownerId, startValue, targetValue, unit, isPrivate, checkInCadence: rawCadence } = await request.json()
    const cadencePatch = rawCadence !== undefined ? { checkInCadence: normalizeCadence(rawCadence) } : null

    if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '') {
      return NextResponse.json(
        { error: 'Title, owner, and target value are required' },
        { status: 400 }
      )
    }

    const bounds = parseStartAndTarget(startValue, targetValue)
    if (!bounds.ok) {
      return NextResponse.json({ error: bounds.message }, { status: 400 })
    }

    // Check if key result exists and user has permission
    const existingKeyResult = await prisma.keyResult.findUnique({
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

    if (!existingKeyResult) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
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
        { error: 'Insufficient permissions to edit this key result' },
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

    // Update the key result and recalculate objective progress
    const result = await prisma.$transaction(async (tx) => {
      // Update the key result
      const updatedKeyResult = await tx.keyResult.update({
        where: { id: keyResultId },
        data: {
          title,
          description: description || '',
          ownerId,
          startValue: bounds.start,
          targetValue: bounds.target,
          unit: unit || '%',
          ...(isPrivate !== undefined && { isPrivate }),
          ...(cadencePatch && cadencePatch),
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        }
      })

      await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)

      return updatedKeyResult
    })

    await recordUpdateIfChanged(
      'KEY_RESULT',
      { keyResultId, objectiveId: existingKeyResult.objectiveId },
      existingKeyResult as unknown as Record<string, unknown>,
      result as unknown as Record<string, unknown>,
      session.user.id,
    )

    return NextResponse.json({
      success: true,
      message: 'Key Result updated successfully.',
      keyResult: result
    })
  } catch (error) {
    console.error('Error updating key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Check if key result exists and user has permission
    const existingKeyResult = await prisma.keyResult.findUnique({
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

    if (!existingKeyResult) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
      )
    }

    // Check permissions - only objective owner or admin can delete
    // Key result owners cannot delete - only objective owners and admins
    const canDelete = session.user.role === 'ADMIN' || 
                     session.user.id === existingKeyResult.objective.ownerId

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Only objective owners and system administrators can delete key results' },
        { status: 403 }
      )
    }

    // Permanently delete the key result and recalculate objective progress
    const result = await prisma.$transaction(async (tx) => {
      // Permanently delete the key result (this cascades to initiatives, comments, check-ins, views)
      await tx.keyResult.delete({
        where: { id: keyResultId }
      })

      await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)

      const remainingKeyResults = await tx.keyResult.count({
        where: {
          objectiveId: existingKeyResult.objectiveId,
          status: 'ACTIVE',
        },
      })

      return {
        deletedKeyResult: existingKeyResult,
        remainingKeyResults,
      }
    })

    await recordActivity({
      entityType: 'KEY_RESULT',
      objectiveId: existingKeyResult.objectiveId,
      action: 'DELETED',
      actorId: session.user.id,
      metadata: { keyResultId, title: existingKeyResult.title },
    })

    return NextResponse.json({
      success: true,
      message: 'Key Result deleted successfully.',
      remainingKeyResults: result.remainingKeyResults
    })
  } catch (error) {
    console.error('Error deleting key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
