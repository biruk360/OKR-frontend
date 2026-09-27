import { apiSuccess } from '@/lib/api'
import { withCronAuth } from '@/lib/cron-auth'
import { purgeExpiredProjectCreationDrafts } from '@/lib/projects/creation-draft-purge'

/**
 * Daily retention sweep for project-creation drafts (lib/projects/creation-draft-purge.ts):
 * deletes expired uncommitted drafts and every expired draft's retained upload.
 * Header-authenticated only (`Authorization: Bearer $CRON_SECRET`); it takes no
 * query parameters — there is deliberately no preview or override switch — and
 * is idempotent, so a retry or overlapping run is harmless. Scheduled by
 * scripts/install-crontab.sh.
 */
export const POST = withCronAuth(async () => apiSuccess(await purgeExpiredProjectCreationDrafts()))

export const GET = POST
