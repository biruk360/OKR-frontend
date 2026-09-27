import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deletedAccountData,
  deletedAccountEmail,
  deletedAccountName,
  isDeletedAccountEmail,
} from './deleted-account'

test('name uses the job title when present', () => {
  assert.equal(deletedAccountName('Senior Engineer', 'EMPLOYEE'), 'Senior Engineer (deleted account)')
})

test('name falls back to the role label when no job title', () => {
  assert.equal(deletedAccountName(null, 'EMPLOYEE'), 'Employee (deleted account)')
  assert.equal(deletedAccountName('   ', 'DEPARTMENT_LEAD'), 'Department Lead (deleted account)')
  assert.equal(deletedAccountName(undefined, 'UNKNOWN'), 'User (deleted account)')
})

test('email placeholder is unique per user and non-routable', () => {
  const a = deletedAccountEmail('abc')
  assert.equal(a, 'deleted+abc@deleted.invalid')
  assert.notEqual(a, deletedAccountEmail('abd'))
  assert.ok(isDeletedAccountEmail(a))
  assert.ok(!isDeletedAccountEmail('someone@360ground.com'))
  assert.ok(!isDeletedAccountEmail(null))
})

test('data clears credentials and tokens and revokes sessions', () => {
  const now = new Date('2026-09-25T00:00:00Z')
  const data = deletedAccountData({ id: 'u1', designation: 'CEO', role: 'ADMIN' }, now)
  assert.equal(data.name, 'CEO (deleted account)')
  assert.equal(data.email, 'deleted+u1@deleted.invalid')
  assert.equal(data.password, null)
  assert.equal(data.activationToken, null)
  assert.equal(data.activationTokenExpires, null)
  assert.equal(data.isActive, false)
  assert.equal(data.passwordChangedAt, now)
})
