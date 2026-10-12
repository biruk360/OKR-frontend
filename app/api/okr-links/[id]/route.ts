import { NextRequest } from 'next/server'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { deleteOkrLink } from '@/lib/okr-links/service'
import { okrLinkErrorResponse } from '@/lib/okr-links/http'

/**
 * DELETE /api/okr-links/[id] — remove a link. Requires edit rights on its FROM item
 * (ADMIN / EXECUTIVE always); clears the LNK-2 lineage mirror when it pointed at the
 * removed predecessor. Logic: lib/okr-links/service.ts.
 */
export const DELETE = withAuth<{ id: string }>(async (_req: NextRequest, { session, params }) => {
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden()
  try {
    const result = await deleteOkrLink({ id: session.user.id, role: session.user.role }, params.id)
    return apiSuccess(result)
  } catch (error) {
    const response = okrLinkErrorResponse(error)
    if (response) return response
    throw error
  }
})
