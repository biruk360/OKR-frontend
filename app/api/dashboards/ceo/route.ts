/**
 * GET /api/dashboards/ceo — payload for the CEO super-dashboard.
 * Restricted to ADMIN and EXECUTIVE roles. Returns the same denormalized shape
 * the page server-renders, so the client can refresh in place.
 */

import { withAuth, apiSuccess, apiForbidden } from '@/lib/api'
import { loadDashboardPayload } from '@/lib/dashboards/payload'

export const GET = withAuth(async (_request, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    return apiForbidden('CEO dashboard is restricted to admins and executives')
  }
  const payload = await loadDashboardPayload('ceo', session.user.id)
  return apiSuccess(payload)
})
