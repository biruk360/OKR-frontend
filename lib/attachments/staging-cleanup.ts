/**
 * Sweep abandoned staged comment uploads.
 *
 * A file is uploaded the moment it is picked (CMP-2) and sits on a
 * `CommentAttachment` row with `commentId = null` until the comment is posted.
 * A composer closed without posting — tab closed, navigation, a failed
 * `DELETE /api/comment-attachments` — leaves that row and its bytes behind for
 * ever. This deletes staged rows older than the TTL, then their files.
 *
 * Safe against a concurrent post: the row delete re-asserts `commentId: null`,
 * and a file is removed only for a row that is actually gone afterwards, so a
 * draft claimed between the scan and the delete keeps its row and its bytes.
 * Idempotent — a re-run finds nothing left. Bounded per run (maxBatches ×
 * batchSize); anything over the cap is picked up the next night.
 *
 * Scheduled daily by scripts/install-crontab.sh →
 * /api/cron/attachment-staging-cleanup. Spec: comment_attachments CMP-3.
 */

import { prisma } from '@/lib/prisma'
import { deleteFile } from './storage'

/** Staged uploads older than this are treated as abandoned. */
export const STAGED_ATTACHMENT_TTL_HOURS = 24
export const STAGED_CLEANUP_BATCH_SIZE = 200
export const STAGED_CLEANUP_MAX_BATCHES = 50

interface StagedRow { id: string; storedName: string }

/** The slice of Prisma the sweep touches — injectable so the batching is unit-tested. */
export interface StagedCleanupDb {
  commentAttachment: {
    findMany(args: {
      where: { commentId?: null; createdAt?: { lt: Date }; id?: { in: string[] } }
      orderBy?: { createdAt: 'asc' }
      take?: number
      select: { id: true; storedName?: true }
    }): Promise<Array<{ id: string; storedName?: string }>>
    deleteMany(args: { where: { id: { in: string[] }; commentId: null } }): Promise<{ count: number }>
  }
}

export interface StagedCleanupResult {
  cutoff: string
  batches: number
  scanned: number
  deletedRows: number
  deletedFiles: number
  /** Rows claimed by a post between the scan and the delete — kept. */
  skippedClaimed: number
  /** True when the per-run cap was hit and more may remain. */
  capped: boolean
}

export function stagedCleanupCutoff(now: Date, ttlHours = STAGED_ATTACHMENT_TTL_HOURS): Date {
  return new Date(now.getTime() - ttlHours * 60 * 60 * 1000)
}

export async function sweepAbandonedStagedAttachments(opts: {
  now?: Date
  ttlHours?: number
  batchSize?: number
  maxBatches?: number
  db?: StagedCleanupDb
  removeFile?: (storedName: string) => Promise<void>
} = {}): Promise<StagedCleanupResult> {
  const db = opts.db ?? (prisma as unknown as StagedCleanupDb)
  const removeFile = opts.removeFile ?? deleteFile
  const batchSize = Math.max(1, opts.batchSize ?? STAGED_CLEANUP_BATCH_SIZE)
  const maxBatches = Math.max(1, opts.maxBatches ?? STAGED_CLEANUP_MAX_BATCHES)
  const cutoff = stagedCleanupCutoff(opts.now ?? new Date(), opts.ttlHours)

  const result: StagedCleanupResult = {
    cutoff: cutoff.toISOString(), batches: 0, scanned: 0,
    deletedRows: 0, deletedFiles: 0, skippedClaimed: 0, capped: false,
  }

  while (result.batches < maxBatches) {
    const rows = (await db.commentAttachment.findMany({
      where: { commentId: null, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      select: { id: true, storedName: true },
    })) as StagedRow[]
    if (rows.length === 0) break
    result.batches++
    result.scanned += rows.length

    const ids = rows.map((r) => r.id)
    const { count } = await db.commentAttachment.deleteMany({ where: { id: { in: ids }, commentId: null } })
    result.deletedRows += count

    // Anything still present was claimed in the meantime — its bytes stay.
    const survivors = count === ids.length
      ? new Set<string>()
      : new Set((await db.commentAttachment.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id))
    result.skippedClaimed += survivors.size

    for (const row of rows) {
      if (survivors.has(row.id)) continue
      await removeFile(row.storedName)
      result.deletedFiles++
    }

    if (rows.length < batchSize) break
    if (result.batches >= maxBatches) result.capped = true
  }

  return result
}
