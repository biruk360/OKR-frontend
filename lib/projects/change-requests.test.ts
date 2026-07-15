import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransitionChangeRequest,
  changeRequestWhere,
  nextChangeRequestCode,
  scopeVolatilityTotal,
  shiftActivityEnds,
} from './change-requests'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

test('nextChangeRequestCode: generates CR-### codes', () => {
  assert.equal(nextChangeRequestCode(0), 'CR-001')
  assert.equal(nextChangeRequestCode(12), 'CR-013')
})

test('canTransitionChangeRequest: enforces H2 workflow', () => {
  assert.equal(canTransitionChangeRequest('SUBMITTED', 'UNDER_REVIEW'), true)
  assert.equal(canTransitionChangeRequest('UNDER_REVIEW', 'APPROVED'), true)
  assert.equal(canTransitionChangeRequest('APPROVED', 'IMPLEMENTED'), true)
  assert.equal(canTransitionChangeRequest('IMPLEMENTED', 'REJECTED'), false)
  assert.equal(canTransitionChangeRequest('REJECTED', 'APPROVED'), false)
})

test('changeRequestWhere: reportPending filters SUBMITTED/UNDER_REVIEW at query level', () => {
  assert.deepEqual(changeRequestWhere('p1'), { projectId: 'p1' })
  assert.deepEqual(changeRequestWhere('p1', { reportPending: true }), {
    projectId: 'p1',
    status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
  })
})

test('scopeVolatilityTotal: sums approved and implemented schedule impact only', () => {
  assert.equal(scopeVolatilityTotal([
    { status: 'SUBMITTED', scheduleImpactDays: 100 },
    { status: 'APPROVED', scheduleImpactDays: 14 },
    { status: 'IMPLEMENTED', scheduleImpactDays: 3 },
    { status: 'REJECTED', scheduleImpactDays: 8 },
  ]), 17)
})

test('shiftActivityEnds: approved CR shifts affected activity due dates', () => {
  const shifts = shiftActivityEnds([
    { id: 'a1', currentEnd: d('2026-08-10') },
    { id: 'a2', currentEnd: null },
  ], 14)
  assert.equal(shifts[0].currentEnd?.toISOString(), '2026-08-24T00:00:00.000Z')
  assert.equal(shifts[1].currentEnd, null)
})
