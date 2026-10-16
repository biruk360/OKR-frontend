import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { withCronAuth } from '@/lib/cron-auth'
import { OdooSalesNotConfiguredError, runOdooSalesSync } from '@/lib/integrations/odoo-sales/sync.server'

/**
 * Odoo sales sync — 03:30 UTC (06:30 EAT), before Odoo's 07:30 sales brief.
 *
 * Reads Odoo CRM (read-only), writes `source = 'ODOO'` readings on the quota,
 * coverage and company-pace KPIs linked by scripts/link-odoo-sales-kpis.ts,
 * then POSTs the full target payload (okr-sales-targets/v1) to Odoo's webhook.
 * See lib/integrations/odoo-sales/sync.server.ts.
 *
 * `?dryRun=1` (or env ODOO_SALES_SYNC_DRY_RUN=1) computes everything and writes
 * and pushes nothing. Odoo not configured → 503 ODOO_NOT_CONFIGURED (fail closed).
 *
 * The response carries quota figures (sensitive, KPI-7): the crontab line
 * discards it (-o /dev/null) and the log line below holds counts only.
 *
 * Auth: withCronAuth (lib/cron-auth.ts) — Bearer $CRON_SECRET, fail-closed.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function handle(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  try {
    const result = await runOdooSalesSync({ dryRun })
    console.info(
      `[odoo-sales-sync] ok=${result.ok} dryRun=${result.dryRun} people=${result.people.length} ` +
        `unmatched=${result.unmatched.length} readings=${result.readings.created}+${result.readings.updated}~${result.readings.unchanged} ` +
        `pushed=${result.pushed} errors=${result.errors.length} ms=${result.durationMs}`,
    )
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof OdooSalesNotConfiguredError) {
      console.error('[odoo-sales-sync] Odoo not configured — nothing synced')
      return apiError(error.message, { status: 503, code: error.code })
    }
    throw error
  }
}

export const POST = withCronAuth(handle)
export const GET = POST
