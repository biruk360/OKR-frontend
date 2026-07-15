import test from 'node:test'
import assert from 'node:assert/strict'
import { computeScrumAttendance } from '@/features/projects/services/scrum-attendance'

const people = [
  { userId: 'u1', name: 'Biruk', email: 'biruk@example.com' },
  { userId: 'u2', name: 'Meklit', email: 'meklit@example.com' },
  { userId: 'u3', name: 'Dawit', email: 'dawit@example.com' },
]

test('computeScrumAttendance: totals and per-person attendance rates', () => {
  const summary = computeScrumAttendance([
    {
      scrumDate: new Date('2026-07-13T00:00:00.000Z'),
      attendeeIds: ['u1', 'u2'],
      lateIds: ['u3'],
      absenteeIds: [],
    },
    {
      scrumDate: new Date('2026-07-14T00:00:00.000Z'),
      attendeeIds: ['u1'],
      lateIds: [],
      absenteeIds: ['u2', 'u3'],
    },
  ], people)

  assert.equal(summary.totalScrumsHeld, 2)
  assert.equal(summary.teamAttendanceRate, 66.7)
  assert.equal(summary.rows.find((row) => row.userId === 'u1')?.attendanceRate, 100)
  assert.equal(summary.rows.find((row) => row.userId === 'u2')?.attendanceRate, 50)
  assert.equal(summary.rows.find((row) => row.userId === 'u3')?.late, 1)
})

test('computeScrumAttendance: attendance below 70 percent is flagged', () => {
  const summary = computeScrumAttendance([
    {
      scrumDate: new Date('2026-07-14T00:00:00.000Z'),
      attendeeIds: ['u1'],
      lateIds: [],
      absenteeIds: ['u2', 'u3'],
    },
  ], people)

  assert.equal(summary.rows.find((row) => row.userId === 'u2')?.flagged, true)
  assert.equal(summary.rows.find((row) => row.userId === 'u1')?.flagged, false)
})
