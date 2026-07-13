/**
 * Unit tests for business-day math (Approval Clock / SLA / idle days).
 * Run: `npm run test:projects`  (tsx + Node built-in test runner — no extra deps)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { businessDaysBetween, addBusinessDays, isWeekend, isWorkingDay, workingDaysInRange } from './business-days'

// 2024-01-01 is a Monday (UTC).
const mon = (d: string) => new Date(`2024-01-${d}T00:00:00Z`)

test('businessDaysBetween: Monday to next Monday = 5 (weekend excluded)', () => {
  // Sent Mon 01, approved Mon 08 → Tue,Wed,Thu,Fri,Mon = 5; Sat 06/Sun 07 excluded.
  assert.equal(businessDaysBetween(mon('01'), mon('08')), 5)
})

test('businessDaysBetween: same day = 0', () => {
  assert.equal(businessDaysBetween(mon('01'), mon('01')), 0)
})

test('businessDaysBetween: end before start = 0', () => {
  assert.equal(businessDaysBetween(mon('08'), mon('01')), 0)
})

test('businessDaysBetween: one weekend spanned Fri->Mon = 1', () => {
  // Fri 05 -> Mon 08: only Mon 08 counts (Sat/Sun excluded).
  assert.equal(businessDaysBetween(mon('05'), mon('08')), 1)
})

test('businessDaysBetween: honors holiday set', () => {
  // Mon 01 -> Thu 04, with Wed 03 a holiday → Tue 02, Thu 04 = 2.
  assert.equal(businessDaysBetween(mon('01'), mon('04'), new Set(['2024-01-03'])), 2)
})

test('isWeekend', () => {
  assert.equal(isWeekend(mon('06')), true) // Sat
  assert.equal(isWeekend(mon('07')), true) // Sun
  assert.equal(isWeekend(mon('08')), false) // Mon
})

test('isWorkingDay respects holidays', () => {
  assert.equal(isWorkingDay(mon('02')), true)
  assert.equal(isWorkingDay(mon('02'), new Set(['2024-01-02'])), false)
})

test('addBusinessDays: Mon + 5 = next Mon', () => {
  assert.equal(addBusinessDays(mon('01'), 5).toISOString().slice(0, 10), '2024-01-08')
})

test('workingDaysInRange excludes weekend', () => {
  // Mon 01 .. Sun 07 inclusive → Mon-Fri = 5 working days.
  assert.equal(workingDaysInRange(mon('01'), mon('07')).length, 5)
})
