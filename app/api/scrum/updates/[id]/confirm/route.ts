import { NextRequest } from 'next/server'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { confirmProxyUpdate } from '@/features/scrum/services/scrum-updates'

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const body = await request.json().catch(() => ({}))
  const result = await confirmProxyUpdate(session, params.id, body?.amend)
  if (!result) return apiNotFound('Scrum update not found')
  if ((result as any).forbidden) return apiForbidden('Only the subject can confirm this proxy entry')
  return apiSuccess(result, { message: body?.amend ? 'Proxy update amended' : 'Proxy update confirmed' })
})
