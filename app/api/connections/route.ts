import { NextRequest } from 'next/server'
import { apiBadRequest, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { loadViewerContext } from '@/lib/okr/visibility-scope'
import { getConnections } from '@/lib/connections/service'
import { isConnectionEntityType } from '@/lib/connections/types'

/**
 * GET /api/connections?type=OBJECTIVE|KEY_RESULT|TODO|KPI|DUTY|DEVELOPMENT&id=
 * Everything for CON-1 chips / CON-2 panel in one call (lib/connections/service.ts).
 * 404 when the item does not exist or the viewer may not see it; linked items the
 * viewer may not see come back as `{ redacted: true }` (CON-8).
 */
export const GET = withAuth(async (req: NextRequest, { session }) => {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')
  if (!isConnectionEntityType(type) || !id) {
    return apiBadRequest('type (OBJECTIVE | KEY_RESULT | TODO | KPI | DUTY | DEVELOPMENT) and id are required')
  }
  if (session.user.userType === 'CLIENT_PORTAL') return apiNotFound('Item not found')

  const ctx = await loadViewerContext({ id: session.user.id, role: session.user.role })
  const payload = await getConnections(ctx, type, id, { userType: session.user.userType ?? null })
  if (!payload) return apiNotFound('Item not found')
  return apiSuccess(payload)
})
