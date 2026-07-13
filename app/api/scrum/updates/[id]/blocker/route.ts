import { NextRequest } from 'next/server'
import { apiBadRequest, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { blockerEscalateSchema, blockerResolveSchema } from '@/features/scrum/services/schemas'
import { escalateScrumBlocker, resolveScrumBlocker } from '@/features/scrum/services/blocker-actions'

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const body = await request.json().catch(() => null)
  if (body?.action === 'resolve') {
    const parsed = blockerResolveSchema.safeParse(body)
    if (!parsed.success) return apiValidationError('Invalid blocker resolution', parsed.error.flatten())
    return apiSuccess(await resolveScrumBlocker(session, params.id, parsed.data.resolutionNote), { message: 'Blocker resolved' })
  }
  if (body?.action === 'escalate') {
    const parsed = blockerEscalateSchema.safeParse(body)
    if (!parsed.success) return apiValidationError('Invalid blocker escalation', parsed.error.flatten())
    const result = await escalateScrumBlocker(session, params.id, parsed.data.escalatedToUserId)
    if (!result) return apiNotFound('Scrum update not found')
    return apiSuccess(result, { message: 'Blocker escalated' })
  }
  return apiBadRequest('Unsupported blocker action')
})
