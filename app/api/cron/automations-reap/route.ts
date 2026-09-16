import { NextRequest, NextResponse } from 'next/server'
import { reapExpiredLeases } from '@/lib/automations/service'

/**
 * Reclaim runs whose worker lease expired — a crashed or killed worker. Runs are
 * requeued up to MAX_RUN_ATTEMPTS, then failed explicitly so nothing sits in an
 * ambiguous state forever.
 *
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.
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
  return NextResponse.json({ success: true, ...(await reapExpiredLeases()) })
}

export const GET = POST
