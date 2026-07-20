import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

/** Legacy shortcut into the mandatory grade + retrospective close workflow. */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: { objective: { select: { ownerId: true, level: true, departmentId: true } } },
  })
  if (!keyResult) return apiNotFound('Key result not found')
  const locked = await keyResultLockResponse(id)
  if (locked) return locked
  const allowed = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    keyResult,
    keyResult.objective,
  )
  if (!allowed) return apiForbidden('Insufficient permissions to complete this Key Result')
  return apiSuccess({
    closeUrl: `/api/keyresults/${id}/close/initiate`,
    defaults: { outcome: 'ACHIEVED', finalGrade: 1 },
    closureStatus: keyResult.closureStatus,
  }, { message: 'Complete the close workflow to mark this Key Result achieved.' })
})
