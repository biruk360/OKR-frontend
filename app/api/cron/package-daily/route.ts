import { NextRequest, NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/cron-auth'
import { runPackageDaily } from '@/lib/package-cron/runner'

/**
 * Employee Operating Package daily job (§9) — 02:00 UTC (05:00 EAT).
 *
 *   KPI-3  auto-fills `source = KR` readings from the linked KR for the period
 *          that just ended (never overwrites a reading)
 *   KPI-5  KPI_READING_DUE           once per overdue period
 *   DEP-2  DEPENDENCY_DUE_SOON (7 d) once per needed-by date
 *          DEPENDENCY_LATE           first day late, then weekly
 *   DEV-4  DEV_ITEM_DUE (14 d)       once per due date
 *          KR_CHECKPOINT_DUE (7 d)   once per checkpoint due date
 *
 * Idempotent: a re-run on the same day sends nothing new (lib/package-cron).
 * `?dryRun=1` reports what would be filled and sent without writing anything.
 *
 * Auth: withCronAuth (lib/cron-auth.ts) — Bearer $CRON_SECRET, fail-closed.
 */
async function handle(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  const result = await runPackageDaily({ dryRun })
  return NextResponse.json({ success: true, data: result })
}

export const POST = withCronAuth(handle)
export const GET = POST
