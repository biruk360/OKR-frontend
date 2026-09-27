import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { blockerEscalateSchema, blockerResolveSchema } from '@/features/scrum/services/schemas'
import { escalateScrumBlocker, resolveScrumBlocker } from '@/features/scrum/services/blocker-actions'

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const body = await request.json().catch(() => null)
  if (body?.action === 'resolve') {
    const parsed = blockerResolveSchema.safeParse(body)
    if (!parsed.success) return apiValidationError('Invalid blocker resolution', parsed.error.flatten())
    const result = await resolveScrumBlocker(session, params.id, parsed.data.resolutionNote)
    if (result.status === 'not_found') return apiNotFound('Scrum update not found')
    if (result.status === 'forbidden') return apiForbidden('Only the owner, their manager, or an admin can resolve this blocker')
    if (result.status === 'invalid') return apiBadRequest(result.reason)
    return apiSuccess(result.update, { message: 'Blocker resolved' })
  }
  if (body?.action === 'escalate') {
    const parsed = blockerEscalateSchema.safeParse(body)
    if (!parsed.success) return apiValidationError('Invalid blocker escalation', parsed.error.flatten())
    const result = await escalateScrumBlocker(session, params.id, parsed.data.escalatedToUserId)
    if (result.status === 'not_found') return apiNotFound('Scrum update not found')
    if (result.status === 'forbidden') return apiForbidden('Only the owner, their manager, or an admin can escalate this blocker')
    if (result.status === 'invalid') return apiBadRequest(result.reason)
    return apiSuccess(result.update, { message: 'Blocker escalated' })
  }
  return apiBadRequest('Unsupported blocker action')
})
