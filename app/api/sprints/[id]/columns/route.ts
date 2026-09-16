import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { sprintEditGuard } from '@/lib/sprints/guards'
import { getSprintLanes, isBoardStatusKey } from '@/lib/sprints/columns'
import { canViewSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'

/**
 * GET /api/sprints/[id]/columns — the sprint's active lanes.
 *
 * Previously there was no GET at all, which is part of why the column API was
 * unreachable from the app.
 */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: sprintId } = await resolveParams(params)
  if (!sprintId) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  const allowed = await canViewSprint(session.user.role as UserRole, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden('You do not have access to this sprint')

  return apiSuccess(await getSprintLanes(sprintId))
})

/**
 * POST /api/sprints/[id]/columns — add a lane.
 *
 * `statusKey` is required: a lane with no status would leave its cards outside
 * the status model that completion %, AI carryover and the end-sprint
 * disposition engine all rely on. Several lanes may share a statusKey.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId } = await resolveParams(params)
  if (!sprintId) return apiBadRequest('Invalid sprint id')

  const denied = await sprintEditGuard(
    sprintId,
    { id: session.user.id, role: session.user.role },
    'Insufficient permissions to add a column to this sprint',
  )
  if (denied) return denied

  const body = await request.json()
  const name = (body.name || '').trim()
  if (!name) return apiBadRequest('Column name is required')
  if (name.length > 60) return apiBadRequest('Column name must be 60 characters or fewer')
  if (!isBoardStatusKey(body.statusKey)) {
    return apiBadRequest('statusKey is required and must be one of PENDING, IN_PROGRESS, IN_REVIEW, STUCK, COMPLETED')
  }

  const lastColumn = await prisma.sprintColumn.findFirst({
    where: { sprintId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (lastColumn?.position ?? -1) + 1

  try {
    const column = await prisma.sprintColumn.create({
      data: { sprintId, name, statusKey: body.statusKey, position, color: body.color || null },
    })
    await recordActivity({
      entityType: 'SPRINT',
      sprintId,
      action: 'SPRINT_COLUMN_CREATED',
      actorId: session.user.id,
      metadata: { columnId: column.id, name: column.name, statusKey: column.statusKey },
    })
    return apiSuccess(column, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return apiConflict('A column with that name already exists in this sprint')
    }
    throw err
  }
})
