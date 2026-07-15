import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeJiraDeveloperMetrics,
  estimateBias,
  median,
  type JiraActivityEventInput,
  type JiraMetricsIssueInput,
} from '@/features/projects/services/jira/metrics'

const from = new Date('2026-07-06T00:00:00.000Z') // Monday
const to = new Date('2026-07-10T00:00:00.000Z') // Friday

test('computeJiraDeveloperMetrics: no activity Monday-Wednesday produces three idle days', () => {
  const issues: JiraMetricsIssueInput[] = [
    { jiraKey: 'MEDA-1', assigneeUserId: 'u1', assigneeEmail: 'dev@example.com', assigneeName: 'Dev One' },
  ]
  const events: JiraActivityEventInput[] = [
    { userId: 'u1', email: 'dev@example.com', occurredAt: new Date('2026-07-09T10:00:00.000Z'), type: 'WORKLOG' },
    { userId: 'u1', email: 'dev@example.com', occurredAt: new Date('2026-07-10T10:00:00.000Z'), type: 'TRANSITION' },
  ]

  const result = computeJiraDeveloperMetrics({ from, to, issues, events })
  assert.equal(result.workingDays.length, 5)
  assert.equal(result.rows[0].idleDays, 3)
  assert.deepEqual(result.rows[0].idleDayKeys, ['2026-07-06', '2026-07-07', '2026-07-08'])
})

test('computeJiraDeveloperMetrics: comment activity prevents an idle day', () => {
  const issues: JiraMetricsIssueInput[] = [
    { jiraKey: 'MEDA-1', assigneeUserId: 'u1', assigneeEmail: 'dev@example.com', assigneeName: 'Dev One' },
  ]
  const events: JiraActivityEventInput[] = [
    { userId: 'u1', email: 'dev@example.com', occurredAt: new Date('2026-07-06T12:00:00.000Z'), type: 'COMMENT' },
  ]

  const result = computeJiraDeveloperMetrics({ from, to, issues, events })
  assert.equal(result.rows[0].idleDays, 4)
  assert.deepEqual(result.rows[0].activeDayKeys, ['2026-07-06'])
})

test('computeJiraDeveloperMetrics: weekends and configured holidays are excluded from idle days', () => {
  const issues: JiraMetricsIssueInput[] = [
    { jiraKey: 'MEDA-1', assigneeUserId: 'u1', assigneeEmail: 'dev@example.com', assigneeName: 'Dev One' },
  ]
  const result = computeJiraDeveloperMetrics({
    from: new Date('2026-07-06T00:00:00.000Z'),
    to: new Date('2026-07-12T00:00:00.000Z'),
    holidays: new Set(['2026-07-08']),
    issues,
    events: [],
  })

  assert.deepEqual(result.workingDays, ['2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10'])
  assert.equal(result.rows[0].idleDays, 4)
})

test('computeJiraDeveloperMetrics: 8h estimate and 12h actual produces 1.5 accuracy', () => {
  const issues: JiraMetricsIssueInput[] = [
    {
      jiraKey: 'MEDA-2',
      summary: 'Auth flow',
      assigneeUserId: 'u1',
      assigneeEmail: 'dev@example.com',
      assigneeName: 'Dev One',
      originalEstimateSeconds: 8 * 3600,
      timeSpentSeconds: 12 * 3600,
    },
  ]
  const result = computeJiraDeveloperMetrics({ from, to, issues, events: [] })
  assert.equal(result.rows[0].issueEstimates[0].estimateAccuracy, 1.5)
  assert.equal(result.rows[0].medianEstimateAccuracy, 1.5)
  assert.equal(result.rows[0].estimateBias, 'SYSTEMATICALLY_UNDERESTIMATES')
})

test('median/estimateBias: median 1.4 across twenty issues flags systematic underestimation', () => {
  const values = Array.from({ length: 20 }, () => 1.4)
  assert.equal(median(values), 1.4)
  assert.equal(estimateBias(1.4), 'SYSTEMATICALLY_UNDERESTIMATES')
  assert.equal(estimateBias(0.75), 'SYSTEMATICALLY_OVERESTIMATES')
  assert.equal(estimateBias(1), 'BALANCED')
})
