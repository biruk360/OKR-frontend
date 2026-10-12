import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConnectionSummary,
  decisionOverdue,
  dedupeConnectionItems,
  dependencyDirection,
  dependencyTiming,
  groupDependencies,
  sortDependencies,
} from './flags'
import type { ConnectionDependency, ConnectionItem } from './types'

// Wednesday 2026-10-14, mid-afternoon local time.
const NOW = new Date(2026, 9, 14, 15, 30)
const day = (offset: number, hour = 0) => new Date(2026, 9, 14 + offset, hour)

test('DEP-2: late when open and needed before today', () => {
  assert.deepEqual(dependencyTiming({ status: 'OPEN', neededByDate: day(-1) }, NOW), { late: true, dueSoon: false, open: true })
  assert.deepEqual(dependencyTiming({ status: 'BLOCKED', neededByDate: day(-30) }, NOW), { late: true, dueSoon: false, open: true })
})

test('DEP-2: needed today is due soon, not late', () => {
  assert.deepEqual(dependencyTiming({ status: 'IN_PROGRESS', neededByDate: day(0) }, NOW), { late: false, dueSoon: true, open: true })
  assert.deepEqual(dependencyTiming({ status: 'OPEN', neededByDate: day(0, 9) }, NOW), { late: false, dueSoon: true, open: true })
})

test('DEP-2: due soon covers the next 7 days (today + 6)', () => {
  assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(6) }, NOW).dueSoon, true)
  assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(7) }, NOW).dueSoon, false)
})

test('DEP-2: DONE / DROPPED and undated dependencies are never late or due soon', () => {
  assert.deepEqual(dependencyTiming({ status: 'DONE', neededByDate: day(-5) }, NOW), { late: false, dueSoon: false, open: false })
  assert.deepEqual(dependencyTiming({ status: 'DROPPED', neededByDate: day(1) }, NOW), { late: false, dueSoon: false, open: false })
  assert.deepEqual(dependencyTiming({ status: 'OPEN', neededByDate: null }, NOW), { late: false, dueSoon: false, open: true })
  // ISO strings work too.
  assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(-2).toISOString() }, NOW).late, true)
})

test('decisionOverdue: only OPEN decisions past their needed-by day', () => {
  assert.equal(decisionOverdue({ status: 'OPEN', neededBy: day(-1) }, NOW), true)
  assert.equal(decisionOverdue({ status: 'OPEN', neededBy: day(0) }, NOW), false)
  assert.equal(decisionOverdue({ status: 'DECIDED', neededBy: day(-10) }, NOW), false)
  assert.equal(decisionOverdue({ status: 'OPEN', neededBy: null }, NOW), false)
})

test('dependencyDirection: provider-only owner → OUTBOUND, otherwise INBOUND', () => {
  const parties = [
    { userId: 'alice', role: 'PROVIDER' },
    { userId: 'bob', role: 'NEEDER' },
    { userId: 'carol', role: 'PROVIDER' },
    { userId: 'carol', role: 'NEEDER' },
  ]
  assert.equal(dependencyDirection('alice', parties), 'OUTBOUND')
  assert.equal(dependencyDirection('bob', parties), 'INBOUND')
  assert.equal(dependencyDirection('carol', parties), 'INBOUND')
  assert.equal(dependencyDirection('dave', parties), 'INBOUND')
  assert.equal(dependencyDirection(null, parties), 'INBOUND')
})

function dep(id: string, over: Partial<ConnectionDependency>): ConnectionDependency {
  return {
    type: 'DEPENDENCY',
    id,
    ref: id.toUpperCase(),
    title: `Dependency ${id}`,
    depType: 'OTHER',
    status: 'OPEN',
    neededByDate: null,
    direction: 'INBOUND',
    providers: [],
    needers: [],
    decisionId: null,
    href: `/dashboard/okrs-all/dependencies?dependency=${id}`,
    late: false,
    dueSoon: false,
    open: true,
    ...over,
  }
}

test('sortDependencies: late → due soon → open → done, then by date', () => {
  const rows = [
    dep('done', { status: 'DONE', open: false, neededByDate: day(-3).toISOString() }),
    dep('open-undated', {}),
    dep('open-later', { neededByDate: day(20).toISOString() }),
    dep('soon', { dueSoon: true, neededByDate: day(2).toISOString() }),
    dep('late-2', { late: true, neededByDate: day(-1).toISOString() }),
    dep('late-1', { late: true, neededByDate: day(-5).toISOString() }),
  ]
  assert.deepEqual(
    sortDependencies(rows).map((d) => d.id),
    ['late-1', 'late-2', 'soon', 'open-later', 'open-undated', 'done'],
  )
})

test('groupDependencies + summary: chips count late inbound, open inbound, open outbound', () => {
  const groups = groupDependencies([
    dep('dep14', { late: true }),
    dep('dep15', {}),
    dep('dep16', { status: 'DONE', open: false }),
    dep('x03', { direction: 'OUTBOUND', dueSoon: true }),
    dep('x04', { direction: 'OUTBOUND' }),
    dep('x05', { direction: 'OUTBOUND', status: 'DROPPED', open: false }),
  ])
  assert.deepEqual(groups.inbound.map((d) => d.id), ['dep14', 'dep15', 'dep16'])
  assert.deepEqual(groups.outbound.map((d) => d.id), ['x03', 'x04', 'x05'])

  const summary = buildConnectionSummary({
    alignsTo: [],
    supportedBy: [],
    predecessors: [],
    successors: [],
    dependencies: groups,
    decisions: [{ type: 'DECISION', id: 'd46', redacted: true }],
    kpis: [],
    duties: [],
    development: [],
    milestones: [],
  })
  assert.equal(summary.blockedBy, 1)
  assert.deepEqual(summary.blockedByRefs, ['DEP14'])
  assert.equal(summary.waitingOn, 2)
  assert.equal(summary.waitingOnThis, 2)
  assert.equal(summary.outboundDueSoon, 1)
  assert.equal(summary.openDecisions, 1)
})

test('dedupeConnectionItems keeps the first row and borrows link fields', () => {
  const parent: ConnectionItem = { type: 'OBJECTIVE', id: 'o1', via: 'PARENT', redacted: true }
  const viaLink: ConnectionItem = {
    type: 'OBJECTIVE',
    id: 'o1',
    via: 'CONTRIBUTES_TO',
    linkId: 'l1',
    linkKind: 'CONTRIBUTES_TO',
    subKind: null,
    isPrimary: false,
    redacted: true,
  }
  const other: ConnectionItem = { type: 'KEY_RESULT', id: 'o1', via: 'CONTRIBUTES_TO', redacted: true }
  const out = dedupeConnectionItems([parent, viaLink, other])
  assert.equal(out.length, 2)
  assert.equal(out[0].via, 'PARENT')
  assert.equal(out[0].linkId, 'l1')
  assert.equal(out[1].type, 'KEY_RESULT')
})
