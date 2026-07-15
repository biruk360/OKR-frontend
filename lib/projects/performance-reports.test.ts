import test from 'node:test'
import assert from 'node:assert/strict'
import { individualInsight, performancePeriod, teamInsight } from './performance-reports'

test('performancePeriod: supports daily, weekly, sprint, and monthly cadences', () => {
  const now = new Date('2026-07-15T12:00:00.000Z')
  assert.equal(performancePeriod('DAILY', now).label, '2026-07-15 to 2026-07-15')
  assert.equal(performancePeriod('WEEKLY', now).label, '2026-07-13 to 2026-07-19')
  assert.equal(performancePeriod('SPRINT', now).label, '2026-07-13 to 2026-07-26')
  assert.equal(performancePeriod('MONTHLY', now).label, '2026-07-01 to 2026-07-31')
})

test('individualInsight: prioritizes attendance, idle, estimate, and strong performance signals', () => {
  assert.match(individualInsight({ performancePct: 90, idleDays: 0, estimateAccuracy: 1, scrumAttendancePct: 50 }), /Attendance/)
  assert.match(individualInsight({ performancePct: 90, idleDays: 3, estimateAccuracy: 1, scrumAttendancePct: 100 }), /Idle/)
  assert.match(individualInsight({ performancePct: 90, idleDays: 0, estimateAccuracy: 1.4, scrumAttendancePct: 100 }), /under-estimating/)
  assert.match(individualInsight({ performancePct: 95, idleDays: 0, estimateAccuracy: 1, scrumAttendancePct: 100 }), /Strong/)
})

test('teamInsight: surfaces data quality, blockers, velocity drop, and strong team performance', () => {
  assert.match(teamInsight({ teamPerformancePct: 90, jiraAdoptionScore: 50, blocked: 0, velocityTrend: 1 }), /data quality/)
  assert.match(teamInsight({ teamPerformancePct: 90, jiraAdoptionScore: 90, blocked: 2, velocityTrend: 1 }), /Blocked/)
  assert.match(teamInsight({ teamPerformancePct: 80, jiraAdoptionScore: 90, blocked: 0, velocityTrend: -2 }), /Velocity decreased/)
  assert.match(teamInsight({ teamPerformancePct: 95, jiraAdoptionScore: 90, blocked: 0, velocityTrend: 1 }), /strong/)
})
