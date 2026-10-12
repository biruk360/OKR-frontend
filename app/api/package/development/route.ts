import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import {
  createDevelopmentItemSchema,
  firstIssueMessage,
  listDevelopmentQuerySchema,
} from '@/features/development-plan/services/schemas'
import { createDevelopmentItem, listDevelopmentItems } from '@/features/development-plan/services/development.server'
import { developmentErrorResponse, readJsonBody } from '@/features/development-plan/services/http.server'

/**
 * GET /api/package/development?userId=&timeframeId=
 * The person's development items for the timeframe (default: the widest active
 * one), the DEV-3 rule bars, counts and the viewer's permissions.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  const parsed = listDevelopmentQuerySchema.safeParse({
    userId: url.searchParams.get('userId') ?? '',
    timeframeId: url.searchParams.get('timeframeId'),
  })
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listDevelopmentItems(viewer, parsed.data.userId, parsed.data.timeframeId))
  } catch (error) {
    return developmentErrorResponse(error)
  }
})

/** POST /api/package/development — create an item (self, manager chain, dept lead, HR, Exec, Admin). */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createDevelopmentItemSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const item = await createDevelopmentItem(viewer, parsed.data)
    return apiSuccess(item, { status: 201, message: 'Development item created' })
  } catch (error) {
    return developmentErrorResponse(error)
  }
})
