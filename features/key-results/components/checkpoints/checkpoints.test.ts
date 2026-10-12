import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkpointDayKey,
  checkpointState,
  daysUntilCheckpoint,
  describeDueIn,
  findNextCheckpoint,
  formatCheckpointDate,
  formatCheckpointValue,
  sortCheckpoints,
  suggestCheckpointStatus,
  suggestNextCheckpointLabel,
} from './checkpoint-utils'
import {
  createCheckpointSchema,
  updateCheckpointSchema,
  checkpointFormSchema,
  parseOptionalNumber,
} from './checkpoint-schema'

// Local noon on 12 Oct 2026 — far enough from midnight that no TZ flips the day.
const NOW = new Date(2026, 9, 12, 12, 0, 0)

const cp = (id: string, label: string, dueDate: string, status = 'PENDING') => ({ id, label, dueDate, status })

test('checkpointDayKey reads the stored UTC calendar day', () => {
  assert.equal(checkpointDayKey('2026-12-31T00:00:00.000Z'), '2026-12-31')
  assert.equal(checkpointDayKey(new Date('2027-03-31T00:00:00.000Z')), '2027-03-31')
  assert.equal(checkpointDayKey('not a date'), '')
})

test('daysUntilCheckpoint compares day keys against local today', () => {
  assert.equal(daysUntilCheckpoint('2026-10-12T00:00:00.000Z', NOW), 0)
  assert.equal(daysUntilCheckpoint('2026-10-19T00:00:00.000Z', NOW), 7)
  assert.equal(daysUntilCheckpoint('2026-10-10T00:00:00.000Z', NOW), -2)
  assert.equal(describeDueIn('2026-10-12T00:00:00.000Z', NOW), 'due today')
  assert.equal(describeDueIn('2026-10-13T00:00:00.000Z', NOW), 'due tomorrow')
  assert.equal(describeDueIn('2026-10-17T00:00:00.000Z', NOW), 'due in 5 days')
  assert.equal(describeDueIn('2026-10-11T00:00:00.000Z', NOW), '1 day overdue')
  assert.equal(describeDueIn('2026-10-02T00:00:00.000Z', NOW), '10 days overdue')
})

test('sortCheckpoints orders by due date then label', () => {
  const sorted = sortCheckpoints([
    cp('c', 'Q4', '2027-06-30T00:00:00.000Z'),
    cp('a', 'Q2', '2026-12-31T00:00:00.000Z'),
    cp('b2', 'Q3b', '2027-03-31T00:00:00.000Z'),
    cp('b1', 'Q3a', '2027-03-31T00:00:00.000Z'),
  ])
  assert.deepEqual(sorted.map((c) => c.id), ['a', 'b1', 'b2', 'c'])
})

test('findNextCheckpoint picks the earliest PENDING, overdue included', () => {
  const list = [
    cp('q4', 'Q4', '2027-06-30T00:00:00.000Z'),
    cp('q2', 'Q2', '2026-09-30T00:00:00.000Z', 'MET'),
    cp('q3', 'Q3', '2026-10-01T00:00:00.000Z'),
  ]
  assert.equal(findNextCheckpoint(list)?.id, 'q3')
  assert.equal(findNextCheckpoint([cp('x', 'Q2', '2026-01-01T00:00:00.000Z', 'MISSED')]), null)
  assert.equal(findNextCheckpoint([]), null)
})

test('checkpointState: met / missed / overdue / next / upcoming', () => {
  assert.equal(checkpointState(cp('a', 'Q1', '2026-01-01T00:00:00.000Z', 'MET'), null, NOW), 'met')
  assert.equal(checkpointState(cp('a', 'Q1', '2026-01-01T00:00:00.000Z', 'MISSED'), null, NOW), 'missed')
  assert.equal(checkpointState(cp('a', 'Q2', '2026-10-11T00:00:00.000Z'), 'a', NOW), 'overdue')
  assert.equal(checkpointState(cp('a', 'Q2', '2026-10-12T00:00:00.000Z'), 'a', NOW), 'next')
  assert.equal(checkpointState(cp('b', 'Q3', '2027-01-12T00:00:00.000Z'), 'a', NOW), 'upcoming')
})

test('suggestCheckpointStatus respects direction (KRX-1)', () => {
  assert.equal(suggestCheckpointStatus({ targetValue: 40, actualValue: 42 }), 'MET')
  assert.equal(suggestCheckpointStatus({ targetValue: 40, actualValue: 40, direction: 'INCREASE' }), 'MET')
  assert.equal(suggestCheckpointStatus({ targetValue: 40, actualValue: 39.9 }), 'MISSED')
  assert.equal(suggestCheckpointStatus({ targetValue: 5, actualValue: 4, direction: 'DECREASE' }), 'MET')
  assert.equal(suggestCheckpointStatus({ targetValue: 5, actualValue: 6, direction: 'decrease' }), 'MISSED')
  assert.equal(suggestCheckpointStatus({ targetValue: null, actualValue: 6 }), null)
  assert.equal(suggestCheckpointStatus({ targetValue: 5, actualValue: undefined }), null)
})

test('formatters', () => {
  assert.equal(formatCheckpointDate('2026-12-31T00:00:00.000Z', NOW), '31 Dec')
  assert.equal(formatCheckpointDate('2027-03-31T00:00:00.000Z', NOW), '31 Mar 2027')
  assert.equal(formatCheckpointValue(45, '%'), '45%')
  assert.equal(formatCheckpointValue(1200, 'ETB'), '1,200 ETB')
  assert.equal(formatCheckpointValue(3.456, null), '3.46')
  assert.equal(formatCheckpointValue(null, '%'), '')
})

test('suggestNextCheckpointLabel', () => {
  assert.equal(suggestNextCheckpointLabel([]), 'Q1')
  assert.equal(suggestNextCheckpointLabel([{ label: 'Q2' }, { label: 'Q3' }]), 'Q4')
  assert.equal(suggestNextCheckpointLabel([{ label: 'q2' }]), 'Q3')
  assert.equal(suggestNextCheckpointLabel([{ label: 'Q4' }]), '')
  assert.equal(suggestNextCheckpointLabel([{ label: 'Mid-year' }]), '')
})

test('createCheckpointSchema validates and parses the due date', () => {
  const ok = createCheckpointSchema.safeParse({ label: ' Q2 ', dueDate: '2026-12-31', targetText: '45% win rate' })
  assert.ok(ok.success)
  if (ok.success) {
    assert.equal(ok.data.label, 'Q2')
    assert.equal(ok.data.dueDate.toISOString(), '2026-12-31T00:00:00.000Z')
    assert.equal(ok.data.status, undefined)
  }
  assert.equal(createCheckpointSchema.safeParse({ label: '', dueDate: '2026-12-31', targetText: 'x' }).success, false)
  assert.equal(createCheckpointSchema.safeParse({ label: 'Q2', dueDate: 'nope', targetText: 'x' }).success, false)
  assert.equal(createCheckpointSchema.safeParse({ label: 'Q2', dueDate: '2026-12-31', targetText: '   ' }).success, false)
  assert.equal(
    createCheckpointSchema.safeParse({ label: 'Q2', dueDate: '2026-12-31', targetText: 'x', status: 'DONE' }).success,
    false,
  )
  assert.equal(
    createCheckpointSchema.safeParse({ label: 'Q2', dueDate: '2026-12-31', targetText: 'x', targetValue: Number.NaN }).success,
    false,
  )
})

test('updateCheckpointSchema needs at least one field and allows clearing numbers', () => {
  assert.equal(updateCheckpointSchema.safeParse({}).success, false)
  const review = updateCheckpointSchema.safeParse({ status: 'MET', actualValue: 47 })
  assert.ok(review.success)
  const cleared = updateCheckpointSchema.safeParse({ actualValue: null })
  assert.ok(cleared.success)
  if (cleared.success) assert.equal(cleared.data.actualValue, null)
})

test('checkpointFormSchema + parseOptionalNumber', () => {
  const base = { label: 'Q3', dueDate: '2027-03-31', targetText: 'x', targetValue: '', actualValue: '', status: 'PENDING' }
  assert.ok(checkpointFormSchema.safeParse(base).success)
  assert.equal(checkpointFormSchema.safeParse({ ...base, targetValue: 'abc' }).success, false)
  assert.equal(checkpointFormSchema.safeParse({ ...base, dueDate: '' }).success, false)
  assert.equal(parseOptionalNumber(''), null)
  assert.equal(parseOptionalNumber(' 12.5 '), 12.5)
  assert.equal(parseOptionalNumber(undefined), null)
})
