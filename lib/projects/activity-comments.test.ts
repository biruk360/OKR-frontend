import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityAttachmentWhere, activityCommentWhere, extractMentionIds } from './activity-comments'

test('activityCommentWhere: portal queries inject CLIENT_VISIBLE at query level', () => {
  assert.deepEqual(activityCommentWhere('a1'), { activityId: 'a1' })
  assert.deepEqual(activityCommentWhere('a1', { portal: true }), {
    activityId: 'a1',
    visibility: 'CLIENT_VISIBLE',
  })
})

test('activityAttachmentWhere: portal queries inject CLIENT_VISIBLE at query level', () => {
  assert.deepEqual(activityAttachmentWhere('a1'), { activityId: 'a1' })
  assert.deepEqual(activityAttachmentWhere('a1', { portal: true }), {
    activityId: 'a1',
    visibility: 'CLIENT_VISIBLE',
  })
})

test('extractMentionIds: reads TipTap mention ids from supported attributes', () => {
  const html = '<span data-mention-id="u1">@Ada</span><span data-id="u2">@Grace</span>'
  assert.deepEqual(extractMentionIds(html).sort(), ['u1', 'u2'])
})
