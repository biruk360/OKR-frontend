import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getScrumAnalyticsForViewer } from '@/features/scrum/services/scrum-analytics'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to) return apiBadRequest('from and to are required')
  const analytics = await getScrumAnalyticsForViewer(session, { from, to, teamId: q.get('teamId') })
  if (!analytics) return apiForbidden('Team health analytics are available to managers and admins')
  return apiSuccess(analytics)
})
