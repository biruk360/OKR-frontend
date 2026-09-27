import { NextRequest, NextResponse } from 'next/server'
import { pruneAutomationHistory } from '@/lib/automations/service'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Nightly retention sweep for AI Automations: nulls old run transcripts and
 * deletes briefings past AutomationSettings.retentionDays.
 *
 * scripts/install-crontab.sh has scheduled this path at 03:30 since the module
 * shipped, but the route itself was never written — the entry had been curling a
 * 404 every night, so nothing was ever pruned.
 */
// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await pruneAutomationHistory()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
