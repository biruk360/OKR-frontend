import { NextRequest } from 'next/server'
import { apiBadRequest, apiSuccess, withAuth } from '@/lib/api'
import { getScrumCalendar } from '@/features/scrum/services/calendar'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to) return apiBadRequest('from and to are required')
  return apiSuccess(await getScrumCalendar(session, {
    from,
    to,
    teamId: q.get('teamId'),
    userId: q.get('userId'),
    projectId: q.get('projectId'),
    hasBlocker: q.has('hasBlocker') ? q.get('hasBlocker') === 'true' : null,
    hasWin: q.has('hasWin') ? q.get('hasWin') === 'true' : null,
    state: q.get('state'),
    search: q.get('search'),
  }))
})
