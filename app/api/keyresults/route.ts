import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canCreateKeyResultForObjective } from '@/lib/permissions'
import { parseCurrentValue, parseStartAndTarget } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import { emit } from '@/lib/notifications'
import {
  apiSuccess,
  apiPaginated,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const confidence = searchParams.get('confidence')
  const ownerId = searchParams.get('ownerId')
  const objectiveId = searchParams.get('objectiveId')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  const where: any = { status: 'ACTIVE' }

  if (session.user.role === 'EMPLOYEE') {
    where.OR = [{ ownerId: session.user.id }, { isPrivate: false }]
  }

  if (confidence) {
    const confidenceValues = confidence.split(',')
    where.confidence = { in: confidenceValues }
  }
  if (ownerId) where.ownerId = ownerId
  if (objectiveId) where.objectiveId = objectiveId
  if (search) where.title = { contains: search, mode: 'insensitive' }

  const skip = (page - 1) * limit
  const [keyResults, total] = await Promise.all([
    prisma.keyResult.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        objective: {
          select: {
            id: true,
            title: true,
            timeframeId: true,
            timeframe: { select: { id: true, name: true } },
          },
        },
        _count: { select: { todos: true } },
      },
    }),
    prisma.keyResult.count({ where }),
  ])

  return apiPaginated(keyResults, { total, page, limit })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const {
    title,
    description,
    ownerId,
    startValue,
    targetValue,
    unit,
    objectiveId,
    currentValue,
    isPrivate,
    checkInCadence: rawCadence,
  } = await request.json()
  const checkInCadence = normalizeCadence(rawCadence)

  if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '' || !objectiveId) {
    return apiBadRequest('Title, owner, target value, and objective are required')
  }

  const bounds = parseStartAndTarget(startValue, targetValue)
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const currentParsed = parseCurrentValue(currentValue, bounds.start)
  if (!currentParsed.ok) return apiBadRequest(currentParsed.message)

  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    include: { owner: { select: { id: true, name: true } } },
  })
  if (!objective) return apiNotFound('Objective not found')

  const allowed = await canCreateKeyResultForObjective(
    session.user.role as any,
    session.user.id,
    {
      id: objective.id,
      level: objective.level,
      ownerId: objective.ownerId,
      departmentId: objective.departmentId,
    }
  )
  if (!allowed) {
    return apiForbidden('Insufficient permissions to add key results to this objective')
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  const result = await prisma.$transaction(async (tx) => {
    const keyResult = await tx.keyResult.create({
      data: {
        title,
        description: description || '',
        ownerId,
        startValue: bounds.start,
        targetValue: bounds.target,
        currentValue: currentParsed.current,
        unit: unit || '%',
        objectiveId,
        status: 'ACTIVE',
        isPrivate: isPrivate ?? false,
        checkInCadence,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    await recalcNodeAndAncestors(tx, objectiveId)
    return keyResult
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: result.id,
    objectiveId,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { title: result.title },
  })

  // KR_ASSIGNED to owner (if different from actor) + KR_ADDED_TO_OBJECTIVE to objective owner.
  if (result.ownerId !== session.user.id) {
    await emit('KR_ASSIGNED', {
      actorId: session.user.id,
      entityType: 'KEY_RESULT', entityId: result.id, entityTitle: result.title,
      isPrivate: result.isPrivate,
      data: { actorName: session.user.name, objectiveId, deepLink: `/dashboard/objectives/${objectiveId}` },
    })
  }
  if (objective.ownerId !== session.user.id) {
    await emit('KR_ADDED_TO_OBJECTIVE', {
      actorId: session.user.id,
      entityType: 'KEY_RESULT', entityId: result.id, entityTitle: result.title,
      isPrivate: result.isPrivate,
      data: { actorName: session.user.name, objectiveId, deepLink: `/dashboard/objectives/${objectiveId}` },
    })
  }

  return apiSuccess(result, { status: 201, message: 'Key Result added successfully.' })
})
