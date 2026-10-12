import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { decideDecisionSchema, firstIssueMessage } from '@/features/decisions/services/schemas'
import { decideDecision } from '@/features/decisions/services/decisions.server'
import { decisionErrorResponse, readJsonBody } from '@/features/decisions/services/http.server'

/**
 * POST /api/decisions/[id]/decide  body: { decisionText, decidedAt?, closeDependencies? }
 * DEC-2: records the decision (status DECIDED, decidedAt, decidedById), closes
 * linked dependencies of type DECISION and notifies the requester and linked
 * users. DEC-4: decider, Executive or Admin only, with `button.decision.decide`.
 */
export const POST = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const parsed = decideDecisionSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const result = await decideDecision(viewer, id, parsed.data)
    return apiSuccess(result, { message: 'Decision recorded' })
  } catch (error) {
    return decisionErrorResponse(error)
  }
})
