import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, updateRoleDefinitionSchema } from '@/features/role-definition/services/schemas'
import {
  deleteRoleDefinition,
  getRoleDefinition,
  updateRoleDefinition,
} from '@/features/role-definition/services/role-definitions.server'
import { readJsonBody, roleDefinitionErrorResponse } from '@/features/role-definition/services/http.server'

/** GET /api/package/role-definitions/[id] — one version (any status). */
export const GET = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getRoleDefinition(viewer, id))
  } catch (error) {
    return roleDefinitionErrorResponse(error)
  }
})

/**
 * PATCH /api/package/role-definitions/[id] — update fields; `items`, when
 * sent, replaces the whole item list. Manager chain / HR / Exec / Admin, never self.
 */
export const PATCH = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const parsed = updateRoleDefinitionSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await updateRoleDefinition(viewer, id, parsed.data), { message: 'Role definition updated' })
    } catch (error) {
      return roleDefinitionErrorResponse(error)
    }
  },
)

/** DELETE /api/package/role-definitions/[id] — drafts only. */
export const DELETE = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await deleteRoleDefinition(viewer, id), { message: 'Draft deleted' })
  } catch (error) {
    return roleDefinitionErrorResponse(error)
  }
})
