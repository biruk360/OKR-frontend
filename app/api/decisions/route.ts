import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { createDecisionSchema, firstIssueMessage, listDecisionsQuerySchema } from '@/features/decisions/services/schemas'
import { createDecision, listDecisions } from '@/features/decisions/services/decisions.server'
import { decisionErrorResponse, readJsonBody } from '@/features/decisions/services/http.server'

/**
 * GET /api/decisions?status=&deciderId=(id|me)&affectingUserId=&requestedById=&batch=&timeframeId=&openAnyTimeframe=1&q=&limit=
 * DEC-1 (deciderId=me&status=OPEN → awaiting my decision), DEC-3 (affectingUserId).
 * Only decisions the viewer may view are returned, sorted by neededBy.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const params = new URL(request.url).searchParams
  const parsed = listDecisionsQuerySchema.safeParse({
    status: params.get('status'),
    deciderId: params.get('deciderId'),
    affectingUserId: params.get('affectingUserId'),
    requestedById: params.get('requestedById'),
    batch: params.get('batch'),
    timeframeId: params.get('timeframeId'),
    openAnyTimeframe: params.get('openAnyTimeframe'),
    q: params.get('q'),
    limit: params.get('limit'),
  })
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listDecisions(viewer, parsed.data))
  } catch (error) {
    return decisionErrorResponse(error)
  }
})

/** POST /api/decisions: request a decision (notifies the decider, DECISION_REQUESTED). */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createDecisionSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const decision = await createDecision(viewer, parsed.data)
    return apiSuccess(decision, { status: 201, message: 'Decision requested' })
  } catch (error) {
    return decisionErrorResponse(error)
  }
})
