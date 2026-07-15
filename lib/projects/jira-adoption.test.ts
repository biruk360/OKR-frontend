import test from 'node:test'
import assert from 'node:assert/strict'
import { computeJiraAdoptionScore } from '@/features/projects/services/jira/adoption'

const now = new Date('2026-07-14T12:00:00.000Z')

test('computeJiraAdoptionScore: spec example averages four weighted checks', () => {
  const issues = Array.from({ length: 10 }, (_, index) => ({
    jiraKey: `MEDA-${index + 1}`,
    assigneeUserId: index < 8 ? `u${index}` : null,
    originalEstimateSeconds: index < 4 ? 3600 : null,
    jiraUpdatedAt: index < 9 ? new Date('2026-07-13T12:00:00.000Z') : new Date('2026-07-01T12:00:00.000Z'),
    storyPoints: index < 6 ? 3 : null,
  }))

  const score = computeJiraAdoptionScore(issues, now)
  assert.equal(score.assigneePct, 80)
  assert.equal(score.estimatePct, 40)
  assert.equal(score.updatedRecentlyPct, 90)
  assert.equal(score.storyPointsPct, 60)
  assert.equal(score.score, 67.5)
  assert.equal(score.warning, false)
})

test('computeJiraAdoptionScore: low data quality warns below 60 percent', () => {
  const score = computeJiraAdoptionScore([
    { jiraKey: 'MEDA-1', jiraUpdatedAt: new Date('2026-07-01T12:00:00.000Z') },
    { jiraKey: 'MEDA-2', jiraUpdatedAt: new Date('2026-07-01T12:00:00.000Z') },
  ], now)
  assert.equal(score.score, 0)
  assert.equal(score.warning, true)
})

test('computeJiraAdoptionScore: story-point check is skipped when project is not using points', () => {
  const score = computeJiraAdoptionScore([
    { jiraKey: 'MEDA-1', assigneeUserId: 'u1', originalEstimateSeconds: 3600, jiraUpdatedAt: now },
    { jiraKey: 'MEDA-2', assigneeUserId: 'u2', originalEstimateSeconds: 3600, jiraUpdatedAt: now },
  ], now)
  assert.equal(score.storyPointsPct, null)
  assert.equal(score.score, 100)
})
