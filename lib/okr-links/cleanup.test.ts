import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planLineageReRoot } from './cleanup'

test('planLineageReRoot detaches direct successors and re-roots deeper descendants', () => {
  // root(X, deleted) -> A -> B -> C ; X -> D
  const plan = planLineageReRoot('X', [
    { id: 'A', rolledFromId: 'X' },
    { id: 'B', rolledFromId: 'A' },
    { id: 'C', rolledFromId: 'B' },
    { id: 'D', rolledFromId: 'X' },
  ])
  assert.deepEqual(plan.detach.sort(), ['A', 'D'])
  assert.deepEqual(plan.reRoot, [{ root: 'A', ids: ['B', 'C'] }])
})

test('planLineageReRoot clears the root of orphans whose chain does not reach the deleted node', () => {
  const plan = planLineageReRoot('X', [{ id: 'E', rolledFromId: 'Z' }])
  assert.deepEqual(plan.detach, [])
  assert.deepEqual(plan.reRoot, [{ root: null, ids: ['E'] }])
})

test('planLineageReRoot is a no-op for an empty lineage', () => {
  assert.deepEqual(planLineageReRoot('X', []), { detach: [], reRoot: [] })
})
