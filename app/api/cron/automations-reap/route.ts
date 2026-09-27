import { NextRequest, NextResponse } from 'next/server'
import { reapExpiredLeases } from '@/lib/automations/service'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Reclaim runs whose worker lease expired — a crashed or killed worker. Runs are
 * requeued up to MAX_RUN_ATTEMPTS, then failed explicitly so nothing sits in an
 * ambiguous state forever.
 *
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.
 */
// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  return NextResponse.json({ success: true, ...(await reapExpiredLeases()) })
})

export const GET = POST
