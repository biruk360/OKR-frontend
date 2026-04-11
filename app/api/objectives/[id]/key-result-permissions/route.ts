import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canViewObjective,
  canCreateKeyResultForObjective,
  canEditKeyResultWithObjectiveContext,
  canDeleteKeyResult,
} from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export async function GET(
  _request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
    }

    const objective = await prisma.objective.findUnique({
      where: { id },
      select: {
        id: true,
        level: true,
        ownerId: true,
        departmentId: true,
        isPrivate: true,
        keyResults: {
          select: { id: true, ownerId: true, objectiveId: true },
        },
      },
    })

    if (!objective) {
      return NextResponse.json({ error: 'Objective not found' }, { status: 404 })
    }

    const visibility = await canViewObjective(
      session.user.role as any,
      session.user.id,
      {
        level: objective.level,
        ownerId: objective.ownerId,
        departmentId: objective.departmentId,
        isPrivate: objective.isPrivate || false,
      }
    )

    if (!visibility.canView) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const role = session.user.role as any
    const userId = session.user.id

    const canCreate = await canCreateKeyResultForObjective(role, userId, {
      id: objective.id,
      level: objective.level,
      ownerId: objective.ownerId,
      departmentId: objective.departmentId,
    })

    const canEditByKeyResultId: Record<string, boolean> = {}
    for (const kr of objective.keyResults) {
      canEditByKeyResultId[kr.id] = await canEditKeyResultWithObjectiveContext(
        role,
        userId,
        { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
        {
          level: objective.level,
          ownerId: objective.ownerId,
          departmentId: objective.departmentId,
        }
      )
    }

    const canDelete = canDeleteKeyResult(role, userId, objective.ownerId)
    const canCloneKeyResults =
      role === 'ADMIN' || userId === objective.ownerId

    return NextResponse.json({
      success: true,
      canCreate,
      canEditByKeyResultId,
      canDeleteKeyResults: canDelete,
      canCloneKeyResults,
    })
  } catch (error) {
    console.error('Error resolving key result permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
