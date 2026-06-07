import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManageDevelopmentAction } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

const VALID_TRANSITIONS: Record<string, string[]> = {
  RECOMMENDED: ['APPROVED', 'REJECTED'],
  APPROVED: ['EXECUTED'],
  REJECTED: [],
  EXECUTED: [],
}

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const action = await prisma.developmentAction.findUnique({ where: { id } })
  if (!action) return apiNotFound('Development action not found')
  const body = await request.json().catch(() => ({}))
  const status = typeof body.status === 'string' ? body.status : ''
  if (!VALID_TRANSITIONS[action.status]?.includes(status)) return apiBadRequest(`Invalid action transition: ${action.status} -> ${status}`)
  const permissionAction = status === 'EXECUTED' ? 'execute' : status === 'REJECTED' ? 'reject' : 'approve'
  if (!await canManageDevelopmentAction({ userId: session.user.id, role: session.user.role }, permissionAction)) {
    return apiForbidden('You do not have permission to perform this action')
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if ((status === 'APPROVED' || status === 'REJECTED') && !reason) return apiBadRequest('A decision reason is required')
  const updated = await prisma.developmentAction.update({
    where: { id },
    data: {
      status,
      decisionReason: reason || action.decisionReason,
      approvedById: status === 'APPROVED' ? session.user.id : action.approvedById,
      executedById: status === 'EXECUTED' ? session.user.id : action.executedById,
      ...(body.detailJson ? { detailJson: body.detailJson as Prisma.InputJsonValue } : {}),
    },
  })
  return apiSuccess(updated)
})
