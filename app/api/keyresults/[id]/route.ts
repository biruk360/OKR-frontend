import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  redactKeyResult,
} from '@/lib/permissions'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResult = await prisma.keyResult.findUnique({
      where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResultId = params.id
    const { title, description, ownerId, startValue, targetValue, unit, isPrivate } = await request.json()

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
          ...(isPrivate !== undefined && { isPrivate })
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        }
      })

      // Recalculate objective progress
      const allKeyResults = await tx.keyResult.findMany({
        where: {
          objectiveId: existingKeyResult.objectiveId,
          status: 'ACTIVE'
        }
      })

      // Calculate average progress of all active key results
      const totalProgress = allKeyResults.reduce((sum, kr) => {
        const progress = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0
        return sum + Math.min(progress, 100) // Cap at 100%
      }, 0)

      const averageProgress = allKeyResults.length > 0 ? totalProgress / allKeyResults.length : 0

      // Update objective progress
      await tx.objective.update({
        where: { id: existingKeyResult.objectiveId },
        data: { progress: Math.round(averageProgress) }
      })

      return updatedKeyResult
    })

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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResultId = params.id

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
      // Permanently delete the key result (this will cascade delete to-dos/initiatives if they exist)
      await tx.keyResult.delete({
        where: { id: keyResultId }
      })

      // Recalculate objective progress
      const remainingKeyResults = await tx.keyResult.findMany({
        where: {
          objectiveId: existingKeyResult.objectiveId,
          status: 'ACTIVE'
        }
      })

      // Calculate average progress of remaining active key results
      const totalProgress = remainingKeyResults.reduce((sum, kr) => {
        const progress = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0
        return sum + Math.min(progress, 100) // Cap at 100%
      }, 0)

      const averageProgress = remainingKeyResults.length > 0 ? totalProgress / remainingKeyResults.length : 0

      // Update objective progress
      await tx.objective.update({
        where: { id: existingKeyResult.objectiveId },
        data: { progress: Math.round(averageProgress) }
      })

      return {
        deletedKeyResult: existingKeyResult,
        remainingKeyResults: remainingKeyResults.length
      }
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
