import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'

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

    // Check if already archived
    if (existingKeyResult.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'Key result is already archived' },
        { status: 400 }
      )
    }

    const canArchive = await canEditKeyResultWithObjectiveContext(
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

    if (!canArchive) {
      return NextResponse.json(
        { error: 'Insufficient permissions to archive this key result' },
        { status: 403 }
      )
    }

    // Start a transaction to handle archiving and progress recalculation
    const result = await prisma.$transaction(async (tx) => {
      // Archive the key result
      const archivedKeyResult = await tx.keyResult.update({
        where: { id: keyResultId },
        data: { 
          status: 'ARCHIVED',
          archivedAt: new Date()
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

      // Recalculate objective progress based on remaining active key results
      const activeKeyResults = await tx.keyResult.findMany({
        where: {
          objectiveId: existingKeyResult.objectiveId,
          status: 'ACTIVE'
        }
      })

      const newProgress = activeKeyResults.length > 0
        ? activeKeyResults.reduce((sum, kr) => sum + kr.progress, 0) / activeKeyResults.length
        : 0

      // Update objective progress
      await tx.objective.update({
        where: { id: existingKeyResult.objectiveId },
        data: { progress: newProgress }
      })

      return {
        archivedKeyResult,
        newObjectiveProgress: newProgress
      }
    })

    return NextResponse.json({
      success: true,
      data: result.archivedKeyResult,
      message: 'Key Result archived.',
      newObjectiveProgress: result.newObjectiveProgress
    })
  } catch (error) {
    console.error('Error archiving key result:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






