import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateObjectiveForm } from '@/types'
import { canCreateObjective, canViewObjective, redactObjective } from '@/lib/permissions'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import {
  apiSuccess,
  apiPaginated,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const status = searchParams.get('status')
  const ownerId = searchParams.get('ownerId')
  const departmentId = searchParams.get('departmentId')
  const timeframeId = searchParams.get('timeframeId')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')

  const where: any = {}

  const isEmployee = session.user.role === 'EMPLOYEE'
  const requestingHigherLevel = level === 'COMPANY' || level === 'DEPARTMENT'
  const hasOwnerFilter = Boolean(ownerId)

  if (isEmployee && !hasOwnerFilter && !requestingHigherLevel) {
    where.ownerId = session.user.id
  } else if (session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)

    where.OR = [
      { ownerId: session.user.id },
      { departmentId: { in: departmentIds } },
    ]
  }

  if (level) where.level = level
  if (status) where.status = status
  else where.status = 'ACTIVE'
  if (ownerId) where.ownerId = ownerId
  if (departmentId) where.departmentId = departmentId
  if (timeframeId) where.timeframeId = timeframeId

  if (search) {
    const searchConditions = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]

    if (where.OR && Array.isArray(where.OR)) {
      const existingConditions = { OR: where.OR }
      where.AND = [existingConditions, { OR: searchConditions }]
      delete where.OR
    } else {
      where.OR = searchConditions
    }
  }

  const skip = (page - 1) * limit

  const [objectives, total] = await Promise.all([
    prisma.objective.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
        parentObjective: { select: { id: true, title: true, level: true } },
        objectiveLabels: { include: { label: true } },
        childObjectives: {
          where: { status: 'ACTIVE' },
          include: {
            owner: { select: { id: true, name: true, avatar: true } },
            department: { select: { id: true, name: true } },
            _count: { select: { keyResults: true, childObjectives: true } },
          },
          orderBy: { level: 'asc' },
        },
        keyResults: {
          orderBy: { createdAt: 'asc' },
          include: {
            owner: { select: { id: true, name: true, avatar: true } },
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

  const processedObjectives = await Promise.all(
    objectives.map(async (objective: any) => {
      try {
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

        if (!visibility.canView) return null
        if (visibility.isRedacted) return redactObjective(objective)
        return objective
      } catch (error) {
        console.error('Error processing objective visibility:', error)
        return objective
      }
    })
  )

  const filteredObjectives = processedObjectives.filter((obj) => obj !== null)

  return apiPaginated(filteredObjectives, { page, limit, total })
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
  const sanitizedDepartmentId = departmentId || null
  const sanitizedParentObjectiveId = parentObjectiveId || null
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

  return apiSuccess(objective, { status: 201, message: 'Objective created successfully' })
})
