import assert from 'node:assert/strict'
import test from 'node:test'
import { isSelectableSystemUserEmail } from './selectable-system-users'

test('demo-seed accounts are not selectable system users', () => {
  assert.equal(isSelectableSystemUserEmail('aisha@company.com'), false)
  assert.equal(isSelectableSystemUserEmail(' ADMIN@COMPANY.COM '), false)
})

test('managed organization accounts remain selectable', () => {
  assert.equal(isSelectableSystemUserEmail('biruk@360ground.com'), true)
  assert.equal(isSelectableSystemUserEmail('employee@example.org'), true)
})
