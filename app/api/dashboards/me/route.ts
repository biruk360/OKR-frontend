/**
 * GET /api/dashboards/me — payload for the current user's employee dashboard.
 * Available to all authenticated users; scope is filtered by the loader to
 * objectives the user owns, contributes to, or has assigned initiatives on.
 */

import { withAuth, apiSuccess } from '@/lib/api'
import { loadDashboardPayload } from '@/lib/dashboards/payload'

export const GET = withAuth(async (_request, { session }) => {
  const payload = await loadDashboardPayload('me', session.user.id)
  return apiSuccess(payload)
})
