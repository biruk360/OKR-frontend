import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDependencyCsv,
  buildProfileSummary,
  canSetStatus,
  csvCell,
  dependencyTiming,
  isPackageLinkRef,
  matchesDueWindow,
  personCounts,
  personRoles,
  splitParties,
  splitPersonRows,
  statusActionsFor,
  statusTransition,
} from './rules'
import type { DependencyDetailRow, DependencyRow, DependencySummaryRow } from '../types'

// 2026-10-12 10:00 local — "today" for every case below.
const NOW = new Date(2026, 9, 12, 10, 0, 0)
const day = (offset: number) => new Date(2026, 9, 12 + offset, 0, 0, 0).toISOString()

function row(partial: Partial<DependencyDetailRow> & { id: string }): DependencyDetailRow {
  const status = partial.status ?? 'OPEN'
  const neededByDate = partial.neededByDate ?? null
  const timing = dependencyTiming({ status, neededByDate }, NOW)
  return {
    detail: true,
    ref: null,
    title: partial.id,
    depType: 'OTHER',
    timeframe: null,
    href: `/dashboard/okrs-all/dependencies?dependency=${partial.id}`,
    unblocksText: null,
    note: null,
    doneAt: null,
    decisionId: null,
    deliveryTodoId: null,
    isPackageLink: false,
    providers: [],
    needers: [],
    links: [],
    createdBy: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    permissions: { canEdit: false, canChangeStatus: false, canDrop: false, canCreateDeliveryTask: false },
    viewerIsProvider: false,
    viewerIsNeeder: false,
    ...partial,
    status,
    neededByDate,
    ...timing,
  }
}

describe('DEP-7 package link refs', () => {
  it('treats X-prefixed workbook ids as package-specific links', () => {
    assert.equal(isPackageLinkRef('X03'), true)
    assert.equal(isPackageLinkRef('x12'), true)
    assert.equal(isPackageLinkRef('DEP14'), false)
    assert.equal(isPackageLinkRef('XYZ'), false)
    assert.equal(isPackageLinkRef(null), false)
  })
})

describe('DEP-1 inbound / outbound derivation', () => {
  const parties = [
    { userId: 'a', role: 'PROVIDER' },
    { userId: 'b', role: 'NEEDER' },
    { userId: 'c', role: 'PROVIDER' },
    { userId: 'c', role: 'NEEDER' },
  ]
  it('needers see it inbound, providers outbound, both when both', () => {
    assert.deepEqual(personRoles(parties, 'a'), { inbound: false, outbound: true })
    assert.deepEqual(personRoles(parties, 'b'), { inbound: true, outbound: false })
    assert.deepEqual(personRoles(parties, 'c'), { inbound: true, outbound: true })
    assert.deepEqual(personRoles(parties, 'z'), { inbound: false, outbound: false })
  })
  it('keeps provider order (first provider owns the delivery task)', () => {
    assert.deepEqual(splitParties(parties), { providerIds: ['a', 'c'], neederIds: ['b', 'c'] })
  })
})

describe('DEP-2 timing boundaries', () => {
  it('late = open and needed before today; due soon = today … +6', () => {
    assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(-1) }, NOW).late, true)
    assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(0) }, NOW).late, false)
    assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(0) }, NOW).dueSoon, true)
    assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(6) }, NOW).dueSoon, true)
    assert.equal(dependencyTiming({ status: 'OPEN', neededByDate: day(7) }, NOW).dueSoon, false)
  })
  it('DONE and DROPPED are never late', () => {
    assert.equal(dependencyTiming({ status: 'DONE', neededByDate: day(-5) }, NOW).late, false)
    assert.equal(dependencyTiming({ status: 'DROPPED', neededByDate: day(-5) }, NOW).late, false)
    assert.equal(dependencyTiming({ status: 'BLOCKED', neededByDate: day(-5) }, NOW).late, true)
  })
  it('due windows', () => {
    assert.equal(matchesDueWindow({ status: 'OPEN', neededByDate: day(-1) }, 'late', NOW), true)
    assert.equal(matchesDueWindow({ status: 'OPEN', neededByDate: day(3) }, 'due_soon', NOW), true)
    assert.equal(matchesDueWindow({ status: 'OPEN', neededByDate: day(20) }, 'next_30', NOW), true)
    assert.equal(matchesDueWindow({ status: 'OPEN', neededByDate: day(30) }, 'next_30', NOW), false)
    assert.equal(matchesDueWindow({ status: 'DONE', neededByDate: day(20) }, 'next_30', NOW), false)
    assert.equal(matchesDueWindow({ status: 'OPEN', neededByDate: null }, 'no_date', NOW), true)
  })
})

describe('DEP-5 status transitions', () => {
  it('entering DONE stamps doneAt and notifies once', () => {
    const t = statusTransition({ status: 'IN_PROGRESS', doneAt: null }, 'DONE', NOW)
    assert.deepEqual(t, { changed: true, doneAt: NOW, becameDone: true, reopened: false })
  })
  it('DONE → DONE is a no-op (no second notification)', () => {
    const doneAt = new Date(2026, 9, 1)
    const t = statusTransition({ status: 'DONE', doneAt }, 'DONE', NOW)
    assert.equal(t.changed, false)
    assert.equal(t.becameDone, false)
    assert.equal(t.doneAt, doneAt)
  })
  it('reopening clears doneAt', () => {
    const t = statusTransition({ status: 'DONE', doneAt: new Date() }, 'OPEN', NOW)
    assert.deepEqual(t, { changed: true, doneAt: null, becameDone: false, reopened: true })
  })
})

describe('status permissions', () => {
  it('providers change status but cannot drop; editors can', () => {
    const provider = { canChangeStatus: true, canDrop: false }
    assert.equal(canSetStatus(provider, 'DONE'), true)
    assert.equal(canSetStatus(provider, 'BLOCKED'), true)
    assert.equal(canSetStatus(provider, 'DROPPED'), false)
    assert.equal(canSetStatus({ canChangeStatus: true, canDrop: true }, 'DROPPED'), true)
    assert.equal(canSetStatus({ canChangeStatus: false, canDrop: false }, 'DONE'), false)
  })
  it('lists the actions the row allows, excluding the current status', () => {
    const r = row({ id: 'r', status: 'OPEN', permissions: { canEdit: false, canChangeStatus: true, canDrop: false, canCreateDeliveryTask: true } })
    assert.deepEqual(statusActionsFor(r), ['IN_PROGRESS', 'DONE', 'BLOCKED'])
  })
})

describe('PRF-16 ordering and counts', () => {
  const rows = [
    { row: row({ id: 'done', status: 'DONE', neededByDate: day(-3) }), inbound: true, outbound: false },
    { row: row({ id: 'open-later', neededByDate: day(20) }), inbound: true, outbound: false },
    { row: row({ id: 'late', neededByDate: day(-2) }), inbound: true, outbound: false },
    { row: row({ id: 'soon', neededByDate: day(2) }), inbound: true, outbound: true },
    { row: row({ id: 'undated' }), inbound: false, outbound: true },
  ]
  it('sorts late → due soon → open → done', () => {
    const { inbound, outbound } = splitPersonRows(rows)
    assert.deepEqual(inbound.map((r) => r.id), ['late', 'soon', 'open-later', 'done'])
    assert.deepEqual(outbound.map((r) => r.id), ['soon', 'undated'])
  })
  it('counts and the overview summary', () => {
    const { inbound, outbound } = splitPersonRows(rows)
    assert.deepEqual(personCounts(inbound, outbound), {
      inboundLate: 1,
      inboundOpen: 3,
      outboundLate: 0,
      outboundDueSoon: 1,
      outboundOpen: 2,
    })
    const summary = buildProfileSummary(inbound, outbound)
    assert.equal(summary.inboundLate, 1)
    assert.equal(summary.outboundOpen, 2)
    assert.deepEqual(summary.topInbound.map((t) => t.id), ['late', 'soon', 'open-later'])
  })
})

describe('DEP-6 CSV', () => {
  it('quotes, guards formulas and blanks private columns on summary rows', () => {
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
    assert.equal(csvCell(null), '')

    const detail = row({
      id: 'd1',
      ref: 'DEP14',
      title: 'Map, v2',
      neededByDate: day(-1),
      providers: [{ id: 'p', name: 'Pat', avatar: null }],
      needers: [{ id: 'n', name: 'Nia', avatar: null }],
      links: [
        { entityType: 'KEY_RESULT', entityId: 'k', redacted: false, title: 'Grow', ref: 'KR1', href: '/x' },
        { entityType: 'OBJECTIVE', entityId: 'o', redacted: true, title: null, ref: null, href: null },
      ],
    })
    const summary: DependencySummaryRow = {
      detail: false,
      id: 's1',
      ref: 'X03',
      title: 'Secret',
      depType: 'DATA',
      status: 'OPEN',
      neededByDate: null,
      timeframe: { id: 't', name: 'FY27' },
      href: '/x',
      late: false,
      dueSoon: false,
      open: true,
    }
    const csv = buildDependencyCsv([detail, summary] as DependencyRow[])
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')
    assert.equal(lines.length, 3)
    assert.match(lines[0], /^Ref,Title,Type,Status/)
    assert.match(lines[1], /^DEP14,"Map, v2",Other,Open,\d{4}-\d{2}-\d{2},Yes,,Pat,Nia,,KR1 Grow; Private item,,,$/)
    assert.equal(lines[2], 'X03,Secret,Data,Open,,,,,,,,,FY27,')
  })
})
