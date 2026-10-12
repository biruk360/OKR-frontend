import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canWithdrawDecision,
  compareByNeededBy,
  compareRefs,
  groupDecisionsByBatch,
  isDecisionOverdue,
  planStatusChange,
  sortByNeededBy,
  summarizeDecisions,
} from './rules'
import {
  createDecisionSchema,
  decideDecisionSchema,
  listDecisionsQuerySchema,
  updateDecisionSchema,
} from './schemas'

const NOW = new Date('2026-10-12T10:00:00')

function row(partial: { id: string; neededBy?: string | null; batch?: string | null; overdue?: boolean; externalRef?: string | null; title?: string }) {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    neededBy: partial.neededBy ?? null,
    batch: partial.batch ?? null,
    overdue: partial.overdue ?? false,
    externalRef: partial.externalRef ?? null,
  }
}

test('DEC-1 overdue: OPEN and needed before today; today and closed ones are not overdue', () => {
  assert.equal(isDecisionOverdue({ status: 'OPEN', neededBy: '2026-10-11T00:00:00' }, NOW), true)
  assert.equal(isDecisionOverdue({ status: 'OPEN', neededBy: '2026-10-12T00:00:00' }, NOW), false)
  assert.equal(isDecisionOverdue({ status: 'DECIDED', neededBy: '2026-10-01T00:00:00' }, NOW), false)
  assert.equal(isDecisionOverdue({ status: 'DEFERRED', neededBy: '2026-10-01T00:00:00' }, NOW), false)
  assert.equal(isDecisionOverdue({ status: 'OPEN', neededBy: null }, NOW), false)
})

test('compareRefs sorts workbook refs naturally, nulls last', () => {
  const refs = ['D46', 'D9', null, 'D10']
  assert.deepEqual([...refs].sort(compareRefs), ['D9', 'D10', 'D46', null])
})

test('DEC-1 sort: neededBy ascending, undated last, ties by ref', () => {
  const sorted = sortByNeededBy([
    row({ id: 'c', neededBy: null, externalRef: 'D1' }),
    row({ id: 'b', neededBy: '2026-10-30T00:00:00Z', externalRef: 'D46' }),
    row({ id: 'a', neededBy: '2026-10-30T00:00:00Z', externalRef: 'D9' }),
    row({ id: 'd', neededBy: '2026-10-16T00:00:00Z' }),
  ])
  assert.deepEqual(sorted.map((r) => r.id), ['d', 'a', 'b', 'c'])
  assert.equal(compareByNeededBy(row({ id: 'x', neededBy: '2026-10-01' }), row({ id: 'y', neededBy: null })) < 0, true)
})

test('DEC-1 grouping: batches by earliest neededBy, "No batch" last, overdue counted', () => {
  const groups = groupDecisionsByBatch([
    row({ id: '1', batch: '30 Oct', neededBy: '2026-10-30T00:00:00Z' }),
    row({ id: '2', batch: '16 Oct', neededBy: '2026-10-16T00:00:00Z', overdue: true }),
    row({ id: '3', batch: null, neededBy: '2026-10-01T00:00:00Z', overdue: true }),
    row({ id: '4', batch: '16 Oct', neededBy: '2026-10-14T00:00:00Z' }),
    row({ id: '5', batch: ' 30 Oct ', neededBy: null }),
  ])
  assert.deepEqual(
    groups.map((g) => g.batch),
    ['16 Oct', '30 Oct', null],
  )
  assert.deepEqual(groups[0].items.map((i) => i.id), ['4', '2'])
  assert.equal(groups[0].overdueCount, 1)
  assert.deepEqual(groups[1].items.map((i) => i.id), ['1', '5'])
  assert.equal(groups[2].overdueCount, 1)
})

test('status: DECIDED only through decide', () => {
  const plan = planStatusChange('OPEN', 'DECIDED', { canDecide: true, isRequester: false })
  assert.equal(plan.ok, false)
  if (!plan.ok) assert.equal(plan.code, 'USE_DECIDE')
})

test('status: deferring needs a decider; the requester may withdraw and reopen their own request', () => {
  assert.equal(planStatusChange('OPEN', 'DEFERRED', { canDecide: false, isRequester: true }).ok, false)
  assert.equal(planStatusChange('OPEN', 'DEFERRED', { canDecide: true, isRequester: false }).ok, true)
  assert.equal(planStatusChange('OPEN', 'WITHDRAWN', { canDecide: false, isRequester: true }).ok, true)
  assert.equal(planStatusChange('WITHDRAWN', 'OPEN', { canDecide: false, isRequester: true }).ok, true)
  assert.equal(planStatusChange('OPEN', 'WITHDRAWN', { canDecide: false, isRequester: false }).ok, false)
  assert.equal(planStatusChange('DEFERRED', 'OPEN', { canDecide: false, isRequester: true }).ok, false)
})

test('status: leaving DECIDED is decider-only and clears the decision (DEC-4)', () => {
  const requester = planStatusChange('DECIDED', 'WITHDRAWN', { canDecide: false, isRequester: true })
  assert.equal(requester.ok, false)
  const decider = planStatusChange('DECIDED', 'OPEN', { canDecide: true, isRequester: false })
  assert.deepEqual(decider, { ok: true, clearDecision: true })
  assert.deepEqual(planStatusChange('OPEN', 'OPEN', { canDecide: false, isRequester: false }), { ok: true, clearDecision: false })
})

test('canWithdrawDecision', () => {
  assert.equal(canWithdrawDecision('OPEN', { canDecide: false, isRequester: true }), true)
  assert.equal(canWithdrawDecision('DECIDED', { canDecide: false, isRequester: true }), false)
  assert.equal(canWithdrawDecision('DECIDED', { canDecide: true, isRequester: false }), true)
  assert.equal(canWithdrawDecision('WITHDRAWN', { canDecide: true, isRequester: true }), false)
})

test('summarizeDecisions counts open items and overdue ones', () => {
  const summary = summarizeDecisions(
    [
      { id: '1', status: 'OPEN', deciderId: 'ceo', overdue: true },
      { id: '2', status: 'OPEN', deciderId: 'ceo', overdue: false },
      { id: '3', status: 'DECIDED', deciderId: 'ceo', overdue: false },
    ],
    [{ id: '4', status: 'OPEN', deciderId: 'me', overdue: true }],
  )
  assert.deepEqual(summary, { openAffecting: 2, affectingOverdue: 1, awaitingMyDecision: 1, awaitingOverdue: 1 })
})

test('DEC-2 schema: decision text is required and trimmed', () => {
  assert.equal(decideDecisionSchema.safeParse({}).success, false)
  assert.equal(decideDecisionSchema.safeParse({ decisionText: '   ' }).success, false)
  const ok = decideDecisionSchema.safeParse({ decisionText: '  Approved  ', decidedAt: '2026-10-10' })
  assert.equal(ok.success, true)
  if (ok.success) {
    assert.equal(ok.data.decisionText, 'Approved')
    assert.equal(ok.data.closeDependencies, true)
    assert.equal(ok.data.decidedAt?.toISOString(), '2026-10-10T00:00:00.000Z')
  }
})

test('create schema: links are de-duplicated and blank optionals become null', () => {
  const parsed = createDecisionSchema.safeParse({
    title: 'Approve structure',
    batch: '',
    neededBy: '2026-10-16',
    links: [
      { entityType: 'USER', entityId: 'u1' },
      { entityType: 'USER', entityId: 'u1' },
      { entityType: 'KEY_RESULT', entityId: 'kr1' },
    ],
  })
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.equal(parsed.data.links.length, 2)
    assert.equal(parsed.data.batch, null)
    assert.equal(parsed.data.deciderId, undefined)
    assert.equal(parsed.data.neededBy?.toISOString(), '2026-10-16T00:00:00.000Z')
  }
  assert.equal(createDecisionSchema.safeParse({ title: 'x', links: [{ entityType: 'NOPE', entityId: 'a' }] }).success, false)
})

test('update schema rejects an empty patch', () => {
  assert.equal(updateDecisionSchema.safeParse({}).success, false)
  assert.equal(updateDecisionSchema.safeParse({ status: 'DEFERRED' }).success, true)
})

test('list query: status list, all, me and limits', () => {
  const parsed = listDecisionsQuerySchema.safeParse({ status: 'open,decided', deciderId: 'me', timeframeId: 'all', openAnyTimeframe: '1' })
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.deepEqual(parsed.data.status, ['OPEN', 'DECIDED'])
    assert.equal(parsed.data.deciderId, 'me')
    assert.equal(parsed.data.timeframeId, undefined)
    assert.equal(parsed.data.openAnyTimeframe, true)
  }
  assert.equal(listDecisionsQuerySchema.safeParse({ status: 'BOGUS' }).success, false)
  assert.equal(listDecisionsQuerySchema.safeParse({ limit: '0' }).success, false)
  const all = listDecisionsQuerySchema.safeParse({ status: 'all' })
  assert.equal(all.success && all.data.status, undefined)
})
