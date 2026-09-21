import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DUE_REMINDERS,
  isDueReminder,
  minutesBefore,
  reminderFireAt,
  shouldSendReminder,
  shouldResetReminderSentAt,
  type ReminderCandidate,
} from './due-reminders'

function card(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    id: 't1',
    dueDate: new Date('2026-09-25T00:00:00.000Z'),
    endTime: '08:20',
    dueReminder: 'D1',
    dueReminderSentAt: null,
    status: 'PENDING',
    ...overrides,
  }
}

/** Local-time due instant for the fixture above, so tests are timezone-safe. */
function dueAt(day = 25, hh = 8, mm = 20) {
  const d = new Date(2026, 8, day)   // month is 0-based: 8 = September
  d.setHours(hh, mm, 0, 0)
  return d
}

test('T-01: every reminder option has a distinct value and lead time', () => {
  const values = DUE_REMINDERS.map((r) => r.value)
  assert.equal(new Set(values).size, values.length)
  const leads = DUE_REMINDERS.map((r) => r.minutesBefore)
  assert.equal(new Set(leads).size, leads.length)
  // Ordered shortest-to-longest, which is the order the select renders.
  assert.deepEqual(leads, [...leads].sort((a, b) => a - b))
})

test('T-02: isDueReminder rejects anything not in the list', () => {
  assert.equal(isDueReminder('D1'), true)
  assert.equal(isDueReminder('AT_TIME'), true)
  assert.equal(isDueReminder('W1'), false)
  assert.equal(isDueReminder(''), false)
  assert.equal(isDueReminder(null), false)
  assert.equal(isDueReminder(60), false)
  assert.equal(minutesBefore('D2'), 2880)
})

test('T-03: reminderFireAt counts back from the due TIME when one is set', () => {
  const fire = reminderFireAt(dueAt(), '08:20', 'H1')
  assert.equal(fire.getHours(), 7)
  assert.equal(fire.getMinutes(), 20)
  assert.equal(fire.getDate(), 25)
})

test('T-04: an all-day card is treated as due at end of day', () => {
  // Otherwise "1 day before" on an all-day task would fire at midnight, a day
  // earlier than the user means.
  const fire = reminderFireAt(dueAt(), null, 'D1')
  assert.equal(fire.getDate(), 24)
  assert.equal(fire.getHours(), 23)
  assert.equal(fire.getMinutes(), 59)
})

test('T-05: fires once the moment has passed, not before (DTE-AC-3)', () => {
  const c = card({ dueDate: dueAt(), endTime: '08:20', dueReminder: 'D1' })
  const justBefore = new Date(2026, 8, 24, 8, 19)
  const justAfter = new Date(2026, 8, 24, 8, 21)
  assert.equal(shouldSendReminder(c, justBefore), false)
  assert.equal(shouldSendReminder(c, justAfter), true)
})

test('T-06: never sends twice for the same due date (idempotent re-run)', () => {
  const sent = card({ dueDate: dueAt(), dueReminderSentAt: new Date(2026, 8, 24, 8, 21) })
  assert.equal(shouldSendReminder(sent, new Date(2026, 8, 24, 9, 0)), false)
})

test('T-07: skips finished cards and cards with no reminder or no due date', () => {
  const now = new Date(2026, 8, 24, 9, 0)
  assert.equal(shouldSendReminder(card({ status: 'COMPLETED' }), now), false)
  assert.equal(shouldSendReminder(card({ status: 'CANCELLED' }), now), false)
  assert.equal(shouldSendReminder(card({ dueReminder: null }), now), false)
  assert.equal(shouldSendReminder(card({ dueDate: null }), now), false)
  assert.equal(shouldSendReminder(card({ dueReminder: 'BOGUS' }), now), false)
})

test('T-08: stale reminders outside the grace window are dropped', () => {
  // A cron that was down for a day must not deliver a pile of late reminders.
  const c = card({ dueDate: dueAt(), endTime: '08:20', dueReminder: 'D1' })
  const wayLate = new Date(2026, 8, 25, 20, 0)   // ~36h after fire time
  assert.equal(shouldSendReminder(c, wayLate), false)
  // Inside the grace window it still goes out.
  const slightlyLate = new Date(2026, 8, 24, 13, 0)
  assert.equal(shouldSendReminder(c, slightlyLate), true)
})

test('T-09: rescheduling or changing the lead time re-arms the reminder', () => {
  const prev = { dueDate: dueAt(), dueReminder: 'D1' }
  assert.equal(shouldResetReminderSentAt(prev, { dueDate: dueAt(30) }), true)
  assert.equal(shouldResetReminderSentAt(prev, { dueReminder: 'H1' }), true)
  assert.equal(shouldResetReminderSentAt(prev, { dueDate: null }), true)
  // An unrelated edit must not re-arm it, or every save would re-notify.
  assert.equal(shouldResetReminderSentAt(prev, {}), false)
  assert.equal(shouldResetReminderSentAt(prev, { dueDate: dueAt(), dueReminder: 'D1' }), false)
})

test('T-10: changing the due TIME re-arms the reminder', () => {
  // reminderFireAt depends on endTime as directly as it does on dueDate, so an
  // edit that moves the deadline earlier must clear the already-sent stamp.
  const prev = { dueDate: dueAt(), dueReminder: 'D1', endTime: '17:00' }
  assert.equal(shouldResetReminderSentAt(prev, { endTime: '09:00' }), true)
  // Clearing the time shifts the card to the 23:59 all-day rule — also a move.
  assert.equal(shouldResetReminderSentAt(prev, { endTime: null }), true)
  assert.equal(shouldResetReminderSentAt(prev, { endTime: '' }), true)
  // Same time, and absent time, are both no-ops.
  assert.equal(shouldResetReminderSentAt(prev, { endTime: '17:00' }), false)
  assert.equal(shouldResetReminderSentAt(prev, {}), false)
  // A card that had no time and still has none must not re-arm.
  assert.equal(shouldResetReminderSentAt({ dueDate: dueAt(), dueReminder: 'D1' }, { endTime: null }), false)
})
