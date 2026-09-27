import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conservativeObjectivePermissions,
  NO_OBJECTIVE_PERMISSIONS,
} from './objective-permission-flags'

const obj = { ownerId: 'owner-1' }

test('no viewer or objective grants nothing', () => {
  assert.deepEqual(conservativeObjectivePermissions(null, obj), NO_OBJECTIVE_PERMISSIONS)
  assert.deepEqual(conservativeObjectivePermissions({ id: 'u', role: 'ADMIN' }, null), NO_OBJECTIVE_PERMISSIONS)
})

test('admin and executive may edit/delete/reopen any objective', () => {
  for (const role of ['ADMIN', 'EXECUTIVE']) {
    const flags = conservativeObjectivePermissions({ id: 'x', role }, obj)
    assert.equal(flags.canEdit, true)
    assert.equal(flags.canDelete, true)
    assert.equal(flags.canReopen, true)
    assert.equal(flags.canClone, true)
  }
})

test('owner may edit/delete/reopen their own objective', () => {
  const flags = conservativeObjectivePermissions({ id: 'owner-1', role: 'EMPLOYEE' }, obj)
  assert.equal(flags.canEdit, true)
  assert.equal(flags.canDelete, true)
  assert.equal(flags.canReopen, true)
  // Clone route is restricted to ADMIN / EXECUTIVE / DEPARTMENT_LEAD.
  assert.equal(flags.canClone, false)
})

test('a non-owner employee gets no write actions', () => {
  assert.deepEqual(
    conservativeObjectivePermissions({ id: 'someone', role: 'EMPLOYEE' }, obj),
    NO_OBJECTIVE_PERMISSIONS,
  )
})

test('a non-owner department lead can clone but gets no other write action client-side', () => {
  const flags = conservativeObjectivePermissions({ id: 'lead', role: 'DEPARTMENT_LEAD' }, obj)
  assert.equal(flags.canEdit, false)
  assert.equal(flags.canDelete, false)
  assert.equal(flags.canClone, true)
})
