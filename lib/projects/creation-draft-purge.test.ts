import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { purgeExpiredProjectCreationDrafts, type DraftPurgeDb, type PurgeDraftRow } from './creation-draft-purge'

const ROOT = join(__dirname, '..', '..')
const NOW = new Date('2026-09-25T02:00:00Z')
const PAST = new Date('2026-09-01T00:00:00Z')
const FUTURE = new Date('2026-10-20T00:00:00Z')

function draft(over: Partial<PurgeDraftRow>): PurgeDraftRow {
  return { id: 'd', ownerUserId: 'u1', status: 'DRAFT', version: 1, sourceMethod: 'FILE_IMPORT', sourceRef: null, expiresAt: PAST, ...over }
}

function harness(seed: PurgeDraftRow[]) {
  const rows = seed.map((r) => ({ ...r }))
  const deletedFiles: string[] = []
  const audits: any[] = []
  const matches = (row: PurgeDraftRow, where: any) =>
    row.id === where.id && row.version === where.version && row.status === where.status &&
    !!row.expiresAt && row.expiresAt.getTime() <= where.expiresAt.lte.getTime()
  const db: DraftPurgeDb = {
    projectCreationDraft: {
      findMany: async ({ where, take }: any) => rows
        .filter((r) => r.expiresAt && r.expiresAt.getTime() <= where.expiresAt.lte.getTime() && !where.status.notIn.includes(r.status))
        .slice(0, take)
        .map((r) => ({ ...r })),
      deleteMany: async ({ where }: any) => {
        const i = rows.findIndex((r) => matches(r, where))
        if (i < 0) return { count: 0 }
        rows.splice(i, 1)
        return { count: 1 }
      },
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((r) => matches(r, where))
        if (!row) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    },
  }
  const deps = {
    db,
    now: NOW,
    deleteFile: async (ref: string) => { deletedFiles.push(ref) },
    audit: (async (entry: any) => { audits.push(entry) }) as any,
  }
  return { rows, deletedFiles, audits, deps }
}

test('purge: deletes expired uncommitted drafts and their retained uploads, leaves live and in-flight drafts', async () => {
  const h = harness([
    draft({ id: 'expired-draft', sourceRef: 'v1/u1/aaa.xlsx' }),
    draft({ id: 'expired-failed', status: 'FAILED' }),
    draft({ id: 'live', expiresAt: FUTURE, sourceRef: 'v1/u1/live.csv' }),
    draft({ id: 'processing', status: 'PROCESSING', sourceRef: 'v1/u1/p.docx' }),
    draft({ id: 'committing', status: 'COMMITTING' }),
    draft({ id: 'no-expiry', expiresAt: null }),
  ])
  const result = await purgeExpiredProjectCreationDrafts(h.deps)
  assert.deepEqual(result, { scanned: 2, deleted: 2, filesRemoved: 1, committedScrubbed: 0, skipped: 0, failed: 0 })
  assert.deepEqual(h.rows.map((r) => r.id).sort(), ['committing', 'live', 'no-expiry', 'processing'])
  assert.deepEqual(h.deletedFiles, ['v1/u1/aaa.xlsx'])
  assert.equal(h.audits.length, 2)
  assert.equal(h.audits[0].entityType, 'PROJECT_CREATION_DRAFT')
  assert.equal(h.audits[0].action, 'DELETED')
  assert.equal(h.audits[0].actorId, null)
  assert.equal(h.audits[0].metadata.kind, 'RETENTION_EXPIRED')
})

test('purge: committed drafts keep their row (provenance) but lose the source file and leave the queue', async () => {
  const h = harness([draft({ id: 'done', status: 'COMMITTED', sourceRef: 'v1/u1/done.xlsx' })])
  const result = await purgeExpiredProjectCreationDrafts(h.deps)
  assert.equal(result.committedScrubbed, 1)
  assert.equal(h.rows.length, 1)
  assert.equal(h.rows[0].sourceRef, null)
  assert.equal(h.rows[0].expiresAt, null)
  assert.equal(h.audits[0].action, 'UPDATED')
})

test('purge: idempotent — a second run finds nothing to do', async () => {
  const h = harness([draft({ id: 'a', sourceRef: 'v1/u1/a.csv' }), draft({ id: 'b', status: 'COMMITTED', sourceRef: 'v1/u1/b.csv' })])
  await purgeExpiredProjectCreationDrafts(h.deps)
  const again = await purgeExpiredProjectCreationDrafts(h.deps)
  assert.deepEqual(again, { scanned: 0, deleted: 0, filesRemoved: 0, committedScrubbed: 0, skipped: 0, failed: 0 })
  assert.equal(h.audits.length, 2)
})

test('purge: a draft changed between read and write is skipped, not clobbered', async () => {
  const h = harness([draft({ id: 'raced', version: 3 })])
  const findMany = h.deps.db.projectCreationDraft.findMany
  h.deps.db.projectCreationDraft.findMany = async (args: any) => {
    const found = await findMany(args)
    h.rows[0].version = 4 // the owner saved meanwhile
    return found
  }
  const result = await purgeExpiredProjectCreationDrafts(h.deps)
  assert.equal(result.skipped, 1)
  assert.equal(h.rows.length, 1)
  assert.equal(h.audits.length, 0)
})

test('purge: one failing file delete does not stop the batch', async () => {
  const h = harness([draft({ id: 'bad', sourceRef: 'v1/u1/bad.csv' }), draft({ id: 'good', sourceRef: 'v1/u1/good.csv' })])
  h.deps.deleteFile = async (ref: string) => {
    if (ref.includes('bad')) throw new Error('EACCES')
    h.deletedFiles.push(ref)
  }
  const result = await purgeExpiredProjectCreationDrafts(h.deps)
  assert.equal(result.failed, 1)
  assert.equal(result.deleted, 1)
  assert.deepEqual(h.rows.map((r) => r.id), ['bad'])
})

test('cron route: header-authenticated via withCronAuth, no query parameters', () => {
  const src = readFileSync(join(ROOT, 'app/api/cron/project-creation-draft-purge/route.ts'), 'utf8')
  assert.match(src, /import \{ withCronAuth \} from '@\/lib\/cron-auth'/)
  assert.match(src, /export const POST = withCronAuth\(/)
  assert.match(src, /purgeExpiredProjectCreationDrafts\(\)/)
  assert.doesNotMatch(src, /searchParams|dryRun|dry-run/)
})
