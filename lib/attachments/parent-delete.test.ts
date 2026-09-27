/**
 * Parent-delete cleanup (scrum updates, project activities) and the SCRUM
 * comment wiring.
 *
 * The purge runs against an in-memory stand-in for the one Prisma delegate it
 * touches; the route wiring is guarded at source level.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-3, CMP-3, CMP-5.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import path from 'path'
import {
  purgeCommentAttachmentsForEntity, purgeCommentAttachmentsAfterParentDelete,
  type ParentDeleteDb,
} from './parent-delete'

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

interface Row { id: string; storedName: string; commentType: string; entityId: string; commentId: string | null }

function fakeDb(rows: Row[]) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  const db: ParentDeleteDb = {
    commentAttachment: {
      async findMany({ where }) {
        return [...store.values()]
          .filter((r) => r.commentType === where.commentType && r.entityId === where.entityId)
          .map((r) => ({ id: r.id, storedName: r.storedName }))
      },
      async deleteMany({ where }) {
        let count = 0
        for (const id of where.id.in) if (store.delete(id)) count++
        return { count }
      },
    },
  }
  return { db, store }
}

test('purges claimed and staged rows of one parent, and only that parent', async () => {
  const { db, store } = fakeDb([
    { id: 'a', storedName: 'a.png', commentType: 'SCRUM', entityId: 'u1', commentId: 'c1' },
    { id: 'b', storedName: 'b.pdf', commentType: 'SCRUM', entityId: 'u1', commentId: null },
    { id: 'c', storedName: 'c.png', commentType: 'SCRUM', entityId: 'u2', commentId: 'c2' },
    { id: 'd', storedName: 'd.png', commentType: 'ACTIVITY', entityId: 'u1', commentId: 'c3' },
  ])
  const removed: string[] = []
  const result = await purgeCommentAttachmentsForEntity('SCRUM', 'u1', {
    db, removeFile: async (name) => { removed.push(name) },
  })
  assert.deepEqual(result, { rows: 2, files: 2 })
  assert.deepEqual(removed.sort(), ['a.png', 'b.pdf'])
  assert.deepEqual([...store.keys()].sort(), ['c', 'd'])
})

test('nothing to purge is a no-op', async () => {
  const { db } = fakeDb([])
  let called = false
  const result = await purgeCommentAttachmentsForEntity('ACTIVITY', 'x', { db, removeFile: async () => { called = true } })
  assert.deepEqual(result, { rows: 0, files: 0 })
  assert.equal(called, false)
})

test('the post-delete wrapper logs and never throws', async () => {
  const { db } = fakeDb([{ id: 'a', storedName: 'a', commentType: 'ACTIVITY', entityId: 'x', commentId: null }])
  const original = console.error
  let logged = false
  console.error = () => { logged = true }
  try {
    const result = await purgeCommentAttachmentsAfterParentDelete('ACTIVITY', 'x', {
      db, removeFile: async () => { throw new Error('disk gone') },
    })
    assert.equal(result, null)
    assert.equal(logged, true)
  } finally {
    console.error = original
  }
})

test('scrum draft and activity DELETE purge comment attachments only after the delete', () => {
  const scrum = read('app/api/scrum/updates/[id]/route.ts')
  const scrumDel = scrum.slice(scrum.indexOf('export const DELETE'))
  const discard = scrumDel.indexOf('discardScrumDraft(')
  const scrumPurge = scrumDel.indexOf("purgeCommentAttachmentsAfterParentDelete('SCRUM', params.id)")
  assert.ok(discard > 0 && scrumPurge > discard, 'discard → purge')
  assert.match(scrumDel, /if \(.deleted. in result && result\.deleted\) await purgeCommentAttachmentsAfterParentDelete/)

  const act = read('app/api/projects/[id]/activities/[activityId]/route.ts')
  const actDel = act.slice(act.indexOf('export const DELETE'))
  const remove = actDel.indexOf('tx.activity.delete(')
  const actPurge = actDel.indexOf('purgeCommentAttachmentsAfterParentDelete(ACTIVITY_COMMENT_TYPE, params.activityId)')
  assert.ok(remove > 0 && actPurge > remove, 'delete → purge')
})

test('scrum comments claim on post, return files per comment, and the composer stages on the update', () => {
  const route = read('app/api/scrum/updates/[id]/comments/route.ts')
  assert.match(route, /claimAttachments\(\{[\s\S]*commentType: SCRUM_COMMENT_TYPE[\s\S]*entityId: params\.id[\s\S]*uploaderId: session\.user\.id/)
  assert.match(route, /attachmentsForComments\(SCRUM_COMMENT_TYPE, comments\.map\(\(c\) => c\.id\), \{ entityId: params\.id \}\)/)
  // Drafts still have no thread.
  assert.match(route, /isScrumDraft\(update\.status\)/)
  const card = read('features/scrum/components/ScrumUpdateCard.tsx')
  assert.match(card, /<AttachmentPicker[\s\S]*scope="SCRUM"[\s\S]*entityId=\{updateId\}/)
  assert.match(card, /attachmentIds: staged\.map/)
  assert.match(card, /<AttachmentList attachments=/)
})
