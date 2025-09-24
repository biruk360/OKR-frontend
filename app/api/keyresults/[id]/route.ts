import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    const { title, description, ownerId, startValue, targetValue, unit } = await request.json()

    // Validate required fields
    if (!title || !ownerId || !targetValue) {
      return NextResponse.json(
        { error: 'Title, owner, and target value are required' },
        { status: 400 }
      )
    }

    // Validate target value is greater than start value
    if (startValue >= targetValue) {
      return NextResponse.json(
        { error: 'Target Value must be greater than Start Value.' },
        { status: 400 }
      )
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

    // Check permissions - key result owner, objective owner, or admin can edit
    const canEdit = session.user.role === 'ADMIN' || 
                   session.user.id === existingKeyResult.ownerId ||
                   session.user.id === existingKeyResult.objective.ownerId

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
          startValue: startValue || 0,
          targetValue,
          unit: unit || '%'
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
