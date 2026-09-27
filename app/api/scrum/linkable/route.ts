import { NextRequest } from 'next/server'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getLinkableEntities } from '@/features/scrum/services/scrum-links'
import { canProxyFor } from '@/features/scrum/services/access'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  const userId = q.get('userId') || session.user.id
  if (userId !== session.user.id && !await canProxyFor(session, userId)) {
    return apiForbidden('You cannot view linkable items for this user')
  }
  const ownerOnly = q.get('ownerOnly') === 'true'
  return apiSuccess(await getLinkableEntities(userId, ownerOnly))
})
