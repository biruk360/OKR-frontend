import test from 'node:test'
import assert from 'node:assert/strict'
import {
  laneForStatus,
  resolveLane,
  isBoardStatusKey,
  DEFAULT_LANES,
  type LaneShape,
} from './columns'

function lane(overrides: Partial<LaneShape> = {}): LaneShape {
  return {
    id: 'c1',
    sprintId: 's1',
    name: 'To Do',
    statusKey: 'PENDING',
    position: 0,
    color: null,
    archivedAt: null,
    ...overrides,
  }
}

const LANES: LaneShape[] = [
  lane({ id: 'todo', name: 'To Do', statusKey: 'PENDING', position: 0 }),
  lane({ id: 'doing', name: 'Doing', statusKey: 'IN_PROGRESS', position: 1 }),
  lane({ id: 'qa', name: 'QA', statusKey: 'IN_REVIEW', position: 2 }),
  lane({ id: 'review', name: 'Review', statusKey: 'IN_REVIEW', position: 3 }),
  lane({ id: 'done', name: 'Done', statusKey: 'COMPLETED', position: 4 }),
  lane({ id: 'shipped', name: 'Shipped', statusKey: 'COMPLETED', position: 5 }),
]

test('T-01: default lanes cover every board status exactly once', () => {
  const keys = DEFAULT_LANES.map((l) => l.statusKey)
  assert.deepEqual(keys, ['PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'STUCK', 'COMPLETED'])
  assert.equal(new Set(keys).size, keys.length)
  // Positions must be dense and ordered, or the board renders in a random order.
  assert.deepEqual(DEFAULT_LANES.map((l) => l.position), [0, 1, 2, 3, 4])
})

test('T-02: isBoardStatusKey accepts board statuses and rejects everything else', () => {
  for (const ok of ['PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'STUCK', 'COMPLETED']) {
    assert.equal(isBoardStatusKey(ok), true, ok)
  }
  // CANCELLED is a real TodoStatus but has no lane — it must not be selectable.
  assert.equal(isBoardStatusKey('CANCELLED'), false)
  assert.equal(isBoardStatusKey('pending'), false)
  assert.equal(isBoardStatusKey(''), false)
  assert.equal(isBoardStatusKey(null), false)
  assert.equal(isBoardStatusKey(undefined), false)
  assert.equal(isBoardStatusKey(42), false)
})

test('T-03: laneForStatus returns the first lane sharing a status', () => {
  // Two lanes map to IN_REVIEW; the earlier one wins so placement is deterministic.
  assert.equal(laneForStatus(LANES, 'IN_REVIEW')?.id, 'qa')
  assert.equal(laneForStatus(LANES, 'COMPLETED')?.id, 'done')
  assert.equal(laneForStatus(LANES, 'PENDING')?.id, 'todo')
})

test('T-04: laneForStatus returns null for a status no lane represents', () => {
  assert.equal(laneForStatus(LANES, 'CANCELLED'), null)
  assert.equal(laneForStatus([], 'PENDING'), null)
})

test('T-05: resolveLane honours an explicit columnId over the status fallback', () => {
  // A card parked in "Review" must stay there, not jump to "QA" just because QA
  // is the first IN_REVIEW lane.
  const resolved = resolveLane(LANES, { columnId: 'review', status: 'IN_REVIEW' })
  assert.equal(resolved?.id, 'review')
})

test('T-06: resolveLane falls back to status when columnId is null', () => {
  // Pre-backfill rows have no columnId and must still render.
  assert.equal(resolveLane(LANES, { columnId: null, status: 'IN_PROGRESS' })?.id, 'doing')
})

test('T-07: resolveLane falls back to status when the lane was archived', () => {
  // Archived lanes are absent from the active list; the card must not vanish.
  assert.equal(resolveLane(LANES, { columnId: 'archived-lane', status: 'COMPLETED' })?.id, 'done')
})

test('T-08: resolveLane returns null when nothing can hold the card', () => {
  // CANCELLED cards are deliberately excluded from the board.
  assert.equal(resolveLane(LANES, { columnId: null, status: 'CANCELLED' }), null)
  assert.equal(resolveLane(LANES, { columnId: 'gone', status: 'CANCELLED' }), null)
})

test('T-09: multiple COMPLETED lanes still resolve independently', () => {
  // The regression this guards: completion maths reads Todo.status, so both
  // lanes must be reachable and keep their own identity.
  assert.equal(resolveLane(LANES, { columnId: 'shipped', status: 'COMPLETED' })?.id, 'shipped')
  assert.equal(resolveLane(LANES, { columnId: 'done', status: 'COMPLETED' })?.id, 'done')
  const completedLanes = LANES.filter((l) => l.statusKey === 'COMPLETED')
  assert.equal(completedLanes.length, 2)
})
