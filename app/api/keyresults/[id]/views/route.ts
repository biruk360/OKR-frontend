import { prisma } from '@/lib/prisma'
import { canViewKeyResult } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { trackKeyResultView } from '@/lib/view-tracking'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return apiNotFound('Not found')

  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
  if (!visibility.canView) return apiForbidden('Access denied')

  await trackKeyResultView(id, session.user.id)
  return apiSuccess(null)
})
