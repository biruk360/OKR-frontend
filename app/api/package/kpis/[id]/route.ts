import type { NextRequest } from 'next/server'
import { apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getKpi, retireKpi, updateKpi } from '@/features/kpis/services/kpis.server'
import { kpiUpdateSchema } from '@/features/kpis/services/schemas'
import { kpiErrorResponse, readJsonBody, rejectPortalSession, viewerOf } from '@/features/kpis/services/http.server'

/**
 * GET    /api/package/kpis/[id] — one KPI with card figures (404 when hidden, incl. sensitive).
 * PATCH  /api/package/kpis/[id] — edit the definition (or status ACTIVE/RETIRED).
 * DELETE /api/package/kpis/[id] — retire (status RETIRED; readings are kept).
 */
type Params = { id: string }

export const GET = withAuth<Params>(async (_req: NextRequest, { session, params }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  try {
    return apiSuccess(await getKpi(viewerOf(session), params.id))
  } catch (error) {
    return kpiErrorResponse(error)
  }
})

export const PATCH = withAuth<Params>(async (req: NextRequest, { session, params }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  const parsed = kpiUpdateSchema.safeParse(await readJsonBody(req))
  if (!parsed.success) return apiValidationError('Invalid KPI update', parsed.error.flatten())
  try {
    return apiSuccess(await updateKpi(viewerOf(session), params.id, parsed.data))
  } catch (error) {
    return kpiErrorResponse(error)
  }
})

export const DELETE = withAuth<Params>(async (_req: NextRequest, { session, params }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  try {
    return apiSuccess(await retireKpi(viewerOf(session), params.id), { message: 'KPI retired' })
  } catch (error) {
    return kpiErrorResponse(error)
  }
})
