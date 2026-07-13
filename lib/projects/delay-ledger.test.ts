/**
 * Unit tests for the Approval Clock decision logic (Epic C3).
 * Pure logic only — no DB. Persistence (`applyApprovalClock`) wraps this.
 * Run: `npm run test:projects`  (tsx + Node built-in test runner — no extra deps)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideApprovalClockTransition, computeSlipDaysLost, computeDelayOwnerTotals, delaysToCsv, approvalEscalationLevel, type DelayLedgerRow } from './delay-ledger'

// --- approvalEscalationLevel (C3 cron thresholds: SLA, +3, +7) ----------------

test('approvalEscalationLevel: below SLA → 0 (no escalation)', () => {
  assert.equal(approvalEscalationLevel(0, 3), 0)
  assert.equal(approvalEscalationLevel(2, 3), 0)
})

test('approvalEscalationLevel: at SLA → 1, at SLA+3 → 2, at SLA+7 → 3', () => {
  assert.equal(approvalEscalationLevel(3, 3), 1)
  assert.equal(approvalEscalationLevel(5, 3), 1)   // between SLA and +3
  assert.equal(approvalEscalationLevel(6, 3), 2)
  assert.equal(approvalEscalationLevel(9, 3), 2)   // between +3 and +7
  assert.equal(approvalEscalationLevel(10, 3), 3)
  assert.equal(approvalEscalationLevel(40, 3), 3)  // stays at max
})

// --- computeDelayOwnerTotals (C5 header totals) ------------------------------

test('computeDelayOwnerTotals: split by owner is arithmetically correct', () => {
  const t = computeDelayOwnerTotals([
    { owner: 'CLIENT', daysLost: 14 },
    { owner: 'CLIENT', daysLost: 7 },
    { owner: '360GROUND', daysLost: 5 },
    { owner: 'SHARED', daysLost: 2 },
  ])
  assert.equal(t.total, 28)
  assert.equal(t.byOwner.CLIENT, 21)
  assert.equal(t.byOwner['360GROUND'], 5)
  assert.equal(t.byOwner.SHARED, 2)
  assert.equal(t.total, Object.values(t.byOwner).reduce((a, b) => a + b, 0))
})

test('computeDelayOwnerTotals: empty set → all zeros; unknown owner gets its own bucket', () => {
  assert.deepEqual(computeDelayOwnerTotals([]), { total: 0, byOwner: { CLIENT: 0, '360GROUND': 0, SHARED: 0 } })
  const t = computeDelayOwnerTotals([{ owner: 'VENDOR', daysLost: 3 }])
  assert.equal(t.total, 3)
  assert.equal(t.byOwner.VENDOR, 3)
})

// --- delaysToCsv (C5 export) --------------------------------------------------

const csvRow = (over: Partial<DelayLedgerRow>): DelayLedgerRow => ({
  id: 'e1', activityId: 'a1', activityTitle: 'Req Doc Approval', phase: 'Planning',
  eventType: 'APPROVAL_WAIT', baselineDate: '2026-08-15T00:00:00.000Z', currentDate: '2026-08-29T00:00:00.000Z',
  slipDays: 14, daysLost: 14, reason: 'CLIENT_APPROVAL_DELAY', reasonDetail: null,
  owner: 'CLIENT', isAutoDetected: true, slaBreachDays: 3,
  recoveryPlan: null, recoveryOwner: null, recoveryDate: null,
  startedAt: '2026-08-15T00:00:00.000Z', endedAt: '2026-08-29T00:00:00.000Z', createdAt: '2026-08-29T00:00:00.000Z',
  ...over,
})

test('delaysToCsv: header + one row per visible (filtered) row', () => {
  const csv = delaysToCsv([csvRow({}), csvRow({ id: 'e2', activityTitle: 'API Integration', owner: '360GROUND', slaBreachDays: null })])
  const lines = csv.split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^Activity,Phase,Baseline Date,Current Date,Slip Days,Reason,Owner/)
  assert.match(lines[1], /^Req Doc Approval,Planning,2026-08-15T00:00:00.000Z,2026-08-29T00:00:00.000Z,14,CLIENT_APPROVAL_DELAY,CLIENT,3/)
  assert.match(lines[2], /^API Integration,/) 
})

test('delaysToCsv: escapes commas, quotes and renders nulls empty', () => {
  const csv = delaysToCsv([csvRow({ activityTitle: 'Fix, "urgent"', recoveryPlan: null, slaBreachDays: null })])
  const line = csv.split('\n')[1]
  assert.ok(line.startsWith('"Fix, ""urgent""",'))
  assert.ok(line.endsWith(',,')) // recoveryOwner + recoveryDate null → trailing empty cells
})

test('delaysToCsv: empty row set → header only', () => {
  assert.equal(delaysToCsv([]).split('\n').length, 1)
})

// --- computeSlipDaysLost (C4 slip attribution) -------------------------------

test('computeSlipDaysLost: delay increase is the days lost', () => {
  assert.equal(computeSlipDaysLost(0, 10), 10)  // first slip: 0 → 10
  assert.equal(computeSlipDaysLost(5, 12), 7)   // further slip: +7
})

test('computeSlipDaysLost: moving earlier or unchanged records 0 (never a credit)', () => {
  assert.equal(computeSlipDaysLost(10, 4), 0)
  assert.equal(computeSlipDaysLost(7, 7), 0)
  assert.equal(computeSlipDaysLost(0, 0), 0)
})

// 2024-01-01 is a Monday (UTC); 2024-01-08 is the following Monday.
const mon01 = new Date('2024-01-01T00:00:00Z')
const mon08 = new Date('2024-01-08T00:00:00Z')

test('→APPROVAL_REQUESTED starts the clock', () => {
  const d = decideApprovalClockTransition({
    from: 'FINISHED', to: 'APPROVAL_REQUESTED', waitingSince: null, now: mon01, slaBusinessDays: 3,
  })
  assert.deepEqual(d, { kind: 'START' })
})

test('spec case: sent Monday, approved next Monday = 5 business days (weekend excluded)', () => {
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'APPROVED', waitingSince: mon01, now: mon08, slaBusinessDays: null,
  })
  assert.equal(d.kind, 'RESOLVED')
  if (d.kind === 'RESOLVED') {
    assert.equal(d.daysWaited, 5) // Tue,Wed,Thu,Fri,Mon — Sat/Sun excluded
    assert.equal(+d.startedAt, +mon01)
    assert.equal(d.daysOverSla, 0) // no obligation SLA ⇒ never a breach
  }
})

test('SLA 3 with 5 days waited ⇒ breach of 2 days over SLA', () => {
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'APPROVED', waitingSince: mon01, now: mon08, slaBusinessDays: 3,
  })
  assert.equal(d.kind, 'RESOLVED')
  if (d.kind === 'RESOLVED') {
    assert.equal(d.daysWaited, 5)
    assert.equal(d.daysOverSla, 2)
  }
})

test('within SLA ⇒ no breach', () => {
  // Mon 01 → Wed 03 = 2 business days, SLA 3.
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'APPROVED',
    waitingSince: mon01, now: new Date('2024-01-03T00:00:00Z'), slaBusinessDays: 3,
  })
  assert.equal(d.kind, 'RESOLVED')
  if (d.kind === 'RESOLVED') assert.equal(d.daysOverSla, 0)
})

test('REJECTED still resolves the clock and records the wait (rejection is not free)', () => {
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'REJECTED', waitingSince: mon01, now: mon08, slaBusinessDays: 3,
  })
  assert.equal(d.kind, 'RESOLVED')
  if (d.kind === 'RESOLVED') {
    assert.equal(d.daysWaited, 5)
    assert.equal(d.daysOverSla, 2)
  }
})

test('non-approval transitions are a no-op', () => {
  for (const [from, to] of [
    ['NOT_STARTED', 'STARTED'],
    ['STARTED', 'FINISHED'],
    ['FINISHED', 'APPROVED'], // approved without going through APPROVAL_REQUESTED
    ['APPROVED', 'REJECTED'],
  ] as const) {
    const d = decideApprovalClockTransition({
      from, to, waitingSince: null, now: mon08, slaBusinessDays: 3,
    })
    assert.equal(d.kind, 'NOOP', `${from} → ${to} should be a no-op`)
  }
})

test('re-requesting approval while already waiting is a no-op (clock keeps original start)', () => {
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'APPROVAL_REQUESTED', waitingSince: mon01, now: mon08, slaBusinessDays: 3,
  })
  assert.equal(d.kind, 'NOOP')
})

test('resolution with missing waitingSince resolves as 0 days (data anomaly guard)', () => {
  const d = decideApprovalClockTransition({
    from: 'APPROVAL_REQUESTED', to: 'APPROVED', waitingSince: null, now: mon08, slaBusinessDays: 3,
  })
  assert.equal(d.kind, 'RESOLVED')
  if (d.kind === 'RESOLVED') {
    assert.equal(d.daysWaited, 0)
    assert.equal(+d.startedAt, +mon08)
    assert.equal(d.daysOverSla, 0)
  }
})
