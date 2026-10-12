import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adherenceWindow,
  combineAdherence,
  completedOccurrenceCount,
  computeDutyAdherence,
  computeNextDue,
  occurrenceRows,
  overdueCount,
  weekCounts,
  weekWindow,
  type DutyTodoRow,
} from './adherence'
import { toDutyDateKey } from './schedule'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const NOW = new Date(2026, 10, 18, 15, 0) // Wed 18 Nov 2026, 15:00

let seq = 0
function occ(due: Date | null, status = 'PENDING', extra: Partial<DutyTodoRow> = {}): DutyTodoRow {
  seq++
  return { id: `t${seq}`, status, dueDate: due, recurrenceParentId: 'head', ...extra }
}

test('occurrenceRows: generated and logged rows count; an advanced head does not', () => {
  const head: DutyTodoRow = { id: 'head', status: 'PENDING', dueDate: d(2026, 11, 16), recurrenceRule: 'WEEKLY' }
  const a = occ(d(2026, 11, 9))
  const logged: DutyTodoRow = { id: 'log', status: 'COMPLETED', dueDate: d(2026, 11, 10) }
  assert.deepEqual(occurrenceRows([head, a, logged]).map((r) => r.id), [a.id, 'log'])
})

test('occurrenceRows: a head that never advanced is its own first occurrence', () => {
  const head: DutyTodoRow = { id: 'h', status: 'PENDING', dueDate: d(2026, 11, 16), recurrenceRule: 'WEEKLY' }
  assert.deepEqual(occurrenceRows([head]).map((r) => r.id), ['h'])
  // …unless the loader flagged children outside the window.
  assert.deepEqual(occurrenceRows([{ ...head, hasChildren: true }]), [])
  // An archived (paused / retired) head that was never done is not an occurrence.
  assert.deepEqual(occurrenceRows([{ ...head, archivedAt: d(2026, 11, 17) }]), [])
  assert.equal(occurrenceRows([{ ...head, archivedAt: d(2026, 11, 17), status: 'COMPLETED' }]).length, 1)
})

test('DUT-5 adherence: completed ÷ due over the last 30 / 90 days', () => {
  const rows: DutyTodoRow[] = [
    occ(d(2026, 11, 16), 'COMPLETED'),
    occ(d(2026, 11, 9), 'COMPLETED'),
    occ(d(2026, 11, 2), 'PENDING'), // missed
    occ(d(2026, 10, 26), 'CANCELLED'), // counts as due, not done
    occ(d(2026, 9, 28), 'COMPLETED'), // 52 days back: 90-day window only
    occ(d(2026, 7, 1), 'COMPLETED'), // outside both
  ]
  const a = computeDutyAdherence(rows, NOW)
  assert.deepEqual(a.d30, { due: 4, done: 2, rate: 50 })
  assert.deepEqual(a.d90, { due: 5, done: 3, rate: 60 })
})

test('adherence: an open occurrence due today is not late yet; a future one never counts', () => {
  const rows = [occ(d(2026, 11, 18), 'PENDING'), occ(d(2026, 11, 25), 'PENDING')]
  assert.deepEqual(adherenceWindow(rows, NOW, 30), { due: 0, done: 0, rate: null })
  const doneToday = [occ(d(2026, 11, 18), 'COMPLETED')]
  assert.deepEqual(adherenceWindow(doneToday, NOW, 30), { due: 1, done: 1, rate: 100 })
})

test('adherence: window edges are whole days (day 30 in, day 31 out)', () => {
  const rows = [occ(d(2026, 10, 20), 'COMPLETED'), occ(d(2026, 10, 19), 'COMPLETED')]
  assert.equal(adherenceWindow(rows, NOW, 30).due, 1)
})

test('combineAdherence sums the windows', () => {
  assert.deepEqual(
    combineAdherence([
      { due: 4, done: 2, rate: 50 },
      { due: 1, done: 1, rate: 100 },
      { due: 0, done: 0, rate: null },
    ]),
    { due: 5, done: 3, rate: 60 },
  )
  assert.deepEqual(combineAdherence([]), { due: 0, done: 0, rate: null })
})

test('weekWindow is Monday → next Monday', () => {
  const w = weekWindow(NOW)
  assert.equal(toDutyDateKey(w.start), '2026-11-16')
  assert.equal(toDutyDateKey(w.end), '2026-11-23')
})

test('weekCounts: occurrences due this week and done', () => {
  const rows = [
    occ(d(2026, 11, 16), 'COMPLETED'),
    occ(d(2026, 11, 18), 'PENDING'),
    occ(d(2026, 11, 22), 'PENDING'),
    occ(d(2026, 11, 23), 'PENDING'), // next week
    occ(d(2026, 11, 15), 'COMPLETED'), // last week
  ]
  assert.deepEqual(weekCounts(rows, NOW), { due: 3, done: 1 })
})

test('overdueCount and completedOccurrenceCount (DUT-6)', () => {
  const rows = [
    occ(d(2026, 11, 2), 'PENDING'),
    occ(d(2026, 11, 3), 'IN_PROGRESS'),
    occ(d(2026, 11, 4), 'COMPLETED'),
    occ(d(2026, 11, 5), 'PENDING', { archivedAt: d(2026, 11, 6) }),
    occ(d(2026, 11, 18), 'PENDING'),
  ]
  assert.equal(overdueCount(rows, NOW), 2)
  assert.equal(completedOccurrenceCount(rows), 1)
  assert.equal(completedOccurrenceCount([]), 0)
})

test('computeNextDue: earliest open card on or after today', () => {
  const rows = [occ(d(2026, 11, 2), 'PENDING'), occ(d(2026, 11, 20), 'PENDING'), occ(d(2026, 11, 19), 'COMPLETED')]
  assert.equal(toDutyDateKey(computeNextDue(rows, null, NOW)), '2026-11-20')
})

test('computeNextDue: an active series projects the next generated date', () => {
  const head: DutyTodoRow = { id: 'h', status: 'COMPLETED', dueDate: d(2026, 11, 16), recurrenceRule: 'WEEKLY' }
  assert.equal(toDutyDateKey(computeNextDue([head], head, NOW, { active: true })), '2026-11-23')
  // Paused: no projection.
  assert.equal(computeNextDue([head], head, NOW, { active: false }), null)
  // Projection past endsOn is dropped.
  assert.equal(computeNextDue([head], head, NOW, { active: true, endsOn: d(2026, 11, 20) }), null)
  // An open head due today is the next due.
  const openHead: DutyTodoRow = { id: 'h2', status: 'PENDING', dueDate: d(2026, 11, 18), recurrenceRule: 'DAILY' }
  assert.equal(toDutyDateKey(computeNextDue([openHead], openHead, NOW, { active: true })), '2026-11-18')
})
