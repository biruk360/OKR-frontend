import { test } from 'node:test'
import assert from 'node:assert/strict'
import type {
  ConnectionDependency,
  ConnectionItem,
  ConnectionsPayload,
  ConnectionSummary,
} from '@/lib/connections/types'
import {
  PRIVATE_ITEM_LABEL,
  buildConnectionChips,
  buildConnectionGroups,
  connectionItemShortLabel,
  connectionItemTitle,
  connectionStatusDisplay,
  connectionViaLabel,
  dependencyStatusLabel,
  dependencyTone,
  formatGrade,
  humanizeEnum,
  isConnectionsPayloadEmpty,
  sharedTimeframeName,
} from './connection-display'

const EMPTY_SUMMARY: ConnectionSummary = {
  alignsTo: 0, supportedBy: 0, predecessors: 0, successors: 0, blockedBy: 0, blockedByRefs: [],
  waitingOn: 0, waitingOnThis: 0, outboundDueSoon: 0, openDecisions: 0, kpis: 0, duties: 0, development: 0, milestones: 0,
}

function payload(over: Partial<ConnectionsPayload> = {}): ConnectionsPayload {
  return {
    subject: { type: 'KEY_RESULT', id: 'kr1', title: 'Subject', redacted: false },
    alignsTo: [], supportedBy: [], predecessors: [], successors: [],
    dependencies: { inbound: [], outbound: [] },
    decisions: [], kpis: [], duties: [], development: [], milestones: [],
    summary: EMPTY_SUMMARY,
    permissions: { canManageLinks: false },
    ...over,
  }
}

function visible(over: Partial<Extract<ConnectionItem, { redacted: false }>> = {}): ConnectionItem {
  return {
    type: 'OBJECTIVE', id: 'o1', via: 'PARENT', redacted: false, title: 'Grow revenue', ref: null,
    href: '/dashboard/objectives/o1', status: 'ON_TRACK', progress: 40, owner: null,
    ...over,
  }
}

function dep(over: Partial<ConnectionDependency> = {}): ConnectionDependency {
  return {
    type: 'DEPENDENCY', id: 'd1', ref: 'DEP12', title: 'Budget approval', depType: 'BUDGET', status: 'OPEN',
    neededByDate: null, direction: 'INBOUND', providers: [], needers: [], decisionId: null, href: '/x',
    late: false, dueSoon: false, open: true,
    ...over,
  }
}

test('CON-8: a redacted item is labelled "Private item" and never shows a title', () => {
  const redacted: ConnectionItem = { type: 'KEY_RESULT', id: 'k9', via: 'CONTRIBUTES_TO', redacted: true }
  assert.equal(connectionItemTitle(redacted), PRIVATE_ITEM_LABEL)
  assert.equal(connectionItemShortLabel(redacted), PRIVATE_ITEM_LABEL)
  const chips = buildConnectionChips(payload({ alignsTo: [redacted] }))
  assert.equal(chips[0].label, `Aligns to ${PRIVATE_ITEM_LABEL}`)
  assert.ok(!JSON.stringify(chips).includes('undefined'))
})

test('short label prefers the workbook ref, then a truncated title', () => {
  assert.equal(connectionItemShortLabel(visible({ ref: 'KR1.3' })), 'KR1.3')
  const long = visible({ title: 'A very long objective title that keeps going on and on' })
  const label = connectionItemShortLabel(long, 20)
  assert.equal(label.length, 20)
  assert.ok(label.endsWith('…'))
})

test('via label shows the SUCCEEDS sub-kind and primary flag', () => {
  assert.equal(connectionViaLabel({ via: 'SUCCEEDS', subKind: 'CARRIED', isPrimary: true }), 'Carried · Primary')
  assert.equal(connectionViaLabel({ via: 'SUCCEEDS', subKind: null, isPrimary: false }), 'Succeeds')
  assert.equal(connectionViaLabel({ via: 'CONTRIBUTES_TO' }), 'Contributes')
})

test('CON-1 chip set: order, labels and the blocked/waiting split', () => {
  const p = payload({
    alignsTo: [visible({ ref: 'KR1.3', type: 'KEY_RESULT', via: 'CONTRIBUTES_TO' })],
    supportedBy: [visible({ id: 'a' }), visible({ id: 'b' })],
    predecessors: [
      visible({ id: 'p1', via: 'SUCCEEDS', timeframe: { id: 't', name: 'FY25/26' } }),
      visible({ id: 'p2', via: 'SUCCEEDS', timeframe: { id: 't', name: 'FY25/26' } }),
    ],
    decisions: [{ type: 'DECISION', id: 'x', redacted: false, ref: 'D46', title: 'Pick vendor', status: 'OPEN', neededBy: null, overdue: false, batch: null, decider: null, href: '/d' }],
    kpis: [visible({ type: 'KPI', id: 'kpi', via: 'ATTACHED' })],
    summary: { ...EMPTY_SUMMARY, blockedBy: 1, blockedByRefs: ['DEP12'], waitingOn: 3, waitingOnThis: 2, outboundDueSoon: 1 },
  })
  const chips = buildConnectionChips(p)
  assert.deepEqual(chips.map((c) => c.kind), ['alignsTo', 'supportedBy', 'predecessors', 'blockedBy', 'waitingOn', 'waitingOnThis', 'decisions', 'kpis'])
  const byKind = Object.fromEntries(chips.map((c) => [c.kind, c]))
  assert.equal(byKind.alignsTo.label, 'Aligns to KR1.3')
  assert.equal(byKind.supportedBy.label, 'Supported by 2')
  assert.equal(byKind.predecessors.label, 'From FY25/26')
  assert.equal(byKind.blockedBy.label, 'Blocked by DEP12')
  assert.equal(byKind.blockedBy.tone, 'danger')
  // 3 open inbound, 1 of them late → "Waiting on 2" next to "Blocked by".
  assert.equal(byKind.waitingOn.count, 2)
  assert.equal(byKind.waitingOnThis.tone, 'warn')
  assert.equal(byKind.decisions.label, 'Decision D46')
  assert.equal(byKind.kpis.label, 'KPI')
})

test('hide drops chip kinds; hiding "blockedBy" folds late ones back into "Waiting on"', () => {
  const p = payload({ summary: { ...EMPTY_SUMMARY, blockedBy: 1, blockedByRefs: ['DEP1'], waitingOn: 3 } })
  const chips = buildConnectionChips(p, { hide: ['blockedBy'] })
  assert.deepEqual(chips.map((c) => c.kind), ['waitingOn'])
  assert.equal(chips[0].count, 3)
})

test('an item with no connections has no chips and no groups', () => {
  const p = payload()
  assert.equal(buildConnectionChips(p).length, 0)
  assert.equal(isConnectionsPayloadEmpty(p), true)
})

test('CON-2 groups keep display order and drop empty ones', () => {
  const p = payload({
    milestones: [visible({ type: 'MILESTONE', id: 'm', via: 'ATTACHED' })],
    alignsTo: [visible()],
    dependencies: { inbound: [dep()], outbound: [] },
  })
  assert.deepEqual(buildConnectionGroups(p).map((g) => g.key), ['alignsTo', 'inbound', 'milestones'])
})

test('shared timeframe name needs every item visible and in the same timeframe', () => {
  const a = visible({ timeframe: { id: '1', name: 'FY25/26' } })
  const b = visible({ id: 'b', timeframe: { id: '1', name: 'FY25/26' } })
  assert.equal(sharedTimeframeName([a, b]), 'FY25/26')
  assert.equal(sharedTimeframeName([a, visible({ id: 'c', timeframe: { id: '2', name: 'FY26/27' } })]), null)
  assert.equal(sharedTimeframeName([a, { type: 'OBJECTIVE', id: 'r', via: 'SUCCEEDS', redacted: true }]), null)
})

test('status, dependency tone and grade formatting', () => {
  assert.deepEqual(connectionStatusDisplay('AT_RISK'), { label: 'At risk', tone: 'warn' })
  assert.equal(connectionStatusDisplay('PAUSED')?.tone, 'warn')
  assert.equal(connectionStatusDisplay(null), null)
  assert.equal(humanizeEnum('NOT_STARTED'), 'Not started')
  assert.equal(dependencyTone(dep({ late: true })), 'danger')
  assert.equal(dependencyTone(dep({ dueSoon: true })), 'warn')
  assert.equal(dependencyTone(dep({ open: false, status: 'DONE' })), 'ok')
  assert.equal(dependencyStatusLabel(dep({ late: true })), 'Late')
  assert.equal(formatGrade(0.7), '0.70')
  assert.equal(formatGrade(null), '—')
})
