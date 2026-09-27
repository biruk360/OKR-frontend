import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeFilterCount, filterKeyResults, krStatusBucket } from './kr-filters'

const krs = [
  { id: 'a', status: 'ACTIVE', confidence: 'ON_TRACK', owner: { id: 'u1' } },
  { id: 'b', status: 'ACTIVE', confidence: 'AT_RISK', owner: { id: 'u2' } },
  { id: 'c', status: 'ACTIVE', confidence: 'OFF_TRACK', owner: { id: 'u1' } },
  { id: 'd', status: 'ARCHIVED', confidence: 'ON_TRACK', owner: { id: 'u2' } },
]

test('status buckets', () => {
  assert.deepEqual(krs.map(krStatusBucket), ['on-track', 'at-risk', 'off-track', 'inactive'])
})

test('no filters returns everything', () => {
  assert.equal(filterKeyResults(krs, {}).length, 4)
  assert.equal(activeFilterCount({}), 0)
})

test('status filter', () => {
  assert.deepEqual(filterKeyResults(krs, { status: 'at-risk' }).map((k) => k.id), ['b'])
  assert.deepEqual(filterKeyResults(krs, { status: 'inactive' }).map((k) => k.id), ['d'])
})

test('owner filter combines with status (AND)', () => {
  assert.deepEqual(filterKeyResults(krs, { ownerId: 'u1' }).map((k) => k.id), ['a', 'c'])
  assert.deepEqual(filterKeyResults(krs, { ownerId: 'u1', status: 'off-track' }).map((k) => k.id), ['c'])
  assert.equal(activeFilterCount({ ownerId: 'u1', status: 'off-track' }), 2)
})
