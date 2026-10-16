import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { withIntegrationKey } from '@/lib/integration-auth'
import { getSalesTargetsPayload } from '@/lib/integrations/odoo-sales/targets.server'

/**
 * GET /api/integrations/odoo/sales-targets — the okr-sales-targets/v1 payload
 * (without `secret`) plus `generatedAt`, for verification and other consumers.
 * Read-only: built from the OKR database (latest Odoo-synced readings); it never
 * writes and never calls Odoo.
 *
 * Auth: withIntegrationKey (lib/integration-auth.ts) — `x-integration-key`
 * header only, constant-time compare, 503 when INTEGRATION_API_KEY is unset.
 * Quotas are sensitive (KPI-7): neither the key nor the payload is logged, and
 * the response is never cached.
 */
export const dynamic = 'force-dynamic'

export const GET = withIntegrationKey(async () => {
  const payload = await getSalesTargetsPayload()
  if (!payload) return apiError('No active timeframe', { status: 404, code: 'NOT_FOUND' })
  return NextResponse.json({ success: true, data: payload }, { headers: { 'Cache-Control': 'no-store' } })
})
