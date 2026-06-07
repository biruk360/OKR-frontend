import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canRespondToReport } from '@/lib/performance'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canRespondToReport(actor, 'acknowledge')) return apiForbidden('You do not have permission to acknowledge reports')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { acknowledgements: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (evaluation.employeeId !== session.user.id) return apiForbidden('Only the evaluated employee can acknowledge this report')
  if (evaluation.status !== 'DRAFT_SHARED' || !evaluation.acknowledgements[0]) return apiBadRequest('No shared draft is awaiting acknowledgement')
  const body = await request.json().catch(() => ({}))
  const updated = await prisma.evaluationAcknowledgement.update({
    where: { id: evaluation.acknowledgements[0].id },
    data: { status: 'ACKNOWLEDGED', comment: typeof body.comment === 'string' ? body.comment.trim() || null : null, acknowledgedAt: new Date() },
  })
  return apiSuccess(updated)
})
