import type { NextRequest } from 'next/server'
import { apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { createKpi, listKpis } from '@/features/kpis/services/kpis.server'
import { kpiCreateSchema } from '@/features/kpis/services/schemas'
import {
  apiSuccessWith,
  kpiErrorResponse,
  readJsonBody,
  rejectPortalSession,
  viewerOf,
} from '@/features/kpis/services/http.server'

/**
 * GET  /api/package/kpis?userId=&timeframeId=&includeRetired=1
 *      → { success, data: KpiView[], permissions, timeframe }. userId defaults to
 *      the viewer, timeframeId to the default (active) timeframe. Sensitive KPIs
 *      are left out unless the viewer holds the 'kpis_sensitive' area (KPI-7).
 * POST /api/package/kpis — define a KPI for a person (§8 'kpis' edit).
 * Logic: features/kpis/services/kpis.server.ts.
 */
export const GET = withAuth(async (req: NextRequest, { session }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  const { searchParams } = new URL(req.url)
  try {
    const result = await listKpis(viewerOf(session), {
      userId: searchParams.get('userId') || session.user.id,
      timeframeId: searchParams.get('timeframeId') || null,
      includeRetired: searchParams.get('includeRetired') === '1' || searchParams.get('includeRetired') === 'true',
    })
    return apiSuccessWith(result.data, { permissions: result.permissions, timeframe: result.timeframe })
  } catch (error) {
    return kpiErrorResponse(error)
  }
})

export const POST = withAuth(async (req: NextRequest, { session }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  const parsed = kpiCreateSchema.safeParse(await readJsonBody(req))
  if (!parsed.success) return apiValidationError('Invalid KPI', parsed.error.flatten())
  try {
    return apiSuccess(await createKpi(viewerOf(session), parsed.data), { status: 201 })
  } catch (error) {
    return kpiErrorResponse(error)
  }
})
