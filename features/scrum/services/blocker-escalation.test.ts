import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  carryBlockerEscalation,
  decideAutoEscalation,
  decideBlockerLifecycle,
  type BlockerEscalationState,
} from './blocker-lifecycle'

const settings = {
  timezone: 'Africa/Addis_Ababa',
  workingDays: [1, 2, 3, 4, 5],
  holidays: [] as string[],
  recurringThresholdDays: 2,
  escalationThresholdDays: 3,
}

interface Row extends BlockerEscalationState {
  day: string
  text: string | null
  category: string | null
  status: string | null
  daysOpen: number
  firstRaisedAt: Date | null
}

/** Mirrors saveScrumUpdate: lifecycle decision + escalation carry from the previous working day. */
function submit(day: string, prev: Row | null, text: string | null, opts: { sameBlocker?: boolean; existingSameDay?: Row } = {}): Row {
  const now = new Date(`${day}T05:30:00.000Z`) // 08:30 Addis
  const decision = decideBlockerLifecycle({
    previousText: prev?.text,
    previousCategory: prev?.category,
    previousStatus: prev?.status,
    previousFirstRaisedAt: prev?.firstRaisedAt,
    text,
    category: text ? 'CLIENT_APPROVAL' : null,
    now,
    settings,
    sameBlockerConfirmed: opts.sameBlocker,
  })
  const existing = opts.existingSameDay
  const carry = carryBlockerEscalation({
    hasBlocker: decision.hasBlocker,
    continuesPrevious: decision.continuesPrevious,
    previous: prev,
    existingSameDay: existing
      ? { ...existing, chainStartedBeforeToday: !!existing.firstRaisedAt && existing.firstRaisedAt.toISOString().slice(0, 10) < day }
      : null,
  })
  const base: BlockerEscalationState = existing
    ? { escalatedAt: existing.escalatedAt, escalatedToUserId: existing.escalatedToUserId, raidItemId: existing.raidItemId }
    : { escalatedAt: null, escalatedToUserId: null, raidItemId: null }
  const esc = carry ?? base
  return {
    day,
    text,
    category: text ? 'CLIENT_APPROVAL' : null,
    status: esc.escalatedAt ? 'ESCALATED' : decision.status,
    daysOpen: decision.daysOpen,
    firstRaisedAt: decision.firstRaisedAt,
    ...esc,
  }
}

/** Mirrors runScrumFinalize for one user; returns how many times escalation side-effects ran. */
function finalize(row: Row, history: Row[], counter: { sideEffects: number }) {
  const eligible = !!row.text && (row.status === 'RECURRING' || row.status === 'ESCALATED')
    && row.daysOpen >= settings.escalationThresholdDays && !row.escalatedAt
  if (!eligible) return
  const chain = history.find((r) => r !== row && r.escalatedAt && r.firstRaisedAt?.getTime() === row.firstRaisedAt?.getTime()) ?? null
  const decision = decideAutoEscalation({ rowEscalatedAt: row.escalatedAt, chainEscalation: chain })
  if (decision === 'skip') return
  if (decision === 'inherit' && chain) {
    Object.assign(row, { escalatedAt: chain.escalatedAt, escalatedToUserId: chain.escalatedToUserId, raidItemId: chain.raidItemId, status: 'ESCALATED' })
    return
  }
  counter.sideEffects++
  Object.assign(row, { escalatedAt: new Date(`${row.day}T06:00:00.000Z`), raidItemId: `raid-${counter.sideEffects}`, status: 'ESCALATED' })
}

const BLOCKER = 'Waiting for client approval on the launch scope document'
const WEEK = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-20', '2026-07-21']

describe('blocker escalation — once per lifecycle', () => {
  it('escalates a persisting blocker exactly once across consecutive working days', () => {
    const counter = { sideEffects: 0 }
    const history: Row[] = []
    let prev: Row | null = null
    for (const day of WEEK) {
      const row = submit(day, prev, BLOCKER)
      history.push(row)
      finalize(row, history, counter)
      prev = row
    }
    assert.equal(counter.sideEffects, 1)
    const escalatedRows = history.filter((r) => r.escalatedAt)
    assert.ok(escalatedRows.length >= 4)
    assert.ok(escalatedRows.every((r) => r.raidItemId === 'raid-1'))
    assert.ok(escalatedRows.every((r) => r.status === 'ESCALATED'))
    assert.equal(new Set(escalatedRows.map((r) => r.escalatedAt?.getTime())).size, 1)
  })

  it('is idempotent when finalize runs twice on the same day', () => {
    const counter = { sideEffects: 0 }
    const history: Row[] = []
    let prev: Row | null = null
    for (const day of WEEK.slice(0, 4)) {
      const row = submit(day, prev, BLOCKER)
      history.push(row)
      finalize(row, history, counter)
      finalize(row, history, counter)
      prev = row
    }
    assert.equal(counter.sideEffects, 1)
  })

  it('inherits (without side-effects) an escalation recorded on an earlier row of the chain that was not carried', () => {
    const counter = { sideEffects: 0 }
    const day1 = submit(WEEK[0], null, BLOCKER)
    const escalatedEarlier: Row = { ...submit(WEEK[3], null, BLOCKER), firstRaisedAt: day1.firstRaisedAt, escalatedAt: new Date('2026-07-16T06:00:00Z'), raidItemId: 'raid-legacy', escalatedToUserId: null }
    // A legacy row saved before carry existed: same chain, escalatedAt null.
    const legacy: Row = { ...escalatedEarlier, day: WEEK[4], escalatedAt: null, raidItemId: null, status: 'ESCALATED', daysOpen: 5 }
    finalize(legacy, [day1, escalatedEarlier, legacy], counter)
    assert.equal(counter.sideEffects, 0)
    assert.equal(legacy.raidItemId, 'raid-legacy')
    assert.ok(legacy.escalatedAt)
  })

  it('a blocker resolved and then reopened is a new lifecycle and may escalate again', () => {
    const counter = { sideEffects: 0 }
    const history: Row[] = []
    let prev: Row | null = null
    for (const day of WEEK.slice(0, 4)) {
      const row = submit(day, prev, BLOCKER)
      history.push(row)
      finalize(row, history, counter)
      prev = row
    }
    assert.equal(counter.sideEffects, 1)
    prev = { ...prev!, status: 'RESOLVED' }
    const days = ['2026-07-17', '2026-07-20', '2026-07-21', '2026-07-22']
    for (const day of days) {
      const row = submit(day, prev, BLOCKER)
      history.push(row)
      finalize(row, history, counter)
      prev = row
    }
    assert.equal(counter.sideEffects, 2)
    assert.equal(history[history.length - 1].raidItemId, 'raid-2')
  })

  it('"not the same blocker" starts a fresh chain with no inherited escalation', () => {
    const prev: Row = { ...submit(WEEK[3], null, BLOCKER), escalatedAt: new Date('2026-07-16T06:00:00Z'), raidItemId: 'raid-1', status: 'ESCALATED' }
    const next = submit(WEEK[4], prev, BLOCKER, { sameBlocker: false })
    assert.equal(next.escalatedAt, null)
    assert.equal(next.raidItemId, null)
    assert.equal(next.daysOpen, 1)
  })

  it('a same-day re-save keeps today\'s escalation', () => {
    const yesterday: Row = { ...submit(WEEK[0], null, BLOCKER), day: WEEK[2] }
    const today: Row = { ...submit(WEEK[3], yesterday, BLOCKER), escalatedAt: new Date('2026-07-16T06:00:00Z'), raidItemId: 'raid-1', status: 'ESCALATED' }
    const resaved = submit(WEEK[3], yesterday, BLOCKER, { existingSameDay: today })
    assert.equal(resaved.raidItemId, 'raid-1')
    assert.equal(resaved.escalatedAt?.toISOString(), '2026-07-16T06:00:00.000Z')
    const counter = { sideEffects: 0 }
    finalize(resaved, [yesterday, resaved], counter)
    assert.equal(counter.sideEffects, 0)
  })

  it('a same-day re-save that re-labels a carried blocker as new clears the carried escalation', () => {
    const yesterday: Row = { ...submit(WEEK[0], null, BLOCKER), day: WEEK[2], escalatedAt: new Date('2026-07-15T06:00:00Z'), raidItemId: 'raid-1', status: 'ESCALATED' }
    const today = submit(WEEK[3], yesterday, BLOCKER)
    assert.equal(today.raidItemId, 'raid-1')
    const resaved = submit(WEEK[3], yesterday, BLOCKER, { sameBlocker: false, existingSameDay: today })
    assert.equal(resaved.escalatedAt, null)
    assert.equal(resaved.raidItemId, null)
  })

  it('leaves escalation columns untouched when there is no blocker', () => {
    assert.equal(carryBlockerEscalation({ hasBlocker: false, continuesPrevious: false, previous: null, existingSameDay: null }), null)
  })
})
