import { apiSuccess, withAuth } from '@/lib/api'
import { computeOrgDiagnostics } from '@/lib/orgValidation'

/**
 * GET /api/org/diagnostics
 * Returns counts of org-structure gaps so the strategy map and admin pages
 * can surface "X users have no department", "Y departments have no head", etc.
 */
export const GET = withAuth(async () => {
  const diagnostics = await computeOrgDiagnostics()
  return apiSuccess(diagnostics)
})
