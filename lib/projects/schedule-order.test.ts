import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCompleteScheduleOrder } from './schedule-order'

test('validateCompleteScheduleOrder accepts a complete sibling permutation', () => {
  assert.equal(validateCompleteScheduleOrder(['a', 'b', 'c'], ['c', 'a', 'b']), null)
})

test('validateCompleteScheduleOrder rejects missing, duplicate, and foreign IDs', () => {
  assert.match(validateCompleteScheduleOrder(['a', 'b'], ['a']) ?? '', /every sibling/)
  assert.match(validateCompleteScheduleOrder(['a', 'b'], ['a', 'a']) ?? '', /duplicate/)
  assert.match(validateCompleteScheduleOrder(['a', 'b'], ['a', 'x']) ?? '', /outside/)
})
