import test from 'node:test'
import assert from 'node:assert/strict'
import { extractMentionIdsFromMarkup, MAX_MENTIONS_PER_COMMENT } from './comments'

/**
 * MEN-AC-1 and friends.
 *
 * The live bug these guard: MentionEditor wrote `data-mention-id=""` on every
 * mention while the to-do comment route required one-or-more characters, so
 * extraction always returned [] and tagging someone in a to-do comment notified
 * nobody. The id was in TipTap's own `data-id` all along.
 */

const TIPTAP = '<p>hey <span class="mention" data-type="mention" data-id="usr_1" data-mention-id="usr_1" data-label="Biruk Hailu">@Biruk Hailu</span> look</p>'
const BROKEN_LEGACY = '<p>hey <span class="mention" data-mention-id="" data-id="usr_2" data-label="Eden Tsega">@Eden Tsega</span></p>'
const LEGACY_ONLY = '<p><span class="mention" data-mention-id="usr_3">@Yared</span></p>'

test('MEN-AC-1: a TipTap mention yields the user id', () => {
  assert.deepEqual(extractMentionIdsFromMarkup(TIPTAP), ['usr_1'])
})

test('the exact shape of the live bug still resolves', () => {
  // data-mention-id is empty, data-id carries the truth. Before the fix this
  // returned [] and nobody was notified.
  assert.deepEqual(extractMentionIdsFromMarkup(BROKEN_LEGACY), ['usr_2'])
})

test('comments stored with only the legacy attribute still resolve', () => {
  assert.deepEqual(extractMentionIdsFromMarkup(LEGACY_ONLY), ['usr_3'])
})

test('empty attribute values are never treated as an id', () => {
  // Otherwise we would query the database for the user whose id is ''.
  assert.deepEqual(extractMentionIdsFromMarkup('<span data-id="" data-mention-id="">@x</span>'), [])
  assert.deepEqual(extractMentionIdsFromMarkup('<span data-id="   ">@x</span>'), [])
})

test('the same person mentioned twice is returned once', () => {
  const twice = TIPTAP + TIPTAP
  assert.deepEqual(extractMentionIdsFromMarkup(twice), ['usr_1'])
})

test('several distinct mentions all resolve, in document order', () => {
  assert.deepEqual(
    extractMentionIdsFromMarkup(TIPTAP + BROKEN_LEGACY),
    ['usr_1', 'usr_2'],
  )
})

test('plain text and unrelated markup yield nothing', () => {
  assert.deepEqual(extractMentionIdsFromMarkup('<p>no mentions here</p>'), [])
  assert.deepEqual(extractMentionIdsFromMarkup(''), [])
  // An href containing "data-id" text must not be mistaken for a mention.
  assert.deepEqual(extractMentionIdsFromMarkup('<a href="/x?data-id=nope">link</a>'), [])
})

test('MEN-4: the cap is a real number and small enough to bound fan-out', () => {
  assert.ok(MAX_MENTIONS_PER_COMMENT > 0 && MAX_MENTIONS_PER_COMMENT <= 50)
})
