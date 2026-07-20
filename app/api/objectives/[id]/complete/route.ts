import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

/**
 * Legacy complete shortcut. Completion may no longer bypass the mandatory
 * grade + retrospective workflow, so this returns the close-flow defaults.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')
  const objective = await prisma.objective.findUnique({ where: { id } })
  if (!objective) return apiNotFound('Objective not found')
  const locked = await objectiveLockResponse(id)
  if (locked) return locked
  const allowed = await canEditObjective(session.user.role as any, session.user.id, objective)
  if (!allowed) return apiForbidden('Insufficient permissions to complete this objective')
  return apiSuccess({
    closeUrl: `/api/objectives/${id}/close/initiate`,
    defaults: { outcome: 'ACHIEVED', finalGrade: 1 },
    closureStatus: objective.closureStatus,
  }, { message: 'Complete the close workflow to mark this Objective achieved.' })
})
