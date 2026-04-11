import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  type UserRole,
} from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'

export async function GET(
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

    // Check if key result exists and user has access
    const keyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        objective: {
          include: {
            owner: {
              select: { id: true, name: true }
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

    const view = await canViewKeyResult(
      session.user.role as UserRole,
      session.user.id,
      {
        ownerId: keyResult.ownerId,
        objectiveId: keyResult.objectiveId,
        isPrivate: keyResult.isPrivate,
      }
    )

    if (!view.canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view this key result' },
        { status: 403 }
      )
    }

    // Fetch todos for this key result
    const todos = await prisma.todo.findMany({
      where: { keyResultId },
      include: {
        assignee: {
          select: { id: true, name: true, avatar: true }
        },
        creator: {
          select: { id: true, name: true, avatar: true }
        }
      },
      orderBy: [
        { status: 'asc' }, // PENDING first, then COMPLETED
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({ todos })
  } catch (error) {
    console.error('Error fetching todos:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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
    const { title, description, assigneeId, creatorId } = await request.json()

    // Validate required fields
    if (!title || !assigneeId || !creatorId) {
      return NextResponse.json(
        { error: 'Title, assignee, and creator are required' },
        { status: 400 }
      )
    }

    // Check if key result exists and user has access
    const keyResult = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        objective: {
          include: {
            owner: {
              select: { id: true, name: true }
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

    const canAdd = await canEditKeyResultWithObjectiveContext(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: keyResult.ownerId, objectiveId: keyResult.objectiveId },
      {
        level: keyResult.objective.level,
        ownerId: keyResult.objective.ownerId,
        departmentId: keyResult.objective.departmentId,
      }
    )

    if (!canAdd) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add todos to this key result' },
        { status: 403 }
      )
    }

    // Validate assignee exists
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId }
    })

    if (!assignee) {
      return NextResponse.json(
        { error: 'Invalid assignee' },
        { status: 400 }
      )
    }

    // Create the todo
    const todo = await prisma.todo.create({
      data: {
        title,
        description: description || '',
        assigneeId,
        creatorId,
        keyResultId,
        status: 'PENDING'
      },
      include: {
        assignee: {
          select: { id: true, name: true, avatar: true }
        },
        creator: {
          select: { id: true, name: true, avatar: true }
        }
      }
    })

    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: keyResult.objectiveId,
      action: 'INITIATIVE_ADDED',
      actorId: session.user.id,
      metadata: { initiativeId: todo.id, title: todo.title, assigneeId },
    })

    return NextResponse.json({
      success: true,
      message: 'Initiative created successfully',
      todo
    })
  } catch (error) {
    console.error('Error creating todo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






