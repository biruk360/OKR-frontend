import { NextRequest } from 'next/server'
import { apiBadRequest, apiSuccess, withAuth } from '@/lib/api'
import { getScrumMetrics, serializeScrumMetricActuals } from '@/features/scrum/services/scrum-metrics'

export const GET = withAuth<{ userId: string }>(async (request: NextRequest, { params }) => {
  const q = new URL(request.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to) return apiBadRequest('from and to are required')
  return apiSuccess(serializeScrumMetricActuals(await getScrumMetrics(params.userId, from, to)))
})
