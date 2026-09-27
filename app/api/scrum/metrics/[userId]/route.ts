import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getScrumMetrics, serializeScrumMetricActuals } from '@/features/scrum/services/scrum-metrics'
import { canReadScrumUserRecords } from '@/features/scrum/services/access'

export const GET = withAuth<{ userId: string }>(async (request: NextRequest, { session, params }) => {
  const q = new URL(request.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to) return apiBadRequest('from and to are required')
  if (!await canReadScrumUserRecords(session, params.userId)) return apiForbidden('You cannot view scrum metrics for this user')
  return apiSuccess(serializeScrumMetricActuals(await getScrumMetrics(params.userId, from, to)))
})
