/**
 * Analyze view helpers: multi-owner filter mapping, KPI-8 "Linked to a KPI"
 * segment, per-owner progress series merge.
 *
 * Run: npx tsx --test features/filters/analyze-params.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PER_OWNER_SERIES,
  filterByOwners,
  krSegmentPredicate,
  linkedKpiCount,
  mergeProgressTimeseries,
  multiOwnerParam,
  perOwnerSeriesOwners,
  planSingleOwnerFilter,
} from './analyze-params'
import { SEGMENTS_BY_TAB } from './segments'

test('planSingleOwnerFilter: one owner server side, several client side', () => {
  assert.deepEqual(planSingleOwnerFilter(undefined), { serverOwnerId: null, clientOwnerIds: null })
  assert.deepEqual(planSingleOwnerFilter([]), { serverOwnerId: null, clientOwnerIds: null })
  assert.deepEqual(planSingleOwnerFilter(['u1']), { serverOwnerId: 'u1', clientOwnerIds: null })
  assert.deepEqual(planSingleOwnerFilter(['u1', 'u1', ' ']), { serverOwnerId: 'u1', clientOwnerIds: null })
  const many = planSingleOwnerFilter(['u1', 'u2'])
  assert.equal(many.serverOwnerId, null)
  assert.deepEqual(Array.from(many.clientOwnerIds ?? []), ['u1', 'u2'])
})

test('multiOwnerParam sends every owner to /api/objectives', () => {
  assert.equal(multiOwnerParam(undefined), null)
  assert.equal(multiOwnerParam([]), null)
  assert.equal(multiOwnerParam(['u1']), 'u1')
  assert.equal(multiOwnerParam(['u1', 'u2', 'u1']), 'u1,u2')
})

test('filterByOwners keeps rows of any picked owner and is a no-op without owners', () => {
  const rows = [{ id: 'a', ownerId: 'u1' }, { id: 'b', ownerId: 'u2' }, { id: 'c', ownerId: 'u3' }, { id: 'd', ownerId: null }]
  assert.equal(filterByOwners(rows, null), rows)
  assert.equal(filterByOwners(rows, []), rows)
  assert.deepEqual(filterByOwners(rows, ['u1', 'u3']).map((r) => r.id), ['a', 'c'])
  assert.deepEqual(filterByOwners(rows, new Set(['u2'])).map((r) => r.id), ['b'])
})

test('perOwnerSeriesOwners: only for 2..MAX owners', () => {
  assert.equal(perOwnerSeriesOwners(undefined), null)
  assert.equal(perOwnerSeriesOwners(['u1']), null)
  assert.deepEqual(perOwnerSeriesOwners(['u1', 'u2']), ['u1', 'u2'])
  const tooMany = Array.from({ length: MAX_PER_OWNER_SERIES + 1 }, (_, i) => `u${i}`)
  assert.equal(perOwnerSeriesOwners(tooMany), null)
})

test('mergeProgressTimeseries weights each week by KR count', () => {
  const a = [
    { label: 'Sep 1', date: '2026-09-01T00:00:00.000Z', avgProgress: 50, krCount: 2 },
    { label: 'Sep 8', date: '2026-09-08T00:00:00.000Z', avgProgress: 60, krCount: 2 },
  ]
  const b = [
    { label: 'Sep 1', date: '2026-09-01T00:00:00.000Z', avgProgress: 20, krCount: 1 },
    { label: 'Sep 8', date: '2026-09-08T00:00:00.000Z', avgProgress: 0, krCount: 0 },
  ]
  assert.deepEqual(mergeProgressTimeseries([]), [])
  assert.equal(mergeProgressTimeseries([a, []]), a)
  assert.deepEqual(mergeProgressTimeseries([a, b]), [
    { label: 'Sep 1', date: '2026-09-01T00:00:00.000Z', avgProgress: 40, krCount: 3 },
    { label: 'Sep 8', date: '2026-09-08T00:00:00.000Z', avgProgress: 60, krCount: 2 },
  ])
  const empty = [{ label: 'Sep 1', date: '2026-09-01T00:00:00.000Z', avgProgress: 0, krCount: 0 }]
  assert.deepEqual(mergeProgressTimeseries([empty, empty]), empty)
})

test('KPI-8: the "Tagged as KPI" segment is repointed to "Linked to a KPI"', () => {
  const insights = SEGMENTS_BY_TAB['key-results'].find((g) => g.group === 'INSIGHTS')!
  const seg = insights.items.find((i) => i.id === 'kr-tagged-kpi')!
  assert.equal(seg.label, 'Linked to a KPI')
  assert.ok(!insights.items.some((i) => /tagged as kpi/i.test(i.label)))

  assert.equal(linkedKpiCount({ _count: { todos: 1, kpis: 2 } }), 2)
  assert.equal(linkedKpiCount({ kpiCount: 0 }), 0)
  assert.equal(linkedKpiCount({ kpis: [{ id: 'k1' }] }), 1)
  assert.equal(linkedKpiCount({ _count: { todos: 3 } }), null)

  const linked = krSegmentPredicate('kr-tagged-kpi')!
  assert.equal(linked({ _count: { kpis: 1 } }), true)
  assert.equal(linked({ _count: { kpis: 0 } }), false)
  // A list response without KPI data never puts every KR in the segment.
  assert.equal(linked({ _count: { todos: 4 } }), false)
})

test('commitment segments filter on KR.commitment; other segments need no client filter', () => {
  const committed = krSegmentPredicate('kr-committed')!
  const aspirational = krSegmentPredicate('kr-aspirational')!
  assert.equal(committed({ commitment: 'COMMITTED' }), true)
  assert.equal(committed({ commitment: 'aspirational' }), false)
  assert.equal(aspirational({ commitment: 'aspirational' }), true)
  assert.equal(aspirational({ commitment: null }), false)
  assert.equal(krSegmentPredicate('kr-active'), null)
  assert.equal(krSegmentPredicate(null), null)
})
