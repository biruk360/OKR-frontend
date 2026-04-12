import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, type UserRole } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'

export async function PATCH(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: todoId } = await resolveParams(params)
    if (!todoId) {
      return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 })
    }
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

    // Permission: creator/assignee can always edit their own todo. If the todo is
    // linked to a KR, KR/objective managers can also edit.
    const kr = existingTodo.keyResult
    let canManageKr = false
    if (kr) {
      canManageKr = await canEditKeyResultWithObjectiveContext(
        session.user.role as UserRole,
        session.user.id,
        { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
        {
          level: kr.objective.level,
          ownerId: kr.objective.ownerId,
          departmentId: kr.objective.departmentId,
        }
      )
    }
    const hasAccess =
      session.user.id === existingTodo.assigneeId ||
      session.user.id === existingTodo.creatorId ||
      canManageKr ||
      session.user.role === 'ADMIN'

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

    const initiativeChanges: Record<string, { from: unknown; to: unknown }> = {}
    if (title !== undefined && title !== existingTodo.title) initiativeChanges.title = { from: existingTodo.title, to: title }
    if (description !== undefined && description !== existingTodo.description) initiativeChanges.description = { from: existingTodo.description, to: description }
    if (status !== undefined && status !== existingTodo.status) initiativeChanges.status = { from: existingTodo.status, to: status }

    // Only record KR activity when the todo is actually linked to a KR. Standalone
    // todo changes don't belong in any KR's activity log.
    if (Object.keys(initiativeChanges).length > 0 && existingTodo.keyResult) {
      await recordActivity({
        entityType: 'KEY_RESULT',
        keyResultId: existingTodo.keyResultId,
        objectiveId: existingTodo.keyResult.objectiveId,
        action: 'INITIATIVE_UPDATED',
        actorId: session.user.id,
        changes: initiativeChanges,
        metadata: { initiativeId: todoId, title: updatedTodo.title },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Initiative updated successfully',
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
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: todoId } = await resolveParams(params)
    if (!todoId) {
      return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 })
    }

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

    const kr = existingTodo.keyResult
    let canManageKr = false
    if (kr) {
      canManageKr = await canEditKeyResultWithObjectiveContext(
        session.user.role as UserRole,
        session.user.id,
        { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
        {
          level: kr.objective.level,
          ownerId: kr.objective.ownerId,
          departmentId: kr.objective.departmentId,
        }
      )
    }
    const hasAccess =
      session.user.id === existingTodo.creatorId ||
      canManageKr ||
      session.user.role === 'ADMIN'

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete this to-do' },
        { status: 403 }
      )
    }

    // Delete the initiative
    await prisma.todo.delete({
      where: { id: todoId }
    })

    if (existingTodo.keyResult) {
      await recordActivity({
        entityType: 'KEY_RESULT',
        keyResultId: existingTodo.keyResultId,
        objectiveId: existingTodo.keyResult.objectiveId,
        action: 'INITIATIVE_REMOVED',
        actorId: session.user.id,
        metadata: { initiativeId: todoId, title: existingTodo.title },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Initiative deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting todo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






