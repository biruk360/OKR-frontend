import { NextRequest, NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/cron-auth'
import { handleApiError } from '@/lib/api/handleError'
import { runPruneNotifications } from '@/lib/notifications/jobs'
import { pruneRetainedTables } from '@/lib/retention/prune-tables'

/**
 * Nightly retention sweep (scheduled by scripts/install-crontab.sh, 00:45 UTC).
 *
 * 1. Notifications — the shared rule in lib/notifications/jobs.ts: unread rows
 *    older than 30 days are marked read, read rows older than 90 days deleted.
 *    (This route used to carry its own copy of that rule; `?job=prune-notifications`
 *    on /api/cron/notifications runs the same function, and install-crontab.sh
 *    migrates that older entry to this path so the work is not done twice.)
 * 2. Every other append-only table nothing else bounded — EmailDigestQueue,
 *    OutboundEmail, ClientErrorLog, TelegramMessage, AiGenerationLog,
 *    JiraSyncLog — via lib/retention/prune-tables.ts (batched deletes,
 *    per-table retention with env overrides; see that file).
 *
 * Idempotent: a re-run the same night finds nothing left to delete.
 */
// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (_request: NextRequest) => {
  try {
    const notifications = await runPruneNotifications()
    const tables = await pruneRetainedTables()
    return NextResponse.json({
      success: true,
      // Top-level keys kept for anything that read the old response shape.
      markedRead: notifications.markedRead,
      deleted: notifications.deleted,
      tables,
    })
  } catch (err) {
    return handleApiError(err, 'cron/prune-notifications')
  }
})

export const GET = POST
