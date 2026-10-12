import test from 'node:test'
import assert from 'node:assert/strict'
import { Counters, diffFields, dryId, isDryId, pick } from './sync'

test('diffFields compares dates, numbers, json and nulls', () => {
  const existing = {
    title: 'A',
    dueDate: new Date('2026-10-23T00:00:00.000Z'),
    progressValue: 33.33,
    summaryJson: { lines: [{ label: 'Quota', value: 'ETB 100M' }] },
    description: null,
  }
  assert.equal(
    diffFields(existing, { title: 'A', dueDate: new Date('2026-10-23T00:00:00.000Z'), progressValue: 33.33, summaryJson: { lines: [{ label: 'Quota', value: 'ETB 100M' }] }, description: undefined }, [
      'title',
      'dueDate',
      'progressValue',
      'summaryJson',
      'description',
    ]),
    null,
  )
  const changes = diffFields(existing, { title: 'B', dueDate: new Date('2026-10-30T00:00:00.000Z') }, ['title', 'dueDate', 'progressValue'])
  assert.deepEqual(changes, { title: { from: 'A', to: 'B' }, dueDate: { from: '2026-10-23T00:00:00.000Z', to: '2026-10-30T00:00:00.000Z' } })
})

test('pick, dry ids, counters', () => {
  assert.deepEqual(pick({ a: 1, b: 2 }, ['b', 'c']), { b: 2 })
  assert.equal(isDryId(dryId('Kpi', 'EDN-K01')), true)
  assert.equal(isDryId('ckxyz'), false)
  const c = new Counters()
  c.bump('Kpi', 'create')
  c.bump('Kpi', 'unchanged', 3)
  assert.equal(c.total('Kpi'), 4)
  assert.deepEqual(c.get('Missing'), { create: 0, update: 0, unchanged: 0, skip: 0 })
})

test('json comparison ignores key order (jsonb)', () => {
  assert.equal(diffFields({ j: { b: 1, a: [{ y: 2, x: 1 }] } }, { j: { a: [{ x: 1, y: 2 }], b: 1 } }, ['j']), null)
})
