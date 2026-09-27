import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateObjectiveForm } from '@/types'
import type { Prisma } from '@prisma/client'
import { canCreateObjective } from '@/lib/permissions'
import {
  buildObjectiveVisibilityWhere,
  loadViewerContext,
  redactKeyResultForViewer,
  redactObjectiveForViewer,
} from '@/lib/okr/visibility-scope'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import { emit } from '@/lib/notifications'
import {
  apiSuccess,
  apiPaginated,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'

/**
 * GET /api/objectives — paginated objective list.
 *
 * Filters (all optional, ANDed unless noted):
 *   level, status (default ACTIVE), departmentId, timeframeId, search
 *   ownerId        a single owner
 *   ownerIds       several owners (comma-separated and/or repeated); merged with ownerId
 *   contributorId  objectives this user is a contributor on (ObjectiveContributor).
 *                  Given together with an owner filter the two are ORed —
 *                  `ownerId=me&contributorId=me` is "mine or ones I contribute to".
 *   page, limit (default 10)
 *
 * Without an owner / contributor / COMPANY|DEPARTMENT level filter, EMPLOYEE
 * lists default to their own objectives and DEPARTMENT_LEAD lists to their own
 * + their departments'. Every list is ANDed with the viewer's visibility where
 * (not DELETED + objective record scope, lib/okr/visibility-scope.ts); private
 * rows the viewer may not see in full — and nested key results, child and parent
 * objectives — are redacted. A free-text search only matches rows the viewer
 * sees unredacted, so it cannot probe private titles.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const status = searchParams.get('status')
  const departmentId = searchParams.get('departmentId')
  const timeframeId = searchParams.get('timeframeId')
  const search = searchParams.get('search')
  const contributorId = searchParams.get('contributorId')
  const ownerIds = Array.from(
    new Set(
      [...searchParams.getAll('ownerId'), ...searchParams.getAll('ownerIds')]
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  )
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = Math.max(1, parseInt(searchParams.get('limit') || '10') || 10)

  // Visibility facts + record scope, loaded once for the request.
  const viewerCtx = await loadViewerContext({ id: session.user.id, role: session.user.role })

  const and: Prisma.ObjectiveWhereInput[] = [
    buildObjectiveVisibilityWhere(viewerCtx, { includeRedacted: !search }),
  ]

  const requestingHigherLevel = level === 'COMPANY' || level === 'DEPARTMENT'
  const hasPeopleFilter = ownerIds.length > 0 || Boolean(contributorId)

  if (!hasPeopleFilter && !requestingHigherLevel) {
    if (session.user.role === 'EMPLOYEE') {
      and.push({ ownerId: session.user.id })
    } else if (session.user.role === 'DEPARTMENT_LEAD') {
      and.push({
        OR: [
          { ownerId: session.user.id },
          { departmentId: { in: Array.from(viewerCtx.departmentIds) } },
        ],
      })
    }
  }

  const people: Prisma.ObjectiveWhereInput[] = []
  if (ownerIds.length === 1) people.push({ ownerId: ownerIds[0] })
  else if (ownerIds.length > 1) people.push({ ownerId: { in: ownerIds } })
  if (contributorId) people.push({ contributors: { some: { userId: contributorId } } })
  if (people.length === 1) and.push(people[0])
  else if (people.length > 1) and.push({ OR: people })

  if (level) and.push({ level: level as Prisma.ObjectiveWhereInput['level'] })
  and.push({ status: (status || 'ACTIVE') as Prisma.ObjectiveWhereInput['status'] })
  if (departmentId) and.push({ departmentId })
  if (timeframeId) and.push({ timeframeId })
  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  const where: Prisma.ObjectiveWhereInput = { AND: and }
  const skip = (page - 1) * limit
  const personSelect = { select: { id: true, name: true, avatar: true } } as const

  const [objectives, total] = await Promise.all([
    prisma.objective.findMany({
      where,
      include: {
        owner: personSelect,
        timeframe: true,
        department: { select: { id: true, name: true } },
        parentObjective: { select: { id: true, title: true, level: true, ownerId: true, isPrivate: true } },
        objectiveLabels: { include: { label: true } },
        childObjectives: {
          where: { AND: [{ status: 'ACTIVE' }, buildObjectiveVisibilityWhere(viewerCtx)] },
          include: {
            owner: personSelect,
            department: { select: { id: true, name: true } },
            _count: { select: { keyResults: true, childObjectives: true } },
          },
          orderBy: { level: 'asc' },
        },
        keyResults: {
          orderBy: { createdAt: 'asc' },
          include: {
            owner: personSelect,
            objective: { select: { id: true, ownerId: true } },
          },
        },
        _count: { select: { keyResults: true, childObjectives: true } },
      },
      orderBy: [{ level: 'asc' }, { updatedAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.objective.count({ where }),
  ])

  const rows = objectives.map((objective) => {
    const keyResults = objective.keyResults.map((kr) => redactKeyResultForViewer(viewerCtx, kr, objective))
    const childObjectives = objective.childObjectives.map((child) => redactObjectiveForViewer(viewerCtx, child))
    const parentObjective = objective.parentObjective
      ? redactObjectiveForViewer(viewerCtx, objective.parentObjective)
      : null
    const base = redactObjectiveForViewer(viewerCtx, objective)
    return {
      ...base,
      // A redacted objective does not expose its labels either.
      objectiveLabels: base.isRedacted ? [] : objective.objectiveLabels,
      keyResults,
      childObjectives,
      parentObjective,
    }
  })

  return apiPaginated(rows, { page, limit, total })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const body: CreateObjectiveForm = await request.json()
  const {
    title,
    description,
    level,
    ownerId,
    timeframeId,
    departmentId,
    parentObjectiveId,
    isPrivate,
    goalStatus,
    startDate,
    endDate,
    alignmentType: rawAlign,
    rollupCalculation: rawRollup,
    checkInCadence: rawCadence,
  } = body as CreateObjectiveForm & { checkInCadence?: string }
  const checkInCadence = normalizeCadence(rawCadence)
  let sanitizedDepartmentId = departmentId || null
  const sanitizedParentObjectiveId = parentObjectiveId || null

  // Phase 3: INDIVIDUAL OKRs inherit departmentId from owner's primary department
  // (live, per design). DEPARTMENT/COMPANY OKRs use the explicit value passed in.
  if (level === 'INDIVIDUAL' && !sanitizedDepartmentId && ownerId) {
    const primary = await prisma.departmentMembership.findFirst({
      where: { userId: ownerId, isPrimary: true, endedAt: null },
      select: { departmentId: true },
    })
    sanitizedDepartmentId = primary?.departmentId ?? null
  }
  // Optional list of User ids collaborating on this objective (never includes ownerId).
  const rawContributorIds: unknown = (body as any).contributorIds
  const contributorIds: string[] = Array.isArray(rawContributorIds)
    ? Array.from(new Set(rawContributorIds.filter((v) => typeof v === 'string' && v && v !== ownerId)))
    : []
  const normalizedDescription = description?.trim() ? description.trim() : null

  const normalizedIsPrivate =
    typeof isPrivate === 'boolean' ? isPrivate : isPrivate === 'true' || isPrivate === true

  let alignmentType = rawAlign === 'STRICT_DEPENDENCY' ? 'STRICT_DEPENDENCY' : 'LOOSE'
  let rollupCalculation: 'NONE' | 'AVERAGE' | 'SUM' = 'NONE'
  if (rawRollup === 'AVERAGE' || rawRollup === 'SUM') rollupCalculation = rawRollup
  if (alignmentType === 'LOOSE') rollupCalculation = 'NONE'

  if (!title || !level || !ownerId || !timeframeId) {
    return apiBadRequest('Title, level, owner, and timeframe are required')
  }

  if (!canCreateObjective(session.user.role as any, level as any)) {
    return apiForbidden('Insufficient permissions to create objectives at this level')
  }

  if (level === 'DEPARTMENT' && session.user.role === 'DEPARTMENT_LEAD' && departmentId) {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)
    if (!departmentIds.includes(departmentId)) {
      return apiForbidden('You can only create objectives for your own department')
    }
  }

  if (level === 'INDIVIDUAL' && session.user.role === 'DEPARTMENT_LEAD' && ownerId !== session.user.id) {
    const isDirectReport = await prisma.managerRelationship.findFirst({
      where: {
        managerId: session.user.id,
        directReportId: ownerId,
        endedAt: null,
      },
    })
    if (!isDirectReport) {
      return apiForbidden('You can only create objectives for yourself or your direct reports')
    }
  }

  const timeframe = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
  if (!timeframe) return apiBadRequest('Invalid timeframe')

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  if (sanitizedParentObjectiveId) {
    const parentObjective = await prisma.objective.findUnique({
      where: { id: sanitizedParentObjectiveId },
    })
    if (!parentObjective) return apiBadRequest('Invalid parent objective')
    if (parentObjective.status !== 'ACTIVE') {
      return apiBadRequest('Parent objective must be active (not archived)')
    }
    if (parentObjective.timeframeId !== timeframeId) {
      return apiBadRequest('Parent objective must be in the same timeframe')
    }
  }

  let parsedStartDate: Date | null = null
  let parsedEndDate: Date | null = null

  if (startDate) {
    try {
      parsedStartDate = new Date(startDate)
      if (isNaN(parsedStartDate.getTime())) parsedStartDate = null
    } catch {
      parsedStartDate = null
    }
  }

  if (endDate) {
    try {
      parsedEndDate = new Date(endDate)
      if (isNaN(parsedEndDate.getTime())) parsedEndDate = null
    } catch {
      parsedEndDate = null
    }
  }

  const objective = await prisma.$transaction(async (tx) => {
    const created = await tx.objective.create({
      data: {
        title,
        description: normalizedDescription,
        level,
        ownerId,
        timeframeId,
        departmentId: sanitizedDepartmentId,
        parentObjectiveId: sanitizedParentObjectiveId,
        alignmentType,
        rollupCalculation,
        checkInCadence,
        isPrivate: normalizedIsPrivate,
        goalStatus: goalStatus || 'ON_TRACK',
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        contributors:
          contributorIds.length > 0
            ? { create: contributorIds.map((uid) => ({ userId: uid })) }
            : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
        parentObjective: { select: { id: true, title: true } },
      },
    })
    await recalcNodeAndAncestors(tx, created.id)
    return created
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: objective.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { title: objective.title, level: objective.level },
  })

  // Notifications: OBJECTIVE_ASSIGNED (if owner != actor), OBJECTIVE_CREATED_IN_TEAM (team),
  // OBJECTIVE_ALIGNED_CHILD_ADDED (if has parent).
  if (objective.ownerId !== session.user.id) {
    await emit('OBJECTIVE_ASSIGNED', {
      actorId: session.user.id,
      entityType: 'OBJECTIVE', entityId: objective.id, entityTitle: objective.title,
      isPrivate: objective.isPrivate,
      data: { actorName: session.user.name, deepLink: `/dashboard/objectives/${objective.id}` },
    })
  }
  if (objective.departmentId) {
    await emit('OBJECTIVE_CREATED_IN_TEAM', {
      actorId: session.user.id,
      entityType: 'OBJECTIVE', entityId: objective.id, entityTitle: objective.title,
      isPrivate: objective.isPrivate,
      data: { actorName: session.user.name, departmentId: objective.departmentId, deepLink: `/dashboard/objectives/${objective.id}` },
    })
  }
  if (objective.parentObjectiveId) {
    await emit('OBJECTIVE_ALIGNED_CHILD_ADDED', {
      actorId: session.user.id,
      entityType: 'OBJECTIVE', entityId: objective.parentObjectiveId, entityTitle: objective.parentObjective?.title ?? undefined,
      isPrivate: objective.isPrivate,
      data: {
        actorName: session.user.name,
        parentObjectiveId: objective.parentObjectiveId,
        childObjectiveId: objective.id,
        childTitle: objective.title,
        deepLink: `/dashboard/objectives/${objective.parentObjectiveId}`,
      },
    })
  }

  return apiSuccess(objective, { status: 201, message: 'Objective created successfully' })
})
