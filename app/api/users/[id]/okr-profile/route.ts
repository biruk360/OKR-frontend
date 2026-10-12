import type { NextRequest } from 'next/server'
import { apiError, apiForbidden, apiNotFound, apiSuccess, apiValidationError, handleApiError, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { isClientPortalUser } from '@/lib/todos/visibility'
import { loadOkrProfile, OkrProfileError } from '@/features/employee-profile/components/okr-profile/okr-profile.server'
import { okrProfileQuerySchema } from '@/features/employee-profile/components/okr-profile/schemas'

/**
 * GET /api/users/[id]/okr-profile?timeframeId=
 * The employee OKR profile (PRF-7…11): header strip, the Objective → KR →
 * milestones / tasks tree with duty rows, blocked flags and action verdicts, and
 * Past OKRs with successors. Every signed-in user may read a person's OKRs
 * (§8 footnote ²); private items are redacted per lib/okr/visibility-scope.ts.
 * Omitted `timeframeId` → the default (active) timeframe.
 */
export const GET = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (isClientPortalUser(session.user)) return apiForbidden('Forbidden')
  const { id } = await resolveParams(params)
  if (!id) return apiNotFound('User not found')

  const parsed = okrProfileQuerySchema.safeParse({
    timeframeId: new URL(request.url).searchParams.get('timeframeId') || undefined,
  })
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? 'Invalid query', parsed.error.issues)

  try {
    const payload = await loadOkrProfile({ id: session.user.id, role: session.user.role }, id, {
      timeframeId: parsed.data.timeframeId ?? null,
    })
    if (!payload) return apiNotFound('User not found')
    return apiSuccess(payload)
  } catch (error) {
    if (error instanceof OkrProfileError) return apiError(error.message, { status: error.status })
    return handleApiError(error)
  }
})
