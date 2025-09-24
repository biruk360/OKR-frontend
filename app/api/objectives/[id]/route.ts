import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UpdateObjectiveForm } from '@/types'

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

    // Check permissions
    if (session.user.role === 'EMPLOYEE' && objective.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: objective
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
    const { title, description, ownerId, parentObjectiveId } = body

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

    // Check permissions
    const canEdit = 
      session.user.role === 'ADMIN' ||
      existingObjective.ownerId === session.user.id ||
      (session.user.role === 'EXECUTIVE' && existingObjective.level === 'COMPANY') ||
      (session.user.role === 'DEPARTMENT_LEAD' && existingObjective.level === 'DEPARTMENT')

    if (!canEdit) {
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

    // Only admins can delete objectives
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete objectives' },
        { status: 403 }
      )
    }

    const objective = await prisma.objective.findUnique({
      where: { id: params.id },
      include: {
        keyResults: true,
        childObjectives: true
      }
    })

    if (!objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    // Check if objective has child objectives
    if (objective.childObjectives.length > 0) {
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
