import { prisma } from '@/lib/prisma'
import {
  canViewObjective,
  canCreateKeyResultForObjective,
  canEditKeyResultWithObjectiveContext,
  canDeleteKeyResult,
} from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

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

  if (!objective) return apiNotFound('Objective not found')

  const visibility = await canViewObjective(session.user.role as any, session.user.id, {
    level: objective.level,
    ownerId: objective.ownerId,
    departmentId: objective.departmentId,
    isPrivate: objective.isPrivate || false,
  })

  if (!visibility.canView) return apiForbidden('Access denied')

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
  const canCloneKeyResults = role === 'ADMIN' || userId === objective.ownerId

  return apiSuccess({
    canCreate,
    canEditByKeyResultId,
    canDeleteKeyResults: canDelete,
    canCloneKeyResults,
  })
})
