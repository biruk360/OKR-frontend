import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UpdateObjectiveForm } from '@/types'
import { canViewObjective, canEditObjective, canViewKeyResult, redactObjective, redactKeyResult } from '@/lib/permissions'
import { recalcNodeAndAncestors, wouldCreateAlignmentCycle } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity, recordUpdateIfChanged } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'

export async function GET(
  request: NextRequest,
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
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        parentObjective: {
          select: { id: true, title: true, goalStatus: true, progress: true }
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

    const body = (await request.json()) as UpdateObjectiveForm & { checkInCadence?: string }
    const {
      title,
      description,
      ownerId,
      parentObjectiveId,
      isPrivate,
      alignmentType: rawAlign,
      rollupCalculation: rawRollup,
      checkInCadence: rawCadence,
    } = body
    const cadencePatch = rawCadence !== undefined ? { checkInCadence: normalizeCadence(rawCadence) } : null

    // Get existing objective
    const existingObjective = await prisma.objective.findUnique({
      where: { id }
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

    let alignmentPatch: { alignmentType: string; rollupCalculation: string } | null = null
    if (rawAlign !== undefined || rawRollup !== undefined) {
      let at = existingObjective.alignmentType || 'LOOSE'
      let rc = existingObjective.rollupCalculation || 'NONE'
      if (rawAlign !== undefined) at = rawAlign === 'STRICT_DEPENDENCY' ? 'STRICT_DEPENDENCY' : 'LOOSE'
      if (rawRollup !== undefined) {
        rc = rawRollup === 'AVERAGE' || rawRollup === 'SUM' ? rawRollup : 'NONE'
      }
      if (at === 'LOOSE') rc = 'NONE'
      alignmentPatch = { alignmentType: at, rollupCalculation: rc }
    }

    const finalParentId =
      parentObjectiveId === undefined
        ? existingObjective.parentObjectiveId
        : parentObjectiveId || null

    if (parentObjectiveId !== undefined && finalParentId) {
      const parentObjective = await prisma.objective.findUnique({
        where: { id: finalParentId },
      })
      if (!parentObjective) {
        return NextResponse.json({ error: 'Invalid parent objective' }, { status: 400 })
      }
      if (parentObjective.status !== 'ACTIVE') {
        return NextResponse.json(
          { error: 'Parent objective must be active (not archived)' },
          { status: 400 }
        )
      }
      if (parentObjective.timeframeId !== existingObjective.timeframeId) {
        return NextResponse.json(
          { error: 'Parent objective must be in the same timeframe as this objective' },
          { status: 400 }
        )
      }
      const cycle = await wouldCreateAlignmentCycle(prisma, id, finalParentId)
      if (cycle) {
        return NextResponse.json(
          { error: 'That alignment would create a circular dependency' },
          { status: 400 }
        )
      }
    }

    const oldParentId = existingObjective.parentObjectiveId

    const updatedObjective = await prisma.$transaction(async (tx) => {
      const updated = await tx.objective.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(ownerId && { ownerId }),
          ...(parentObjectiveId !== undefined && { parentObjectiveId: finalParentId }),
          ...(isPrivate !== undefined && { isPrivate }),
          ...(alignmentPatch && {
            alignmentType: alignmentPatch.alignmentType,
            rollupCalculation: alignmentPatch.rollupCalculation,
          }),
          ...(cadencePatch && cadencePatch),
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
          timeframe: true,
          department: {
            select: { id: true, name: true },
          },
          parentObjective: {
            select: { id: true, title: true, goalStatus: true, progress: true },
          },
        },
      })
      await recalcNodeAndAncestors(tx, id)
      if (oldParentId && oldParentId !== updated.parentObjectiveId) {
        await recalcNodeAndAncestors(tx, oldParentId)
      }
      return updated
    })

    await recordUpdateIfChanged(
      'OBJECTIVE',
      { objectiveId: id },
      existingObjective as unknown as Record<string, unknown>,
      updatedObjective as unknown as Record<string, unknown>,
      session.user.id,
    )

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

    // Get existing objective first to check permissions
    const existingObjective = await prisma.objective.findUnique({
      where: { id }
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
      where: { parentObjectiveId: id },
    })

    if (childCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete objective with child objectives. Please unlink them first.' },
        { status: 400 }
      )
    }

    // Delete objective (this will cascade delete key results and initiatives)
    await prisma.objective.delete({
      where: { id }
    })

    // Cascade also wipes the activity_logs rows for this objective; record a freestanding event so audit
    // can still answer "who deleted X". entityType set to OBJECTIVE with no FK so the row survives.
    await recordActivity({
      entityType: 'OBJECTIVE',
      action: 'DELETED',
      actorId: session.user.id,
      metadata: { objectiveId: id, title: existingObjective.title, level: existingObjective.level },
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
