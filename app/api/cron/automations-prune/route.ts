import { NextRequest, NextResponse } from 'next/server'
import { pruneAutomationHistory } from '@/lib/automations/service'

/**
 * Nightly retention sweep for AI Automations: nulls old run transcripts and
 * deletes briefings past AutomationSettings.retentionDays.
 *
 * scripts/install-crontab.sh has scheduled this path at 03:30 since the module
 * shipped, but the route itself was never written — the entry had been curling a
 * 404 every night, so nothing was ever pruned.
 */
function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace(/^Bearer\s+/i, '') || new URL(request.url).searchParams.get('key') || ''
  return key === expected
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const result = await pruneAutomationHistory()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
