import type { NextRequest } from 'next/server'
import { apiValidationError, withAuth } from '@/lib/api'
import { listKpiReadings, upsertKpiReading } from '@/features/kpis/services/kpis.server'
import { kpiReadingUpsertSchema } from '@/features/kpis/services/schemas'
import {
  apiSuccessWith,
  kpiErrorResponse,
  readJsonBody,
  rejectPortalSession,
  viewerOf,
} from '@/features/kpis/services/http.server'

/**
 * GET /api/package/kpis/[id]/readings → { success, data: KpiReadingView[] (newest first), kpi, enterablePeriods }
 * PUT /api/package/kpis/[id]/readings — upsert the reading for the period containing
 *     `period` (KPI-1: one per period, edits logged). Body: { period, value?, valueText?, rag?, note? }.
 *     `rag` is a manual RAG: managers may override a computed RAG; text-only KPIs take it
 *     from whoever enters the reading (KPI-6). Omit it to keep the current override.
 *     → { success, data: KpiReadingView, kpi: KpiView, created }
 */
type Params = { id: string }

export const GET = withAuth<Params>(async (_req: NextRequest, { session, params }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  try {
    const result = await listKpiReadings(viewerOf(session), params.id)
    return apiSuccessWith(result.data, { kpi: result.kpi, enterablePeriods: result.enterablePeriods })
  } catch (error) {
    return kpiErrorResponse(error)
  }
})

export const PUT = withAuth<Params>(async (req: NextRequest, { session, params }) => {
  const portal = rejectPortalSession(session)
  if (portal) return portal
  const parsed = kpiReadingUpsertSchema.safeParse(await readJsonBody(req))
  if (!parsed.success) return apiValidationError('Invalid reading', parsed.error.flatten())
  try {
    const result = await upsertKpiReading(viewerOf(session), params.id, parsed.data)
    return apiSuccessWith(result.reading, { kpi: result.kpi, created: result.created }, result.created ? 201 : 200)
  } catch (error) {
    return kpiErrorResponse(error)
  }
})
