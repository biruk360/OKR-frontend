import { NextRequest } from 'next/server'
import { apiBadRequest, apiSuccess, withAuth } from '@/lib/api'
import { getScrumAnalytics } from '@/features/scrum/services/scrum-analytics'

export const GET = withAuth(async (request: NextRequest) => {
  const q = new URL(request.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to) return apiBadRequest('from and to are required')
  return apiSuccess(await getScrumAnalytics({ from, to, teamId: q.get('teamId') }))
})
