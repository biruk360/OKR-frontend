/**
 * Card comment attachments on CommentAttachment (ATT-4).
 *
 * Pure rules (legacy JSON parsing, rows-win-over-JSON) plus source-level
 * guardrails on the routes, composer and migration script — the properties
 * that matter are wiring across files a single-module test cannot see.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-3, ATT-4, ATT-AC-2,
 *       UPL-6, XCT-5; docs/attachment_viewer_REQUIREMENTS.md NRG-1, NRG-3.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import path from 'path'
import {
  parseLegacyAttachmentIds, resolveCommentAttachments, commentAttachmentUrl,
  TODO_COMMENT_TYPE, type TodoCommentAttachmentView,
} from './todo-comments'
import { COMMENT_SCOPES } from './access'

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const view = (id: string, source: 'comment' | 'legacy'): TodoCommentAttachmentView => ({
  id, filename: `${id}.png`, url: source === 'comment' ? commentAttachmentUrl(id) : `/api/todos/t1/attachments/${id}`,
  mimeType: 'image/png', size: 10, width: null, height: null,
  uploadedBy: { id: 'u1', name: 'U' }, createdAt: '2026-09-25T00:00:00.000Z', source,
})

// ── Pure rules ─────────────────────────────────────────────────────────────

test('parseLegacyAttachmentIds: only a JSON array of non-empty strings, de-duplicated', () => {
  assert.deepEqual(parseLegacyAttachmentIds('["a","b","a"]'), ['a', 'b'])
  assert.deepEqual(parseLegacyAttachmentIds('["a", 3, null, "", {"x":1}]'), ['a'])
  for (const bad of [null, undefined, '', 'not json', '{"a":1}', '"a"', '42']) {
    assert.deepEqual(parseLegacyAttachmentIds(bad as string | null | undefined), [], String(bad))
  }
})

test('resolveCommentAttachments: CommentAttachment rows win; the JSON is read only for unmigrated comments', () => {
  const legacy = new Map([['L1', view('L1', 'legacy')], ['L2', view('L2', 'legacy')]])
  // Migrated comment — the JSON is still present (rollback path) but ignored.
  const migrated = resolveCommentAttachments([view('C1', 'comment')], '["L1","L2"]', legacy)
  assert.deepEqual(migrated.map((a) => a.id), ['C1'])
  // Unmigrated comment renders its legacy ids, in JSON order, dropping unknown ones.
  const old = resolveCommentAttachments(undefined, '["L2","gone","L1"]', legacy)
  assert.deepEqual(old.map((a) => a.id), ['L2', 'L1'])
  assert.ok(old.every((a) => a.source === 'legacy'))
  // Neither.
  assert.deepEqual(resolveCommentAttachments([], null, legacy), [])
})

test('comment attachment URLs are the authenticated route, never a static path', () => {
  assert.equal(commentAttachmentUrl('abc'), '/api/comment-attachments/abc')
  assert.ok((COMMENT_SCOPES as readonly string[]).includes(TODO_COMMENT_TYPE))
})

// ── Routes ─────────────────────────────────────────────────────────────────

test('ATT-4: the card comment POST claims staged CommentAttachment rows for this card and uploader', () => {
  const src = read('app/api/todos/[id]/comments/route.ts')
  const post = src.slice(src.indexOf('export const POST'))
  const create = post.indexOf('prisma.todoComment.create(')
  const claim = post.indexOf('claimAttachments({')
  assert.ok(create > 0 && claim > create, 'staged rows must be claimed after the comment exists')
  const claimCall = post.slice(claim, post.indexOf('})', claim))
  assert.match(claimCall, /commentType: TODO_COMMENT_TYPE/)
  assert.match(claimCall, /entityId: todoId/)
  assert.match(claimCall, /uploaderId: session\.user\.id/)
  // Only legacy ids already on this card may be written to the JSON column.
  assert.match(post, /commentAttachments: legacyAttachmentIds\.length > 0/)
})

test('NRG-3: the card comment GET hydrates both storage shapes through one helper', () => {
  const src = read('app/api/todos/[id]/comments/route.ts')
  const get = src.slice(src.indexOf('export const GET'), src.indexOf('export const POST'))
  assert.match(get, /todoReadGuard\(/)
  assert.match(get, /hydrateTodoCommentAttachments\(/)
  const lib = read('lib/attachments/todo-comments.ts')
  assert.match(lib, /entityId: todoId, commentId: \{ in:/, 'rows must be pinned to the card')
  assert.match(lib, /todoAttachment\.findMany\(\{\s*where: \{ id: \{ in: Array\.from\(legacyIds\) \}, todoId \}/, 'legacy ids must be pinned to the card')
})

test('ATT-3: deleting a card comment deletes its CommentAttachment rows and files', () => {
  const src = read('app/api/todos/[id]/comments/[commentId]/route.ts')
  const del = src.slice(src.indexOf('export const DELETE'))
  const dbDelete = del.indexOf('prisma.todoComment.delete(')
  const files = del.indexOf('deleteTodoCommentAttachments(commentId)')
  assert.ok(dbDelete > 0 && files > dbDelete, 'attachments must be removed with the comment')
})

test('staging a TODO comment upload is a card write: canWriteTodo, then 409 on a closed sprint', () => {
  const src = read('app/api/comment-attachments/route.ts')
  const post = src.slice(src.indexOf('export const POST'), src.indexOf('export const DELETE'))
  const access = post.indexOf("canAccessAttachmentScope(commentType, entityId, actor, 'write')")
  const closed = post.indexOf('sprintClosedGuard(entityId)')
  const write = post.indexOf('persistFile(')
  assert.ok(access > 0 && closed > access && write > closed, 'access, then closed-sprint, then write')
})

test('the comment attachment serve route uses the shared header policy', () => {
  const src = read('app/api/comment-attachments/[id]/route.ts')
  assert.match(src, /attachmentResponseHeaders\(\{ type, filename: row\.filename, size: bytes\.byteLength \}\)/)
})

// ── Client + migration ─────────────────────────────────────────────────────

test('the card composer stages on /api/comment-attachments, not as card attachments', () => {
  const uploads = read('components/todos/CardCommentUploads.ts')
  assert.match(uploads, /fetch\('\/api\/comment-attachments', \{ method: 'POST'/)
  assert.match(uploads, /body\.append\('commentType', 'TODO'\)/)
  const modal = read('components/todos/TodoCardModal.tsx')
  const post = modal.slice(modal.indexOf('const postComment = async'), modal.indexOf('// ── Checklist ──'))
  assert.match(post, /stageCardCommentFiles\(/)
  assert.doesNotMatch(post, /\/attachments`, \{ method: 'POST'/, 'comment files must not be uploaded as card attachments')
  assert.match(post, /discardStagedCardCommentFiles\(/, 'a failed post must drop what it staged (CMP-3)')
})

test('migration script: dry-run by default, all-or-nothing per comment, JSON left for rollback', () => {
  const s = read('scripts/migrate-todo-comment-attachments.ts')
  assert.match(s, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.match(s, /if \(!APPLY\) \{/)
  assert.match(s, /validateUpload\(/, 'legacy bytes must be re-validated')
  assert.match(s, /resolveTodoAttachmentPath\(row\)/, 'files must be located with the contained resolver')
  assert.match(s, /BLOCKED/)
  assert.match(s, /\$transaction\(/)
  assert.doesNotMatch(s, /todoComment\.update/, 'the JSON column is the rollback path and must be left in place')
  assert.doesNotMatch(s, /todoAttachment\.(delete|update)/, 'card attachments must be left in place')
})
