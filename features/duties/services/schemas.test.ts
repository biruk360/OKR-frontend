import { test } from 'node:test'
import assert from 'node:assert/strict'
import { occurrenceCarryFields } from '@/lib/todos/recurrence'
import { createDutySchema, dutyFormSchema, logDutyOccurrenceSchema, updateDutySchema } from './schemas'
import { toDutyDateKey } from './schedule'

test('createDutySchema: defaults, trimming and date parsing', () => {
  const r = createDutySchema.safeParse({
    timeframeId: 'tf1',
    title: '  Update the bid register ',
    cadence: 'QUARTERLY',
    timingText: '',
    durationMin: '30',
    startsOn: '2026-10-12',
    collaboratorIds: ['u2', 'u2', 'u3'],
  })
  assert.equal(r.success, true)
  if (!r.success) return
  assert.equal(r.data.title, 'Update the bid register')
  assert.equal(r.data.autoTask, true)
  assert.equal(r.data.timingText, null)
  assert.equal(r.data.durationMin, 30)
  assert.equal(toDutyDateKey(r.data.startsOn ?? null), '2026-10-12')
  assert.equal(r.data.endsOn, undefined)
  assert.deepEqual(r.data.collaboratorIds, ['u2', 'u3'])
})

test('createDutySchema rejects unknown cadences, bad durations and reversed dates', () => {
  assert.equal(createDutySchema.safeParse({ timeframeId: 't', title: 'x', cadence: 'PER_BID' }).success, false)
  assert.equal(createDutySchema.safeParse({ timeframeId: 't', title: 'x', cadence: 'DAILY', durationMin: -5 }).success, false)
  assert.equal(createDutySchema.safeParse({ timeframeId: 't', title: 'x', cadence: 'DAILY', durationMin: 1.5 }).success, false)
  assert.equal(
    createDutySchema.safeParse({ timeframeId: 't', title: 'x', cadence: 'DAILY', startsOn: '2026-11-02', endsOn: '2026-11-01' }).success,
    false,
  )
  assert.equal(createDutySchema.safeParse({ timeframeId: 't', title: '  ', cadence: 'DAILY' }).success, false)
})

test('updateDutySchema: absent fields stay undefined, null clears, actions parse', () => {
  const r = updateDutySchema.safeParse({ timingText: null, title: 'New' })
  assert.equal(r.success, true)
  if (!r.success) return
  assert.equal(r.data.timingText, null)
  assert.equal(r.data.outputText, undefined)
  assert.equal(r.data.keyResultId, undefined)
  assert.equal(r.data.startsOn, undefined)
  const a = updateDutySchema.safeParse({ action: 'pause' })
  assert.equal(a.success && a.data.action, 'pause')
  assert.equal(updateDutySchema.safeParse({ action: 'archive' }).success, false)
})

test('logDutyOccurrenceSchema defaults to not completed, no date', () => {
  const r = logDutyOccurrenceSchema.safeParse({})
  assert.equal(r.success, true)
  if (!r.success) return
  assert.equal(r.data.completed, false)
  assert.equal(r.data.dueDate, undefined)
})

test('dutyFormSchema: EVENT needs a trigger label', () => {
  const base = {
    title: 'Bid review',
    cadence: 'EVENT',
    eventLabel: '',
    timingText: '',
    durationMin: '',
    outputText: '',
    autoTask: false,
    startsOn: '',
    endsOn: '',
    collaboratorIds: [],
  }
  assert.equal(dutyFormSchema.safeParse(base).success, false)
  assert.equal(dutyFormSchema.safeParse({ ...base, eventLabel: 'per bid' }).success, true)
  assert.equal(dutyFormSchema.safeParse({ ...base, eventLabel: 'per bid', durationMin: 'abc' }).success, false)
})

test('DUT-7: a duty head never carries progressValue into its occurrences', () => {
  const carried = occurrenceCarryFields({
    progressValue: 5,
    recurrenceCountsProgress: false,
    kind: 'DUTY',
    dutyId: 'duty1',
    externalRef: 'RD-W1',
  })
  assert.deepEqual(carried, { progressValue: null, kind: 'DUTY', dutyId: 'duty1' })
})
