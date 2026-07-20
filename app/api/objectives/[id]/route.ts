import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpdateObjectiveForm } from '@/types'
import {
  canViewObjective,
  canEditObjective,
  canViewKeyResult,
  redactObjective,
  redactKeyResult,
} from '@/lib/permissions'
import { recalcNodeAndAncestors, wouldCreateAlignmentCycle } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity, recordUpdateIfChanged } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { filterFieldsByPermLevel } from '@/lib/field-filter'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      parentObjective: { select: { id: true, title: true, goalStatus: true, progress: true } },
      contributors: {
        include: {
          user: { select: { id: true, name: true, avatar: true, email: true } },
        },
      },
      childObjectives: {
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          _count: { select: { keyResults: true } },
        },
      },
      keyResults: {
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          todos: {
            include: {
              assignee: { select: { id: true, name: true, avatar: true } },
            },
          },
          _count: { select: { todos: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      comments: {
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          replies: {
            include: {
              author: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!objective) return apiNotFound('Objective not found')

  const visibility = await canViewObjective(
    session.user.role as any,
    session.user.id,
    {
      level: objective.level,
      ownerId: objective.ownerId,
      departmentId: objective.departmentId,
      isPrivate: objective.isPrivate,
    }
  )

  if (!visibility.canView) return apiForbidden('Access denied')

  let processedObjective = objective
  if (visibility.isRedacted) {
    processedObjective = redactObjective(objective) as any

    if (processedObjective.keyResults) {
      processedObjective.keyResults = processedObjective.keyResults.map((kr: any) => ({
        ...kr,
        title: '[Private Key Result]',
        description: null,
        startValue: 0,
        targetValue: 0,
        currentValue: 0,
        unit: '',
        progress: kr.progress,
      }))
    }
  } else {
    if (processedObjective.keyResults) {
      processedObjective.keyResults = await Promise.all(
        processedObjective.keyResults.map(async (kr: any) => {
          const krVisibility = await canViewKeyResult(
            session.user.role as any,
            session.user.id,
            {
              ownerId: kr.ownerId,
              objectiveId: kr.objectiveId,
              isPrivate: kr.isPrivate,
            }
          )
          if (krVisibility.isRedacted) return redactKeyResult(kr)
          return kr
        })
      )
    }
  }

  const filtered = await filterFieldsByPermLevel(
    processedObjective as unknown as Record<string, unknown>,
    'objective',
    session.user.id,
  )
  return apiSuccess(filtered)
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const body = (await request.json()) as UpdateObjectiveForm & {
    checkInCadence?: string
    contributorIds?: string[]
    confidence?: number
  }
  const {
    title,
    description,
    ownerId,
    departmentId: rawDepartmentId,
    parentObjectiveId,
    isPrivate,
    alignmentType: rawAlign,
    rollupCalculation: rawRollup,
    checkInCadence: rawCadence,
    confidence: rawConfidence,
  } = body as UpdateObjectiveForm & {
    checkInCadence?: string
    contributorIds?: string[]
    confidence?: number
    departmentId?: string | null
  }
  const confidencePatch =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? { confidence: Math.max(0, Math.min(100, Math.round(rawConfidence))) }
      : null
  const cadencePatch = rawCadence !== undefined ? { checkInCadence: normalizeCadence(rawCadence) } : null

  // contributorIds undefined → leave existing contributors alone.
  // contributorIds provided (array, possibly empty) → replace full set.
  const contributorIdsProvided = Array.isArray(body.contributorIds)
  const nextContributorIds: string[] = contributorIdsProvided
    ? Array.from(
        new Set(
          body.contributorIds!.filter(
            (v): v is string => typeof v === 'string' && !!v,
          ),
        ),
      )
    : []

  const existingObjective = await prisma.objective.findUnique({ where: { id } })
  if (!existingObjective) return apiNotFound('Objective not found')

  const locked = await objectiveLockResponse(id)
  if (locked) return locked

  const hasEditPermission = await canEditObjective(
    session.user.role as any,
    session.user.id,
    {
      level: existingObjective.level,
      ownerId: existingObjective.ownerId,
      departmentId: existingObjective.departmentId,
    }
  )

  if (!hasEditPermission) {
    return apiForbidden('Insufficient permissions to edit this objective')
  }

  if (ownerId && ownerId !== existingObjective.ownerId) {
    const newOwner = await prisma.user.findUnique({ where: { id: ownerId } })
    if (!newOwner) return apiBadRequest('Invalid owner')
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
    const parentObjective = await prisma.objective.findUnique({ where: { id: finalParentId } })
    if (!parentObjective) return apiBadRequest('Invalid parent objective')
    if (parentObjective.status !== 'ACTIVE') {
      return apiBadRequest('Parent objective must be active (not archived)')
    }
    if (parentObjective.timeframeId !== existingObjective.timeframeId) {
      return apiBadRequest('Parent objective must be in the same timeframe as this objective')
    }
    const cycle = await wouldCreateAlignmentCycle(prisma, id, finalParentId)
    if (cycle) {
      return apiBadRequest('That alignment would create a circular dependency')
    }
  }

  const oldParentId = existingObjective.parentObjectiveId

  // Resolve departmentId patch:
  //   - Not in body → no change
  //   - DEPARTMENT level + null/empty → reject (department is required)
  //   - DEPARTMENT level + value → validate dept exists
  //   - INDIVIDUAL level + value → set explicitly
  //   - INDIVIDUAL level + null/empty → re-derive from new (or existing) owner's primary
  //   - COMPANY level → ignored (always null)
  let departmentPatch: { departmentId: string | null } | null = null
  if (rawDepartmentId !== undefined) {
    const lvl = existingObjective.level
    if (lvl === 'COMPANY') {
      departmentPatch = { departmentId: null }
    } else if (lvl === 'DEPARTMENT') {
      const next = rawDepartmentId || null
      if (!next) return apiBadRequest('Department is required for department-level objectives')
      const dept = await prisma.department.findUnique({ where: { id: next }, select: { id: true } })
      if (!dept) return apiBadRequest('Department not found')
      departmentPatch = { departmentId: next }
    } else {
      // INDIVIDUAL
      if (rawDepartmentId) {
        const dept = await prisma.department.findUnique({ where: { id: rawDepartmentId }, select: { id: true } })
        if (!dept) return apiBadRequest('Department not found')
        departmentPatch = { departmentId: rawDepartmentId }
      } else {
        // Re-derive from the (effective) owner's primary department.
        const effectiveOwnerId = ownerId || existingObjective.ownerId
        const primary = await prisma.departmentMembership.findFirst({
          where: { userId: effectiveOwnerId, isPrimary: true, endedAt: null },
          select: { departmentId: true },
        })
        departmentPatch = { departmentId: primary?.departmentId ?? null }
      }
    }
  }

  const updatedObjective = await prisma.$transaction(async (tx) => {
    // Replace contributor set if provided (exclude the owner automatically).
    if (contributorIdsProvided) {
      const effectiveOwnerId = ownerId || existingObjective.ownerId
      const filtered = nextContributorIds.filter((uid) => uid !== effectiveOwnerId)
      await tx.objectiveContributor.deleteMany({ where: { objectiveId: id } })
      if (filtered.length > 0) {
        await tx.objectiveContributor.createMany({
          data: filtered.map((uid) => ({ objectiveId: id, userId: uid })),
          skipDuplicates: true,
        })
      }
    }

    const updated = await tx.objective.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(ownerId && { ownerId }),
        ...(parentObjectiveId !== undefined && { parentObjectiveId: finalParentId }),
        ...(departmentPatch && departmentPatch),
        ...(isPrivate !== undefined && { isPrivate }),
        ...(alignmentPatch && {
          alignmentType: alignmentPatch.alignmentType,
          rollupCalculation: alignmentPatch.rollupCalculation,
        }),
        ...(cadencePatch && cadencePatch),
        ...(confidencePatch && confidencePatch),
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
        parentObjective: { select: { id: true, title: true, goalStatus: true, progress: true } },
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

  return apiSuccess(updatedObjective, { message: 'Objective updated successfully' })
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const existingObjective = await prisma.objective.findUnique({ where: { id } })
  if (!existingObjective) return apiNotFound('Objective not found')

  const locked = await objectiveLockResponse(id)
  if (locked) return locked

  const canDelete =
    session.user.role === 'ADMIN' ||
    session.user.role === 'EXECUTIVE' ||
    existingObjective.ownerId === session.user.id

  if (!canDelete) {
    return apiForbidden('Insufficient permissions to delete this objective')
  }

  const childCount = await prisma.objective.count({
    where: { parentObjectiveId: id },
  })

  if (childCount > 0) {
    return apiBadRequest('Cannot delete objective with child objectives. Please unlink them first.')
  }

  await prisma.objective.delete({ where: { id } })

  // Cascade wipes activity logs; record a freestanding event so audit survives.
  await recordActivity({
    entityType: 'OBJECTIVE',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { objectiveId: id, title: existingObjective.title, level: existingObjective.level },
  })

  return apiSuccess(null, { message: 'Objective deleted successfully' })
})
