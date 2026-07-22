import assert from 'node:assert/strict'
import test from 'node:test'
import { compareScheduleItems, isOverdueActivity } from './schedule-view'

test('manual schedule sorting follows saved position', () => {
  const laterPosition = { position: 2, currentStart: '2026-01-01' }
  const earlierPosition = { position: 1, currentStart: '2026-12-01' }
  assert.ok(compareScheduleItems('manual', laterPosition, earlierPosition) > 0)
})

test('automatic schedule sorting uses start date then saved position', () => {
  const laterDate = { position: 0, currentStart: '2026-08-10' }
  const earlierDate = { position: 9, currentStart: '2026-08-01' }
  assert.ok(compareScheduleItems('automatic', laterDate, earlierDate) > 0)
  assert.ok(compareScheduleItems('automatic', { position: 2, currentStart: null }, { position: 1, currentStart: null }) > 0)
})

test('overdue activity excludes completed statuses and compares calendar days', () => {
  const now = new Date(2026, 7, 10, 14)
  assert.equal(isOverdueActivity('STARTED', new Date(2026, 7, 9, 23), now), true)
  assert.equal(isOverdueActivity('FINISHED', new Date(2026, 7, 9, 23), now), false)
  assert.equal(isOverdueActivity('APPROVED', new Date(2026, 7, 9, 23), now), false)
  assert.equal(isOverdueActivity('NOT_STARTED', new Date(2026, 7, 10, 0), now), false)
})
