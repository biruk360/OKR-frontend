import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import {
  createPackageSchema,
  firstIssueMessage,
  listPackageQuerySchema,
} from '@/features/operating-package/services/schemas'
import { createPackage, getPackageForUser } from '@/features/operating-package/services/packages.server'
import { packageErrorResponse, readJsonBody } from '@/features/operating-package/services/http.server'

/**
 * GET /api/package/packages?userId=&timeframeId=
 * The person's package header for the timeframe (null → "No package for this
 * timeframe", PKG-5), the PKG-2 review summary and the viewer's permissions.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  const parsed = listPackageQuerySchema.safeParse({
    userId: url.searchParams.get('userId') ?? '',
    timeframeId: url.searchParams.get('timeframeId') ?? '',
  })
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getPackageForUser(viewer, parsed.data.userId, parsed.data.timeframeId))
  } catch (error) {
    return packageErrorResponse(error)
  }
})

/**
 * POST /api/package/packages — create a DRAFT header for { userId, timeframeId }.
 * Manager chain / HR / Exec / Admin (package lifecycle); never the subject.
 */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createPackageSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const created = await createPackage(viewer, parsed.data)
    return apiSuccess(created, { status: 201, message: 'Operating package created' })
  } catch (error) {
    return packageErrorResponse(error)
  }
})
