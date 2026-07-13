import { NextRequest } from 'next/server'
import { apiSuccess, withAuth } from '@/lib/api'
import { getLinkableEntities } from '@/features/scrum/services/scrum-links'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  return apiSuccess(await getLinkableEntities(q.get('userId') || session.user.id))
})
