import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseResultsSort, resultsCsvTable, sortOptionsForTab, sortResults } from './sort'
import type { FilteredResult } from './types'

const r = (id: string, extra: Partial<FilteredResult>): FilteredResult => ({
  id, title: id, planId: 'p', planName: 'Plan', entityType: 'objectives', ...extra,
})

const rows = [
  r('b', { progress: 40, confidence: 'ON_TRACK', dueDate: '2026-12-31', updatedAt: '2026-09-01T00:00:00Z' }),
  r('a', { progress: 90, confidence: 'OFF_TRACK', updatedAt: '2026-09-20T00:00:00Z' }),
  r('c', { progress: 10, dueDate: '2026-10-01', updatedAt: '2026-09-10T00:00:00Z' }),
]
const ids = (list: FilteredResult[]) => list.map((x) => x.id).join('')

describe('filters sort', () => {
  it('keeps API order for the default plan sort', () => {
    assert.equal(ids(sortResults(rows, { key: 'plan', dir: 'asc' })), 'bac')
  })
  it('sorts by progress both ways', () => {
    assert.equal(ids(sortResults(rows, { key: 'progress', dir: 'asc' })), 'cba')
    assert.equal(ids(sortResults(rows, { key: 'progress', dir: 'desc' })), 'abc')
  })
  it('ranks confidence worst-first and keeps missing values last in both directions', () => {
    assert.equal(ids(sortResults(rows, { key: 'confidence', dir: 'asc' })), 'abc')
    assert.equal(ids(sortResults(rows, { key: 'confidence', dir: 'desc' })), 'bac')
    assert.equal(ids(sortResults(rows, { key: 'due', dir: 'desc' })), 'bca')
  })
  it('sorts by updated and title', () => {
    assert.equal(ids(sortResults(rows, { key: 'updated', dir: 'desc' })), 'acb')
    assert.equal(ids(sortResults(rows, { key: 'title', dir: 'asc' })), 'abc')
  })
  it('parses URL params defensively', () => {
    assert.deepEqual(parseResultsSort('progress', 'desc'), { key: 'progress', dir: 'desc' })
    assert.deepEqual(parseResultsSort('updated', null), { key: 'updated', dir: 'desc' })
    assert.deepEqual(parseResultsSort('bogus', 'asc'), { key: 'plan', dir: 'asc' })
  })
  it('hides the due-date sort on key results', () => {
    assert.ok(!sortOptionsForTab('key-results').some((o) => o.value === 'due'))
    assert.ok(sortOptionsForTab('objectives').some((o) => o.value === 'due'))
  })
  it('builds a CSV table with one row per result', () => {
    const table = resultsCsvTable(rows, 'objectives')
    assert.equal(table.rows.length, 3)
    assert.equal(table.header[0], 'Objective')
  })
})
