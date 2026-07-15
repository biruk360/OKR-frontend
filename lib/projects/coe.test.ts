import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectCoeTriggers,
  hasFiveCompleteWhys,
  milestoneSlipDays,
  nextCoeCode,
  rootCausePareto,
  validateCoeClosure,
} from './coe'

test('nextCoeCode: increments with zero-padded COE sequence', () => {
  assert.equal(nextCoeCode(0), 'COE-001')
  assert.equal(nextCoeCode(12), 'COE-013')
})

test('milestoneSlipDays and detectCoeTriggers: slip over 10 days prompts COE', () => {
  assert.equal(milestoneSlipDays('2026-07-01T08:00:00Z', '2026-07-16T18:00:00Z'), 15)
  assert.deepEqual(detectCoeTriggers({
    projectRagStatus: 'GREEN',
    milestones: [
      { id: 'm1', name: 'Design sign-off', baselineDate: '2026-07-01T00:00:00Z', currentDate: '2026-07-16T00:00:00Z' },
      { id: 'm2', name: 'Build', baselineDate: '2026-07-01T00:00:00Z', currentDate: '2026-07-09T00:00:00Z' },
    ],
  }), [{
    kind: 'MILESTONE_SLIP',
    trigger: 'Milestone "Design sign-off" slipped 15 days',
    daysLost: 15,
    milestoneId: 'm1',
  }])
})

test('detectCoeTriggers: RED project prompts unless already covered', () => {
  assert.deepEqual(detectCoeTriggers({ projectRagStatus: 'RED', milestones: [] }), [{
    kind: 'PROJECT_RED',
    trigger: 'Project is RED',
    daysLost: 0,
  }])
  assert.deepEqual(detectCoeTriggers({ projectRagStatus: 'RED', milestones: [], existingTriggers: ['Project is RED'] }), [])
})

test('validateCoeClosure: DONE requires five complete whys and systemic fix', () => {
  const incomplete = Array.from({ length: 4 }, (_, i) => ({ why: `Why ${i + 1}`, answer: `Because ${i + 1}` }))
  const complete = Array.from({ length: 5 }, (_, i) => ({ why: `Why ${i + 1}`, answer: `Because ${i + 1}` }))
  assert.equal(hasFiveCompleteWhys(incomplete), false)
  assert.equal(validateCoeClosure({ fixStatus: 'DONE', whys: incomplete, systemicFix: 'Template updated' }).ok, false)
  assert.equal(validateCoeClosure({ fixStatus: 'DONE', whys: complete, systemicFix: '' }).ok, false)
  assert.deepEqual(validateCoeClosure({ fixStatus: 'DONE', whys: complete, systemicFix: 'Template updated' }), { ok: true })
  assert.deepEqual(validateCoeClosure({ fixStatus: 'IN_PROGRESS', whys: incomplete, systemicFix: '' }), { ok: true })
})

test('rootCausePareto: counts COEs by root cause class', () => {
  assert.deepEqual(rootCausePareto([
    { rootCauseClass: 'ESTIMATION' },
    { rootCauseClass: 'PLANNING' },
    { rootCauseClass: 'ESTIMATION' },
    { rootCauseClass: 'EXTERNAL' },
  ]), [
    { rootCauseClass: 'ESTIMATION', count: 2 },
    { rootCauseClass: 'EXTERNAL', count: 1 },
    { rootCauseClass: 'PLANNING', count: 1 },
  ])
})
