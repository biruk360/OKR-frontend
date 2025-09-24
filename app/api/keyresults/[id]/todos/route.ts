import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResultId = params.id

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

    // Check if user has access to this key result
    const hasAccess = session.user.role === 'ADMIN' || 
                     session.user.id === keyResult.ownerId ||
                     session.user.id === keyResult.objective.ownerId

    if (!hasAccess) {
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyResultId = params.id
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

    // Check if user has access to add todos to this key result
    const hasAccess = session.user.role === 'ADMIN' || 
                     session.user.id === keyResult.ownerId ||
                     session.user.id === keyResult.objective.ownerId

    if (!hasAccess) {
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

    return NextResponse.json({
      success: true,
      message: 'To-do created successfully',
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






