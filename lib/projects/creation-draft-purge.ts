import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { deleteSecureProjectCreationUpload } from './creation-upload-security'

/**
 * Project-creation draft retention (requirements §9 "Drafts should expire after
 * a configurable retention period, initially 30 days. Expiry must delete or
 * anonymize source files"). `createProjectCreationDraft` stamps `expiresAt`;
 * this sweep, run daily by app/api/cron/project-creation-draft-purge, enforces it.
 *
 * Per expired draft:
 * - PROCESSING / COMMITTING drafts are skipped (a request may be mid-flight);
 *   the next run picks them up once they settle.
 * - Uncommitted drafts (DRAFT / READY / FAILED / EXPIRED) are deleted with
 *   their retained upload.
 * - COMMITTED drafts keep their row (provenance of the created project) but
 *   lose the retained source file; `sourceRef` and `expiresAt` are cleared so
 *   the row is never picked again.
 *
 * Idempotent and crash-safe: the file is removed first (a missing file is not
 * an error), then the row is changed with a conditional write that re-checks
 * id + version + expiry, so a draft edited or re-uploaded meanwhile is left
 * alone and a re-run after a crash simply finishes the job. Every purge is
 * audited (invariant #10) with actor = system.
 */

export const PROJECT_CREATION_DRAFT_PURGE_BATCH = 200
const IN_FLIGHT_STATUSES = ['PROCESSING', 'COMMITTING']

export interface PurgeDraftRow {
  id: string
  ownerUserId: string
  status: string
  version: number
  sourceMethod: string
  sourceRef: string | null
  expiresAt: Date | null
}

export interface DraftPurgeDb {
  projectCreationDraft: {
    findMany(args: any): Promise<PurgeDraftRow[]>
    deleteMany(args: any): Promise<{ count: number }>
    updateMany(args: any): Promise<{ count: number }>
  }
}

export interface DraftPurgeDeps {
  db?: DraftPurgeDb
  deleteFile?: (sourceRef: string) => Promise<void>
  audit?: typeof recordActivity
  now?: Date
  batchSize?: number
}

export interface DraftPurgeResult {
  scanned: number
  deleted: number
  filesRemoved: number
  committedScrubbed: number
  skipped: number
  failed: number
}

export async function purgeExpiredProjectCreationDrafts(deps: DraftPurgeDeps = {}): Promise<DraftPurgeResult> {
  const db = deps.db ?? (prisma as unknown as DraftPurgeDb)
  const deleteFile = deps.deleteFile ?? ((ref: string) => deleteSecureProjectCreationUpload(ref))
  const audit = deps.audit ?? recordActivity
  const now = deps.now ?? new Date()

  const rows = await db.projectCreationDraft.findMany({
    where: { expiresAt: { lte: now }, status: { notIn: IN_FLIGHT_STATUSES } },
    orderBy: { expiresAt: 'asc' },
    take: deps.batchSize ?? PROJECT_CREATION_DRAFT_PURGE_BATCH,
    select: { id: true, ownerUserId: true, status: true, version: true, sourceMethod: true, sourceRef: true, expiresAt: true },
  })

  const result: DraftPurgeResult = { scanned: rows.length, deleted: 0, filesRemoved: 0, committedScrubbed: 0, skipped: 0, failed: 0 }

  for (const row of rows) {
    try {
      if (row.sourceRef) {
        await deleteFile(row.sourceRef)
        result.filesRemoved++
      }
      const unchanged = { id: row.id, version: row.version, expiresAt: { lte: now }, status: row.status }
      const committed = row.status === 'COMMITTED'
      const write = committed
        ? await db.projectCreationDraft.updateMany({ where: unchanged, data: { sourceRef: null, expiresAt: null } })
        : await db.projectCreationDraft.deleteMany({ where: unchanged })
      if (write.count !== 1) {
        result.skipped++
        continue
      }
      if (committed) result.committedScrubbed++
      else result.deleted++
      await audit({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: committed ? 'UPDATED' : 'DELETED',
        actorId: null,
        metadata: {
          kind: 'RETENTION_EXPIRED',
          draftId: row.id,
          ownerUserId: row.ownerUserId,
          status: row.status,
          sourceMethod: row.sourceMethod,
          sourceFileRemoved: !!row.sourceRef,
          expiresAt: row.expiresAt?.toISOString() ?? null,
        },
      })
    } catch (error) {
      result.failed++
      console.error('[draft-purge] failed', row.id, error instanceof Error ? error.message : error)
    }
  }
  return result
}
