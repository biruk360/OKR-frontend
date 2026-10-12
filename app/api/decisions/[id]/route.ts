import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, updateDecisionSchema } from '@/features/decisions/services/schemas'
import { getDecision, updateDecision } from '@/features/decisions/services/decisions.server'
import { decisionErrorResponse, readJsonBody } from '@/features/decisions/services/http.server'

/** GET /api/decisions/[id]: decision, resolved links, waiting dependencies and the viewer's access. */
export const GET = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getDecision(viewer, id))
  } catch (error) {
    return decisionErrorResponse(error)
  }
})

/**
 * PATCH /api/decisions/[id]: edit the request (requester / decider / Exec /
 * Admin), reassign the decider, change status (OPEN / DEFERRED / WITHDRAWN) or
 * correct a recorded decision's text (decider / Exec / Admin, DEC-4).
 */
export const PATCH = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const parsed = updateDecisionSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await updateDecision(viewer, id, parsed.data), { message: 'Decision updated' })
  } catch (error) {
    return decisionErrorResponse(error)
  }
})
