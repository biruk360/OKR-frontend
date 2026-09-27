import { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api'
import { withCronAuth } from '@/lib/cron-auth'
import { handleApiError } from '@/lib/api/handleError'
import { sweepAbandonedStagedAttachments } from '@/lib/attachments/staging-cleanup'

/**
 * Daily sweep of abandoned staged comment uploads (lib/attachments/staging-cleanup.ts):
 * `CommentAttachment` rows never claimed by a posted comment and older than
 * 24h are deleted, then their files. Batched, race-safe against a concurrent
 * post, idempotent. Header-authenticated only (`Authorization: Bearer
 * $CRON_SECRET`) and takes no parameters. Scheduled by scripts/install-crontab.sh.
 */
export const POST = withCronAuth(async (_request: NextRequest) => {
  try {
    const result = await sweepAbandonedStagedAttachments()
    console.info('[cron/attachment-staging-cleanup]', JSON.stringify(result))
    return apiSuccess(result)
  } catch (err) {
    return handleApiError(err, 'cron/attachment-staging-cleanup')
  }
})

export const GET = POST
