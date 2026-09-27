/**
 * Abandoned staged-upload sweep, to-do delete cleanup, and the ACTIVITY /
 * SCRUM attachment scopes.
 *
 * The sweep is exercised against an in-memory stand-in for the one Prisma
 * delegate it touches; the rest are source-level guardrails on wiring that
 * spans files (cron route + crontab + docs, the to-do DELETE ordering, the
 * scope rules and the portal's internal-only boundary).
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md CMP-3, ATT-3, A4.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import {
  sweepAbandonedStagedAttachments, stagedCleanupCutoff, STAGED_ATTACHMENT_TTL_HOURS,
  type StagedCleanupDb,
} from './staging-cleanup'

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

interface Row { id: string; storedName: string; commentId: string | null; createdAt: Date }

const NOW = new Date('2026-09-25T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

function fakeDb(rows: Row[], hooks: { beforeDelete?: (ids: string[]) => void } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  const db: StagedCleanupDb = {
    commentAttachment: {
      async findMany({ where, take }) {
        let list = [...store.values()]
        if (where.id) list = list.filter((r) => where.id!.in.includes(r.id))
        if ('commentId' in where) list = list.filter((r) => r.commentId === null)
        if (where.createdAt) list = list.filter((r) => r.createdAt < where.createdAt!.lt)
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        return list.slice(0, take ?? list.length).map((r) => ({ id: r.id, storedName: r.storedName }))
      },
      async deleteMany({ where }) {
        hooks.beforeDelete?.(where.id.in)
        let count = 0
        for (const id of where.id.in) {
          const r = store.get(id)
          if (r && r.commentId === null) { store.delete(id); count++ }
        }
        return { count }
      },
    },
  }
  return { db, store }
}

test('cutoff is TTL hours before now (24h by default)', () => {
  assert.equal(STAGED_ATTACHMENT_TTL_HOURS, 24)
  assert.equal(stagedCleanupCutoff(NOW).toISOString(), '2026-09-24T12:00:00.000Z')
})

test('sweep deletes only unclaimed rows older than the TTL, row and file, in batches', async () => {
  const rows: Row[] = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `old${i}`, storedName: `old${i}.png`, commentId: null, createdAt: hoursAgo(30 + i) })),
    { id: 'fresh', storedName: 'fresh.png', commentId: null, createdAt: hoursAgo(2) },
    { id: 'claimed', storedName: 'claimed.png', commentId: 'c1', createdAt: hoursAgo(100) },
  ]
  const { db, store } = fakeDb(rows)
  const removed: string[] = []
  const result = await sweepAbandonedStagedAttachments({ now: NOW, db, batchSize: 2, removeFile: async (n) => { removed.push(n) } })

  assert.equal(result.deletedRows, 5)
  assert.equal(result.deletedFiles, 5)
  assert.equal(result.batches, 3)
  assert.equal(result.capped, false)
  assert.deepEqual([...store.keys()].sort(), ['claimed', 'fresh'])
  assert.deepEqual(removed.sort(), ['old0.png', 'old1.png', 'old2.png', 'old3.png', 'old4.png'])

  // Idempotent: nothing left the second time.
  const again = await sweepAbandonedStagedAttachments({ now: NOW, db, batchSize: 2, removeFile: async () => {} })
  assert.equal(again.deletedRows, 0)
  assert.equal(again.batches, 0)
})

test('a draft claimed between scan and delete keeps its row and its bytes', async () => {
  const rows: Row[] = [
    { id: 'a', storedName: 'a.png', commentId: null, createdAt: hoursAgo(48) },
    { id: 'b', storedName: 'b.png', commentId: null, createdAt: hoursAgo(47) },
  ]
  let store: Map<string, Row> | null = null
  const fake = fakeDb(rows, { beforeDelete: () => { store!.get('b')!.commentId = 'posted' } })
  store = fake.store
  const removed: string[] = []
  const result = await sweepAbandonedStagedAttachments({ now: NOW, db: fake.db, removeFile: async (n) => { removed.push(n) } })
  assert.equal(result.deletedRows, 1)
  assert.equal(result.skippedClaimed, 1)
  assert.deepEqual(removed, ['a.png'])
  assert.ok(fake.store.has('b'))
})

test('the per-run cap stops the sweep and reports it', async () => {
  const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, storedName: `r${i}`, commentId: null, createdAt: hoursAgo(50 + i) }))
  const { db, store } = fakeDb(rows)
  const result = await sweepAbandonedStagedAttachments({ now: NOW, db, batchSize: 2, maxBatches: 2, removeFile: async () => {} })
  assert.equal(result.deletedRows, 4)
  assert.equal(result.capped, true)
  assert.equal(store.size, 2)
})

test('the sweep is a cron route behind withCronAuth, scheduled and documented', () => {
  const route = read('app/api/cron/attachment-staging-cleanup/route.ts')
  assert.match(route, /import \{ withCronAuth \} from '@\/lib\/cron-auth'/)
  assert.match(route, /export const POST = withCronAuth\(/)
  assert.match(route, /export const GET = POST/)
  assert.match(route, /sweepAbandonedStagedAttachments\(\)/)
  assert.match(read('scripts/install-crontab.sh'), /add attachment-staging-cleanup +"[^"]+" +"\/api\/cron\/attachment-staging-cleanup"/)
  assert.match(read('docs/CRON.md'), /`\/api\/cron\/attachment-staging-cleanup`/)
})

test('deleting a to-do snapshots card files first and purges attachments only after the delete', () => {
  const src = read('app/api/todos/[id]/route.ts')
  const del = src.slice(src.indexOf('export const DELETE'))
  const snap = del.indexOf('snapshotTodoAttachmentFiles(todoId)')
  const remove = del.indexOf('prisma.todo.delete(')
  const purge = del.indexOf('purgeDeletedTodoAttachments(todoId')
  assert.ok(snap > 0 && remove > snap && purge > remove, 'snapshot → delete → purge')
  // The permission check still precedes all of it.
  assert.ok(del.indexOf('if (!hasAccess)') < snap)

  const lib = read('lib/attachments/todo-delete.ts')
  // Staged and claimed alike: the card id is the entity, no commentId filter.
  assert.match(lib, /where: \{ commentType: TODO_COMMENT_TYPE, entityId: todoId \}/)
  assert.match(lib, /deleteTodoFile\(/)
  assert.match(lib, /deleteFile\(/)
})

test('ACTIVITY scope reuses the project reader; SCRUM reuses the scrum update rule', () => {
  const lib = read('lib/attachments/access.ts')
  const activity = lib.slice(lib.indexOf("case 'ACTIVITY':"), lib.indexOf("case 'SCRUM':"))
  assert.match(activity, /getReadableProject\(/)
  assert.match(activity, /milestone: \{ select: \{ phase: \{ select: \{ projectId: true \} \} \} \}/)
  const scrum = lib.slice(lib.indexOf("case 'SCRUM':"), lib.indexOf('default:'))
  assert.match(scrum, /canViewScrumUser\(/)
  assert.match(scrum, /isScrumDraft\(/)
  // Portal sessions never reach any scope.
  assert.match(lib, /if \(actor\.userType === 'CLIENT_PORTAL'\) return false/)
})

test('activity comment routes claim, render and delete attachments on the shared path', () => {
  const list = read('app/api/projects/[id]/activities/[activityId]/comments/route.ts')
  assert.match(list, /claimAttachments\(\{[\s\S]*commentType: ACTIVITY_COMMENT_TYPE[\s\S]*entityId: params\.activityId[\s\S]*uploaderId: session\.user\.id/)
  assert.match(list, /withActivityCommentAttachments\(/)
  const item = read('app/api/projects/[id]/activities/[activityId]/comments/[commentId]/route.ts')
  assert.match(item, /deleteAttachmentsForComment\(ACTIVITY_COMMENT_TYPE, params\.commentId\)/)
  const panel = read('features/projects/components/activity/ActivityDetailPanel.tsx')
  assert.match(panel, /<AttachmentPicker[\s\S]*scope="ACTIVITY"/)
  assert.match(panel, /attachmentIds: stagedAttachments\.map/)
})

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

test('invariant 5: no portal code reads comment attachments (they are internal-only)', () => {
  const portal = [
    ...sourceFiles(path.join(ROOT, 'app', 'api', 'portal')),
    ...sourceFiles(path.join(ROOT, 'app', 'portal')),
    path.join(ROOT, 'features', 'projects', 'services', 'portal-pages.server.ts'),
  ]
  const offenders = portal
    .filter((f) => /commentAttachment|withActivityCommentAttachments|attachmentsForComments|comment-attachments/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f))
  assert.deepEqual(offenders, [], `portal files touching comment attachments: ${offenders.join(', ')}`)
})
