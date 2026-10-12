import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canApproveFrom,
  canReviewIn,
  canSubmitFrom,
  canTransitionByPatch,
  nextPackageVersion,
  packageItemKey,
  parsePackageWeights,
  parseSummaryLines,
  reviewUpsertEffect,
  summarizeReviews,
  weightSegments,
  weightsTotal,
} from './rules'
import { createPackageSchema, disputeFormSchema, packageEditFormSchema, packageWeightsSchema, upsertReviewSchema } from './schemas'

test('PKG-1 lifecycle: submit only from DRAFT, approve from DRAFT/IN_REVIEW, review only IN_REVIEW', () => {
  assert.equal(canSubmitFrom('DRAFT'), true)
  assert.equal(canSubmitFrom('IN_REVIEW'), false)
  assert.equal(canApproveFrom('IN_REVIEW'), true)
  assert.equal(canApproveFrom('DRAFT'), true)
  assert.equal(canApproveFrom('APPROVED'), false)
  assert.equal(canApproveFrom('ARCHIVED'), false)
  assert.equal(canReviewIn('IN_REVIEW'), true)
  assert.equal(canReviewIn('DRAFT'), false)
  assert.equal(canReviewIn('APPROVED'), false)
})

test('PATCH transitions: archive from anywhere, reopen to DRAFT, no jump to APPROVED', () => {
  assert.equal(canTransitionByPatch('DRAFT', 'ARCHIVED'), true)
  assert.equal(canTransitionByPatch('APPROVED', 'DRAFT'), true)
  assert.equal(canTransitionByPatch('ARCHIVED', 'DRAFT'), true)
  assert.equal(canTransitionByPatch('ARCHIVED', 'APPROVED'), false)
  assert.equal(canTransitionByPatch('DRAFT', 'APPROVED'), false)
  assert.equal(canTransitionByPatch('DRAFT', 'IN_REVIEW'), false)
})

test('nextPackageVersion bumps the number', () => {
  assert.equal(nextPackageVersion('v1'), 'v2')
  assert.equal(nextPackageVersion('v9'), 'v10')
  assert.equal(nextPackageVersion('V2.1'), 'v3')
  assert.equal(nextPackageVersion(''), 'v2')
  assert.equal(nextPackageVersion(null), 'v2')
})

test('PKG-2 summary: n of m reviewed counts only the employee on current items; open disputes count all', () => {
  const items = new Set([packageItemKey('KPI', 'k1'), packageItemKey('OBJECTIVE', 'o1'), packageItemKey('DUTY', 'd1')])
  const summary = summarizeReviews(
    items,
    [
      { entityType: 'KPI', entityId: 'k1', verdict: 'AGREE', reviewerId: 'emp', resolvedAt: null },
      { entityType: 'OBJECTIVE', entityId: 'o1', verdict: 'DISPUTE', reviewerId: 'emp', resolvedAt: null },
      // Someone else's review does not count as reviewed.
      { entityType: 'DUTY', entityId: 'd1', verdict: 'AGREE', reviewerId: 'mgr', resolvedAt: null },
      // Dispute on an item that has since been deleted still blocks approval.
      { entityType: 'DEVELOPMENT', entityId: 'gone', verdict: 'DISPUTE', reviewerId: 'emp', resolvedAt: null },
      // Resolved dispute does not.
      { entityType: 'DUTY', entityId: 'd1', verdict: 'DISPUTE', reviewerId: 'x', resolvedAt: new Date() },
      { entityType: 'KPI', entityId: 'k1', verdict: 'BOGUS', reviewerId: 'emp', resolvedAt: null },
    ],
    'emp',
  )
  assert.deepEqual(summary, { reviewed: 2, total: 3, agreed: 1, disputed: 1, disputesOpen: 2 })
})

test('reviewUpsertEffect: new or reopened dispute notifies; comment edit on open dispute does not', () => {
  assert.deepEqual(reviewUpsertEffect(null, 'DISPUTE'), { clearResolution: false, notifyDispute: true })
  assert.deepEqual(reviewUpsertEffect({ verdict: 'AGREE', resolvedAt: null }, 'DISPUTE'), { clearResolution: false, notifyDispute: true })
  assert.deepEqual(reviewUpsertEffect({ verdict: 'DISPUTE', resolvedAt: null }, 'DISPUTE'), { clearResolution: false, notifyDispute: false })
  assert.deepEqual(reviewUpsertEffect({ verdict: 'DISPUTE', resolvedAt: new Date() }, 'DISPUTE'), { clearResolution: true, notifyDispute: true })
  assert.deepEqual(reviewUpsertEffect({ verdict: 'DISPUTE', resolvedAt: new Date() }, 'AGREE'), { clearResolution: true, notifyDispute: false })
  assert.deepEqual(reviewUpsertEffect(null, 'AGREE'), { clearResolution: false, notifyDispute: false })
})

test('PKG-4 weights parsing and segments', () => {
  assert.equal(parsePackageWeights(null), null)
  assert.equal(parsePackageWeights([1, 2]), null)
  assert.deepEqual(parsePackageWeights({ kpis: 50, values: '20', okr: -1, development: 'x' }), { kpis: 50, values: 20 })
  const segments = weightSegments({ development: 15, okr: 15, kpis: 50, values: 20, extra: 0 })
  assert.deepEqual(segments.map((s) => s.key), ['kpis', 'values', 'okr', 'development', 'extra'])
  assert.equal(segments[0].label, 'KPIs')
  assert.equal(segments[0].percent, 50)
  assert.equal(segments[4].label, 'Extra')
  assert.equal(weightsTotal({ kpis: 50, values: 20, okr: 15, development: 15 }), 100)
})

test('summary lines accept strings, objects and { lines }', () => {
  assert.deepEqual(parseSummaryLines(['  ETB 10M revenue ', '', 3]), ['ETB 10M revenue'])
  assert.deepEqual(parseSummaryLines([{ text: 'A' }, { label: 'Win rate', value: '30%' }]), ['A', 'Win rate: 30%'])
  assert.deepEqual(parseSummaryLines({ lines: ['x'] }), ['x'])
  assert.deepEqual(parseSummaryLines('nope'), [])
})

test('schemas: DISPUTE requires a comment; weights must total 100', () => {
  assert.equal(upsertReviewSchema.safeParse({ entityType: 'KPI', entityId: 'k1', verdict: 'DISPUTE' }).success, false)
  assert.equal(upsertReviewSchema.safeParse({ entityType: 'KPI', entityId: 'k1', verdict: 'DISPUTE', comment: '  ' }).success, false)
  assert.equal(upsertReviewSchema.safeParse({ entityType: 'KPI', entityId: 'k1', verdict: 'DISPUTE', comment: 'Too high' }).success, true)
  assert.equal(upsertReviewSchema.safeParse({ entityType: 'KPI', entityId: 'k1', verdict: 'AGREE' }).success, true)
  assert.equal(upsertReviewSchema.safeParse({ entityType: 'NOPE', entityId: 'k1', verdict: 'AGREE' }).success, false)

  assert.equal(packageWeightsSchema.safeParse({ kpis: 50, values: 20, okr: 15, development: 15 }).success, true)
  assert.equal(packageWeightsSchema.safeParse({ kpis: 50, values: 20 }).success, false)
  assert.equal(packageWeightsSchema.safeParse({ 'Bad Key': 100 }).success, false)
  assert.equal(packageWeightsSchema.safeParse({}).success, true)

  const created = createPackageSchema.parse({ userId: 'u', timeframeId: 't', summaryLines: ['a', ' ', 'b'] })
  assert.deepEqual(created.summaryLines, ['a', 'b'])

  assert.equal(disputeFormSchema.safeParse({ comment: ' ' }).success, false)
  const form = { version: 'v1', seatTitle: '', summaryText: '', kpis: '', values: '', okr: '', development: '' }
  assert.equal(packageEditFormSchema.safeParse(form).success, true)
  assert.equal(packageEditFormSchema.safeParse({ ...form, kpis: '50', values: '50' }).success, true)
  assert.equal(packageEditFormSchema.safeParse({ ...form, kpis: '50' }).success, false)
  assert.equal(packageEditFormSchema.safeParse({ ...form, kpis: 'abc' }).success, false)
})
