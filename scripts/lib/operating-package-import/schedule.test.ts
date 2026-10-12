import test from 'node:test'
import assert from 'node:assert/strict'
import { cadenceToRecurrenceRule, dutyCardDescription, dutyHeadPlan, dutyPlannerTimes, firstDutyOccurrence, localDay, parseTimingText } from './schedule'

const key = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
const START = localDay('2026-10-12') // Monday, sprint S1
const END = localDay('2027-07-06')
const NOW = new Date(2026, 9, 11, 9, 0) // Sunday 11 Oct 2026

test('cadence → recurrence rule (DUT-1/DUT-2)', () => {
  assert.equal(cadenceToRecurrenceRule('WEEKLY'), 'WEEKLY')
  assert.equal(cadenceToRecurrenceRule('QUARTERLY'), 'QUARTERLY')
  assert.equal(cadenceToRecurrenceRule('EVERY_SPRINT'), 'BIWEEKLY')
  assert.equal(cadenceToRecurrenceRule('EVENT'), null)
})

test('first occurrence from startsOn 2026-10-12', () => {
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', startsOn: START, endsOn: END, timingText: 'Sat 9:00', now: NOW })), '2026-10-17')
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', startsOn: START, endsOn: END, timingText: 'Fixed slot', now: NOW })), '2026-10-12')
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKDAYS', startsOn: START, endsOn: END, timingText: 'By 10:00', now: NOW })), '2026-10-12')
  assert.equal(key(firstDutyOccurrence({ cadence: 'EVERY_SPRINT', startsOn: START, endsOn: END, timingText: 'Sprint close', now: NOW })), '2026-10-12')
  assert.equal(key(firstDutyOccurrence({ cadence: 'EVERY_SPRINT', startsOn: START, endsOn: END, timingText: 'Fri', now: NOW })), '2026-10-16')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', startsOn: START, endsOn: END, timingText: 'Month-end', now: NOW })), '2026-10-31')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', startsOn: START, endsOn: END, timingText: 'By the 10th', now: NOW })), '2026-11-10')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', startsOn: START, endsOn: END, timingText: 'First Saturday after the management meeting', now: NOW })), '2026-11-07')
  assert.equal(key(firstDutyOccurrence({ cadence: 'QUARTERLY', startsOn: START, endsOn: END, timingText: 'Week 12', now: NOW })), '2026-10-12')
  assert.equal(firstDutyOccurrence({ cadence: 'EVENT', startsOn: START, endsOn: END, timingText: '', now: NOW }), null)
})

test('a run after startsOn never schedules in the past', () => {
  const later = new Date(2026, 10, 3) // Tue 3 Nov 2026
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', startsOn: START, endsOn: END, timingText: 'Sat 9:00', now: later })), '2026-11-07')
})

test('planner times and card text', () => {
  assert.deepEqual(dutyPlannerTimes(parseTimingText('By 10:00'), 30), { startTime: '09:30', endTime: '10:00' })
  assert.deepEqual(dutyPlannerTimes(parseTimingText('Sat 9:00'), 90), { startTime: '09:00', endTime: '10:30' })
  assert.deepEqual(dutyPlannerTimes(parseTimingText('Fixed slot'), 30), { startTime: null, endTime: null })
  assert.equal(dutyCardDescription({ outputText: 'Minutes', durationMin: 90, timingText: 'Sat 9:00' }), 'Recurring duty.\nTiming: Sat 9:00\nDuration: 1 h 30 min\nOutput: Minutes')
})

test('dutyHeadPlan', () => {
  const plan = dutyHeadPlan({ cadence: 'MONTHLY', autoTask: true, startsOn: START, endsOn: END, timingText: 'Month-end', durationMin: 30, outputText: 'Audit note', eventLabel: null, now: NOW })
  assert.ok(plan)
  assert.equal(plan!.rule, 'MONTHLY')
  assert.equal(plan!.anchorDay, 31)
  assert.equal(dutyHeadPlan({ cadence: 'EVENT', autoTask: true, startsOn: START, endsOn: END, timingText: null, durationMin: null, outputText: null, eventLabel: 'per bid', now: NOW }), null)
  assert.equal(dutyHeadPlan({ cadence: 'WEEKLY', autoTask: false, startsOn: START, endsOn: END, timingText: null, durationMin: null, outputText: null, eventLabel: null, now: NOW }), null)
})
