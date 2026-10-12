import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { addDevelopmentHoursSchema, firstIssueMessage } from '@/features/development-plan/services/schemas'
import { addDevelopmentHours } from '@/features/development-plan/services/development.server'
import { developmentErrorResponse, readJsonBody } from '@/features/development-plan/services/http.server'

/** POST /api/package/development/[id]/hours — add training hours `{ hours, note?, date? }`. */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const parsed = addDevelopmentHoursSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await addDevelopmentHours(viewer, id, parsed.data), { status: 201, message: 'Hours logged' })
    } catch (error) {
      return developmentErrorResponse(error)
    }
  },
)
