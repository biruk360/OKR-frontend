import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiConflict, apiForbidden, withAuth } from '@/lib/api'
import { canFeature } from '@/lib/rbac'
import { canCreateSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { buildScopeFilter } from '@/lib/apply-scope'

/**
 * GET — list sprints visible to the user.
 *
 * Sprint v2 Phase 1 additions:
 *   - ?state=PLANNING|ACTIVE|COMPLETED|CANCELLED
 *   - ?departmentId=<id>
 *   - ?participantId=<id>
 * Legacy ?status filter still honoured.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const hasFeatureAccess = await canFeature(session.user.id, 'page.sprints')
  const hasRoleAccess = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'].includes(session.user.role)
  if (!hasFeatureAccess && !hasRoleAccess) return apiForbidden('Feature not available')
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const state = searchParams.get('state')
  const departmentId = searchParams.get('departmentId')
  const participantId = searchParams.get('participantId')
  // Delta-sync support (desktop companion app): rows changed after the cursor.
  const updatedSince = searchParams.get('updatedSince')
  const sinceDate = updatedSince ? new Date(updatedSince) : null
  const syncPull = sinceDate !== null && !isNaN(sinceDate.getTime())

  const where: any = {}
  if (state) where.state = state
  else if (status) where.status = status
  else if (!syncPull) where.status = 'ACTIVE'
  if (departmentId) where.departmentId = departmentId
  if (participantId) where.participants = { some: { userId: participantId } }
  if (syncPull) where.updatedAt = { gt: sinceDate }

  const scopeFilter = await buildScopeFilter(session.user.id, 'sprint')

  const sprints = await prisma.sprint.findMany({
    where: { ...where, ...(scopeFilter ?? {}) },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      participants: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      _count: { select: { columns: true, todos: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return apiSuccess(sprints)
})

// Five board lanes, one per global TodoStatus. Order is the default lane order
// shown on the sprint board; users can re-order per sprint via the columns API.
const DEFAULT_COLUMNS = [
  { name: 'To Do',       statusKey: 'PENDING',     position: 0, color: null },
  { name: 'In Progress', statusKey: 'IN_PROGRESS', position: 1, color: '#0A84FF' },
  { name: 'In Review',   statusKey: 'IN_REVIEW',   position: 2, color: '#AF52DE' },
  { name: 'Stuck',       statusKey: 'STUCK',       position: 3, color: '#FF9500' },
  { name: 'Done',        statusKey: 'COMPLETED',   position: 4, color: '#34C759' },
]

const VALID_STATES = new Set(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const hasFeatureAccess = await canFeature(session.user.id, 'page.sprints')
  const hasRoleAccess = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'].includes(session.user.role)
  if (!hasFeatureAccess && !hasRoleAccess) return apiForbidden('Feature not available')
  const body = await request.json()
  const {
    name, description, startDate, endDate,
    state, goal, goalLabel, goalTarget, goalCurrent, goalUnit,
    departmentId, participantIds,
  } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return apiBadRequest('Sprint name is required')
  }

  // Offline-first clients (desktop app) generate the id locally before syncing.
  let clientId: string | undefined
  if (typeof body.id === 'string' && body.id.trim()) {
    clientId = body.id.trim()
    const existing = await prisma.sprint.findUnique({
      where: { id: clientId },
      select: { id: true },
    })
    if (existing) return apiConflict('A sprint with this id already exists')
  }

  const role = session.user.role as UserRole
  const allowed = await canCreateSprint(role, session.user.id, departmentId ?? null)
  if (!allowed) return apiForbidden('Insufficient permissions to create sprint in this scope')

  const sprintState = (typeof state === 'string' && VALID_STATES.has(state)) ? state : 'PLANNING'

  const participantList: string[] = Array.isArray(participantIds)
    ? Array.from(new Set(participantIds.filter((x: unknown) => typeof x === 'string')))
    : []

  const sprint = await prisma.sprint.create({
    data: {
      ...(clientId ? { id: clientId } : {}),
      name: name.trim(),
      description: description?.trim() || null,
      ownerId: session.user.id,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: 'ACTIVE',
      state: sprintState,
      goal: typeof goal === 'string' ? goal : null,
      goalLabel: typeof goalLabel === 'string' ? goalLabel : null,
      goalTarget: typeof goalTarget === 'number' ? goalTarget : null,
      goalCurrent: typeof goalCurrent === 'number' ? goalCurrent : 0,
      goalUnit: typeof goalUnit === 'string' ? goalUnit : null,
      departmentId: typeof departmentId === 'string' ? departmentId : null,
      columns: { create: DEFAULT_COLUMNS },
      ...(participantList.length > 0 && {
        participants: {
          createMany: {
            data: participantList.map(userId => ({ userId, role: 'MEMBER' })),
            skipDuplicates: true,
          },
        },
      }),
    },
    include: { columns: true, participants: true },
  })

  await recordActivity({
    entityType: 'SPRINT',
    sprintId: sprint.id,
    action: 'SPRINT_CREATED',
    actorId: session.user.id,
    metadata: { name: sprint.name, state: sprint.state },
  })

  return apiSuccess(sprint, { status: 201 })
})
