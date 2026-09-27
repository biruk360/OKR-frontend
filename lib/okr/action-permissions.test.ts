import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canCloneKeyResult, canCloneObjective, canDeleteObjective } from './action-permissions'

test('canDeleteObjective: ADMIN, EXECUTIVE or the owner (DELETE /api/objectives/[id])', () => {
  const obj = { ownerId: 'owner' }
  assert.equal(canDeleteObjective('ADMIN', 'x', obj), true)
  assert.equal(canDeleteObjective('EXECUTIVE', 'x', obj), true)
  assert.equal(canDeleteObjective('EMPLOYEE', 'owner', obj), true)
  assert.equal(canDeleteObjective('DEPARTMENT_LEAD', 'x', obj), false)
  assert.equal(canDeleteObjective('EMPLOYEE', 'x', obj), false)
  assert.equal(canDeleteObjective('EMPLOYEE', null, { ownerId: null }), false)
})

test('canCloneObjective: ADMIN, EXECUTIVE, DEPARTMENT_LEAD', () => {
  assert.equal(canCloneObjective('ADMIN'), true)
  assert.equal(canCloneObjective('EXECUTIVE'), true)
  assert.equal(canCloneObjective('DEPARTMENT_LEAD'), true)
  assert.equal(canCloneObjective('EMPLOYEE'), false)
  assert.equal(canCloneObjective(undefined), false)
})

test('canCloneKeyResult: role gate, then ADMIN or the objective owner', () => {
  assert.equal(canCloneKeyResult('ADMIN', 'x', 'owner'), true)
  assert.equal(canCloneKeyResult('EXECUTIVE', 'owner', 'owner'), true)
  assert.equal(canCloneKeyResult('EXECUTIVE', 'x', 'owner'), false)
  assert.equal(canCloneKeyResult('DEPARTMENT_LEAD', 'owner', 'owner'), true)
  // An EMPLOYEE objective owner fails the route's role gate.
  assert.equal(canCloneKeyResult('EMPLOYEE', 'owner', 'owner'), false)
})
