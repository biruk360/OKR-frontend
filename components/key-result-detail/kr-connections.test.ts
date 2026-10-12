import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConnectionItem, VisibleConnectionItem } from '@/lib/connections/types'
import {
  KR_RAIL_CONNECTION_GROUPS,
  isCompanyLevel,
  progressWidth,
  sortMilestones,
  summarizeLandsIn,
} from './kr-connections'

function visible(partial: Partial<VisibleConnectionItem> & Pick<VisibleConnectionItem, 'id' | 'type' | 'title'>): ConnectionItem {
  return {
    via: 'CONTRIBUTES_TO',
    redacted: false,
    ref: null,
    href: `/x/${partial.id}`,
    status: null,
    progress: null,
    owner: null,
    ...partial,
  } as VisibleConnectionItem
}

function hidden(id: string, type: ConnectionItem['type'] = 'KEY_RESULT'): ConnectionItem {
  return { type, id, via: 'CONTRIBUTES_TO', redacted: true }
}

test('summarizeLandsIn orders objectives before KRs, then owner, then title; private rows last', () => {
  const items: ConnectionItem[] = [
    hidden('p1'),
    visible({ id: 'k2', type: 'KEY_RESULT', title: 'Beta', owner: { id: 'u2', name: 'Zed', avatar: null }, progress: 40 }),
    visible({ id: 'k1', type: 'KEY_RESULT', title: 'Alpha', owner: { id: 'u1', name: 'Abel', avatar: null }, progress: 80 }),
    visible({ id: 'o1', type: 'OBJECTIVE', title: 'Obj', owner: { id: 'u2', name: 'Zed', avatar: null }, progress: null }),
  ]
  const s = summarizeLandsIn(items)
  assert.deepEqual(s.rows.map((r) => r.id), ['o1', 'k1', 'k2', 'p1'])
  assert.equal(s.visibleCount, 3)
  assert.equal(s.privateCount, 1)
  assert.equal(s.ownerCount, 2)
  assert.equal(s.averageProgress, 60)
})

test('summarizeLandsIn: no progress reported → average null; empty input', () => {
  assert.equal(summarizeLandsIn([visible({ id: 'a', type: 'KEY_RESULT', title: 'A' })]).averageProgress, null)
  const empty = summarizeLandsIn([])
  assert.deepEqual(empty, { rows: [], visibleCount: 0, privateCount: 0, ownerCount: 0, averageProgress: null })
})

test('sortMilestones sorts by due date, undated after dated, private last', () => {
  const rows = sortMilestones([
    hidden('m-private', 'MILESTONE'),
    visible({ id: 'm-none', type: 'MILESTONE', title: 'No date', dueDate: null }),
    visible({ id: 'm-late', type: 'MILESTONE', title: 'Late', dueDate: '2026-12-01T00:00:00.000Z' }),
    visible({ id: 'm-early', type: 'MILESTONE', title: 'Early', dueDate: '2026-11-01T00:00:00.000Z' }),
  ])
  assert.deepEqual(rows.map((r) => r.id), ['m-early', 'm-late', 'm-none', 'm-private'])
})

test('progressWidth clamps to 0–100 and treats missing values as 0', () => {
  assert.equal(progressWidth(150), 100)
  assert.equal(progressWidth(-5), 0)
  assert.equal(progressWidth(null), 0)
  assert.equal(progressWidth(Number.NaN), 0)
  assert.equal(progressWidth(42.5), 42.5)
})

test('KR rail panel leaves out the groups that have their own page sections', () => {
  assert.ok(!KR_RAIL_CONNECTION_GROUPS.includes('supportedBy'))
  assert.ok(!KR_RAIL_CONNECTION_GROUPS.includes('milestones'))
  assert.ok(KR_RAIL_CONNECTION_GROUPS.includes('alignsTo'))
  assert.ok(KR_RAIL_CONNECTION_GROUPS.includes('inbound'))
})

test('isCompanyLevel', () => {
  assert.equal(isCompanyLevel('COMPANY'), true)
  assert.equal(isCompanyLevel('DEPARTMENT'), false)
  assert.equal(isCompanyLevel(null), false)
})
