import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import {
  createRoleDefinitionSchema,
  firstIssueMessage,
  listRoleDefinitionsQuerySchema,
} from '@/features/role-definition/services/schemas'
import { createRoleDefinition, listRoleDefinitions } from '@/features/role-definition/services/role-definitions.server'
import { readJsonBody, roleDefinitionErrorResponse } from '@/features/role-definition/services/http.server'

/**
 * GET /api/package/role-definitions?userId=&timeframeId=
 * Current version for the timeframe, pending draft, full version history,
 * ROL-3 reporting-line check, ROL-4 seats and the viewer's permissions.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  const parsed = listRoleDefinitionsQuerySchema.safeParse({
    userId: url.searchParams.get('userId') ?? '',
    timeframeId: url.searchParams.get('timeframeId'),
  })
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listRoleDefinitions(viewer, parsed.data.userId, parsed.data.timeframeId))
  } catch (error) {
    return roleDefinitionErrorResponse(error)
  }
})

/** POST /api/package/role-definitions — create a DRAFT (first version or a new version). */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createRoleDefinitionSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const definition = await createRoleDefinition(viewer, parsed.data)
    return apiSuccess(definition, { status: 201, message: 'Role definition created' })
  } catch (error) {
    return roleDefinitionErrorResponse(error)
  }
})
