import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCheckInDue,
  summarizeCheckInsDue,
  heroFromConfidenceGroups,
  momentumFromPeriodAverages,
} from './dashboard-home'

const NOW = new Date('2026-09-25T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

test('weekly KR checked in 3 days ago is due within the week, not overdue', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'WEEKLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(3) }, NOW), 'due')
})

test('weekly KR checked in 8 days ago is overdue', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'WEEKLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(8) }, NOW), 'overdue')
})

test('monthly KR checked in 8 days ago is neither due nor overdue (cadence respected)', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'MONTHLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(8) }, NOW), null)
})

test('quarterly KR checked in 85 days ago is due this week', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'QUARTERLY', createdAt: daysAgo(200), lastCheckInAt: daysAgo(85) }, NOW), 'due')
})

test('never-checked-in KR falls back to createdAt', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'BIWEEKLY', createdAt: daysAgo(20), lastCheckInAt: null }, NOW), 'overdue')
  assert.equal(classifyCheckInDue({ checkInCadence: 'BIWEEKLY', createdAt: daysAgo(2), lastCheckInAt: null }, NOW), null)
})

test('unknown cadence is treated as WEEKLY', () => {
  assert.equal(classifyCheckInDue({ checkInCadence: 'NONSENSE', createdAt: daysAgo(90), lastCheckInAt: daysAgo(10) }, NOW), 'overdue')
  assert.equal(classifyCheckInDue({ checkInCadence: null, createdAt: daysAgo(90), lastCheckInAt: daysAgo(1) }, NOW), 'due')
})

test('summarizeCheckInsDue counts and orders overdue first', () => {
  const summary = summarizeCheckInsDue(
    [
      { id: 'a', checkInCadence: 'WEEKLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(2) }, // due
      { id: 'b', checkInCadence: 'WEEKLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(30) }, // overdue
      { id: 'c', checkInCadence: 'MONTHLY', createdAt: daysAgo(90), lastCheckInAt: daysAgo(1) }, // fine
    ],
    NOW,
  )
  assert.equal(summary.overdueCount, 1)
  assert.equal(summary.dueThisWeekCount, 1)
  assert.deepEqual(summary.items, [
    { id: 'b', state: 'overdue' },
    { id: 'a', state: 'due' },
  ])
})

test('heroFromConfidenceGroups folds groupBy rows', () => {
  const stats = heroFromConfidenceGroups([
    { confidence: 'ON_TRACK', count: 2, progressSum: 150 },
    { confidence: 'AT_RISK', count: 1, progressSum: 40 },
    { confidence: 'OFF_TRACK', count: 1, progressSum: 10 },
  ])
  assert.deepEqual(stats, { total: 4, onTrack: 2, atRisk: 1, offTrack: 1, avgProgress: 50, confidenceScore: 63 })
})

test('heroFromConfidenceGroups handles no KRs', () => {
  assert.deepEqual(heroFromConfidenceGroups([]), {
    total: 0, onTrack: 0, atRisk: 0, offTrack: 0, avgProgress: 0, confidenceScore: 0,
  })
})

test('momentumFromPeriodAverages keeps the NEWEST periods, in chronological order', () => {
  const newestFirst = Array.from({ length: 10 }, (_, i) => ({
    periodStart: `2026-${String(10 - i).padStart(2, '0')}-01`,
    avgScore: 10 * (10 - i) + 0.4,
  }))
  const points = momentumFromPeriodAverages(newestFirst, 7)
  assert.equal(points.length, 7)
  assert.equal(points[0].date, '2026-04-01')
  assert.equal(points[6].date, '2026-10-01')
  assert.equal(points[6].progress, 100)
})

test('momentumFromPeriodAverages drops null averages', () => {
  assert.deepEqual(
    momentumFromPeriodAverages([
      { periodStart: '2026-09-01', avgScore: null },
      { periodStart: '2026-08-01', avgScore: 55.6 },
    ]),
    [{ date: '2026-08-01', progress: 56 }],
  )
})

test('feed redaction mirrors canViewObjective / canViewKeyResult', async () => {
  const { isObjectiveRedactedFor, isKeyResultRedactedFor } = await import('./dashboard-home')
  const full = new Set(['me', 'report'])
  assert.equal(isObjectiveRedactedFor(full, { ownerId: 'peer', isPrivate: false }), false)
  assert.equal(isObjectiveRedactedFor(full, { ownerId: 'peer', isPrivate: true }), true)
  assert.equal(isObjectiveRedactedFor(full, { ownerId: 'report', isPrivate: true }), false)

  const publicObj = { ownerId: 'peer', isPrivate: false }
  const privateObj = { ownerId: 'peer', isPrivate: true }
  assert.equal(isKeyResultRedactedFor(full, { ownerId: 'peer', isPrivate: false, objective: publicObj }), false)
  assert.equal(isKeyResultRedactedFor(full, { ownerId: 'peer', isPrivate: true, objective: publicObj }), true)
  assert.equal(isKeyResultRedactedFor(full, { ownerId: 'peer', isPrivate: false, objective: privateObj }), true)
  // A direct report's KR is visible in full even under someone else's private objective.
  assert.equal(isKeyResultRedactedFor(full, { ownerId: 'report', isPrivate: true, objective: privateObj }), false)
})
