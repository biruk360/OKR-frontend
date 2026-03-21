import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UpdateObjectiveForm } from '@/types'
import { canViewObjective, canEditObjective, canViewKeyResult, redactObjective, redactKeyResult } from '@/lib/permissions'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const objective = await prisma.objective.findUnique({
      where: { id: params.id },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        parentObjective: {
          select: { id: true, title: true }
        },
        childObjectives: {
          include: {
            owner: {
              select: { id: true, name: true, avatar: true }
            },
            _count: {
              select: { keyResults: true }
            }
          }
        },
        keyResults: {
          include: {
            owner: {
              select: { id: true, name: true, avatar: true }
            },
            todos: {
              include: {
                assignee: {
                  select: { id: true, name: true, avatar: true }
                }
              }
            },
            _count: {
              select: { todos: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, avatar: true }
            },
            replies: {
              include: {
                author: {
                  select: { id: true, name: true, avatar: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    // Check visibility permissions
    const visibility = await canViewObjective(
      session.user.role as any,
      session.user.id,
      {
        level: objective.level,
        ownerId: objective.ownerId,
        departmentId: objective.departmentId,
        isPrivate: objective.isPrivate
      }
    )

    if (!visibility.canView) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Apply redaction if needed
    let processedObjective = objective
    if (visibility.isRedacted) {
      processedObjective = redactObjective(objective) as any
      
      // Also redact key results if objective is redacted
      if (processedObjective.keyResults) {
        processedObjective.keyResults = processedObjective.keyResults.map((kr: any) => ({
          ...kr,
          title: '[Private Key Result]',
          description: null,
          startValue: 0,
          targetValue: 0,
          currentValue: 0,
          unit: '',
          // Keep progress percentage
          progress: kr.progress
        }))
      }
    } else {
      // Even if objective is not redacted, check individual key results
      if (processedObjective.keyResults) {
        processedObjective.keyResults = await Promise.all(
          processedObjective.keyResults.map(async (kr: any) => {
            const krVisibility = await canViewKeyResult(
              session.user.role as any,
              session.user.id,
              {
                ownerId: kr.ownerId,
                objectiveId: kr.objectiveId,
                isPrivate: kr.isPrivate
              }
            )
            if (krVisibility.isRedacted) {
              return redactKeyResult(kr)
            }
            return kr
          })
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: processedObjective
    })
  } catch (error) {
    console.error('Error fetching objective:', error)
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

    const body: UpdateObjectiveForm = await request.json()
    const { title, description, ownerId, parentObjectiveId, isPrivate } = body

    // Get existing objective
    const existingObjective = await prisma.objective.findUnique({
      where: { id: params.id }
    })

    if (!existingObjective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    // Check permissions using permission utility
    const hasEditPermission = await canEditObjective(
      session.user.role as any,
      session.user.id,
      {
        level: existingObjective.level,
        ownerId: existingObjective.ownerId,
        departmentId: existingObjective.departmentId
      }
    )

    if (!hasEditPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to edit this objective' },
        { status: 403 }
      )
    }

    // Validate owner if provided
    if (ownerId && ownerId !== existingObjective.ownerId) {
      const newOwner = await prisma.user.findUnique({
        where: { id: ownerId }
      })

      if (!newOwner) {
        return NextResponse.json(
          { error: 'Invalid owner' },
          { status: 400 }
        )
      }
    }

    // Validate parent objective if provided
    if (parentObjectiveId && parentObjectiveId !== existingObjective.parentObjectiveId) {
      if (parentObjectiveId) {
        const parentObjective = await prisma.objective.findUnique({
          where: { id: parentObjectiveId }
        })

        if (!parentObjective) {
          return NextResponse.json(
            { error: 'Invalid parent objective' },
            { status: 400 }
          )
        }
      }
    }

    // Update objective
    const updatedObjective = await prisma.objective.update({
      where: { id: params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(ownerId && { ownerId }),
        ...(parentObjectiveId !== undefined && { parentObjectiveId }),
        ...(isPrivate !== undefined && { isPrivate }),
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        parentObjective: {
          select: { id: true, title: true }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedObjective,
      message: 'Objective updated successfully'
    })
  } catch (error) {
    console.error('Error updating objective:', error)
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

    // Get existing objective first to check permissions
    const existingObjective = await prisma.objective.findUnique({
      where: { id: params.id }
    })

    if (!existingObjective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    // Check permissions - ADMIN/EXECUTIVE can delete any, others can only delete their own
    const canDelete = 
      session.user.role === 'ADMIN' ||
      session.user.role === 'EXECUTIVE' ||
      existingObjective.ownerId === session.user.id

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete this objective' },
        { status: 403 }
      )
    }

    const childCount = await prisma.objective.count({
      where: { parentObjectiveId: params.id },
    })

    if (childCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete objective with child objectives. Please unlink them first.' },
        { status: 400 }
      )
    }

    // Delete objective (this will cascade delete key results and todos)
    await prisma.objective.delete({
      where: { id: params.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Objective deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting objective:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
