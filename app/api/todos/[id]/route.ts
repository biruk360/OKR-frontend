import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const todoId = params.id
    const { title, description, status, dueDate, completedAt } = await request.json()

    // Check if todo exists
    const existingTodo = await prisma.todo.findUnique({
      where: { id: todoId },
      include: {
        keyResult: {
          include: {
            objective: {
              include: {
                owner: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        }
      }
    })

    if (!existingTodo) {
      return NextResponse.json(
        { error: 'To-do not found' },
        { status: 404 }
      )
    }

    // Check if user has access to update this todo
    const hasAccess = session.user.role === 'ADMIN' || 
                     session.user.id === existingTodo.assigneeId ||
                     session.user.id === existingTodo.creatorId ||
                     session.user.id === existingTodo.keyResult.ownerId ||
                     session.user.id === existingTodo.keyResult.objective.ownerId

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update this to-do' },
        { status: 403 }
      )
    }

    // Update the todo
    const updatedTodo = await prisma.todo.update({
      where: { id: todoId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null })
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
      message: 'To-do updated successfully',
      todo: updatedTodo
    })
  } catch (error) {
    console.error('Error updating todo:', error)
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

    const todoId = params.id

    // Check if todo exists
    const existingTodo = await prisma.todo.findUnique({
      where: { id: todoId },
      include: {
        keyResult: {
          include: {
            objective: {
              include: {
                owner: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        }
      }
    })

    if (!existingTodo) {
      return NextResponse.json(
        { error: 'To-do not found' },
        { status: 404 }
      )
    }

    // Check if user has access to delete this todo
    const hasAccess = session.user.role === 'ADMIN' || 
                     session.user.id === existingTodo.creatorId ||
                     session.user.id === existingTodo.keyResult.ownerId ||
                     session.user.id === existingTodo.keyResult.objective.ownerId

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete this to-do' },
        { status: 403 }
      )
    }

    // Delete the todo
    await prisma.todo.delete({
      where: { id: todoId }
    })

    return NextResponse.json({
      success: true,
      message: 'To-do deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting todo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






