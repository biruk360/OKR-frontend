import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResultId = params.id

    // Check if key result exists
    const existingKeyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        objective: {
          select: { id: true, ownerId: true, title: true }
        }
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

    // Check permissions - owner, objective owner, or admin can unarchive
    const canUnarchive = session.user.role === 'ADMIN' || 
                        session.user.id === existingKeyResult.ownerId ||
                        session.user.id === existingKeyResult.objective.ownerId

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

      // Recalculate objective progress including the restored key result
      const allActiveKeyResults = await tx.keyResult.findMany({
        where: {
          objectiveId: existingKeyResult.objectiveId,
          status: 'ACTIVE'
        }
      })

      const newProgress = allActiveKeyResults.length > 0
        ? allActiveKeyResults.reduce((sum, kr) => sum + kr.progress, 0) / allActiveKeyResults.length
        : 0

      // Update objective progress
      await tx.objective.update({
        where: { id: existingKeyResult.objectiveId },
        data: { progress: newProgress }
      })

      return {
        restoredKeyResult,
        newObjectiveProgress: newProgress
      }
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






