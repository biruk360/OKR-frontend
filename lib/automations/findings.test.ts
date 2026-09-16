import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeContentHash,
  computeDedupeKey,
  diffFindings,
  shouldSuppressDelivery,
} from './findings'
import type { Finding, RawFinding } from '@/types/automations'

const KEY_FIELDS = ['issuer', 'title', 'deadline']

function tender(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    title: 'Construction of 4 classrooms',
    url: 'https://example.org/tender/1',
    fields: { issuer: 'Ministry of Education', deadline: '2026-10-12', valueEtb: '8,400,000' },
    ...overrides,
  }
}

function toFinding(raw: RawFinding): Finding {
  return {
    ...raw,
    dedupeKey: computeDedupeKey(raw, KEY_FIELDS),
    contentHash: computeContentHash(raw),
    status: 'NEW',
  }
}

test('dedupeKey is stable across formatting churn', () => {
  const a = computeDedupeKey(tender(), KEY_FIELDS)
  const b = computeDedupeKey(
    tender({ title: '  Construction of 4   CLASSROOMS ' }),
    KEY_FIELDS
  )
  assert.equal(a, b)
})

test('dedupeKey ignores the order of the nominated fields', () => {
  assert.equal(
    computeDedupeKey(tender(), ['issuer', 'title', 'deadline']),
    computeDedupeKey(tender(), ['deadline', 'title', 'issuer'])
  )
})

test('dedupeKey changes when an identity field changes', () => {
  assert.notEqual(
    computeDedupeKey(tender(), KEY_FIELDS),
    computeDedupeKey(tender({ fields: { ...tender().fields, issuer: 'Ministry of Health' } }), KEY_FIELDS)
  )
})

test('dedupeKey falls back to the title when no nominated field has a value', () => {
  const key = computeDedupeKey({ title: 'Orphan finding' }, ['issuer', 'deadline'])
  assert.equal(key, computeDedupeKey({ title: 'orphan  FINDING' }, ['nothing']))
})

test('contentHash reacts to a non-identity field change', () => {
  assert.notEqual(
    computeContentHash(tender()),
    computeContentHash(tender({ fields: { ...tender().fields, valueEtb: '9,000,000' } }))
  )
})

test('the first run marks everything NEW', () => {
  const diff = diffFindings([tender(), tender({ title: 'Road maintenance' })], [], KEY_FIELDS)
  assert.equal(diff.newCount, 2)
  assert.equal(diff.changedCount, 0)
  assert.equal(diff.unchangedCount, 0)
  assert.equal(diff.resolved.length, 0)
})

test('re-finding the same item marks it UNCHANGED, not NEW', () => {
  const previous = [toFinding(tender())]
  const diff = diffFindings([tender()], previous, KEY_FIELDS)
  assert.equal(diff.newCount, 0)
  assert.equal(diff.unchangedCount, 1)
  assert.equal(diff.findings[0].status, 'UNCHANGED')
})

test('a moved deadline marks the item CHANGED with a readable note', () => {
  const previous = [toFinding(tender())]
  const diff = diffFindings(
    [tender({ fields: { ...tender().fields, deadline: '2026-10-12', valueEtb: '9,100,000' } })],
    previous,
    KEY_FIELDS
  )
  assert.equal(diff.changedCount, 1)
  assert.equal(diff.findings[0].status, 'CHANGED')
  assert.match(diff.findings[0].changeNote ?? '', /valueEtb: 8,400,000 → 9,100,000/)
})

test('an item that disappears is reported as RESOLVED', () => {
  const previous = [toFinding(tender()), toFinding(tender({ title: 'Road maintenance' }))]
  const diff = diffFindings([tender()], previous, KEY_FIELDS)
  assert.equal(diff.resolved.length, 1)
  assert.equal(diff.resolved[0].title, 'Road maintenance')
  assert.equal(diff.resolved[0].status, 'RESOLVED')
})

test('duplicate findings inside one run collapse onto the first', () => {
  const diff = diffFindings([tender(), tender()], [], KEY_FIELDS)
  assert.equal(diff.findings.length, 1)
  assert.equal(diff.newCount, 1)
})

test('suppression fires only when nothing is new or changed', () => {
  const quiet = diffFindings([tender()], [toFinding(tender())], KEY_FIELDS)
  assert.equal(shouldSuppressDelivery(quiet, 'SKIP'), true)
  assert.equal(shouldSuppressDelivery(quiet, 'SEND'), false)

  const noisy = diffFindings([tender({ title: 'Brand new tender' })], [toFinding(tender())], KEY_FIELDS)
  assert.equal(shouldSuppressDelivery(noisy, 'SKIP'), false)
})

test('an empty run with a prior baseline is suppressed but still reports resolutions', () => {
  const diff = diffFindings([], [toFinding(tender())], KEY_FIELDS)
  assert.equal(shouldSuppressDelivery(diff, 'SKIP'), true)
  assert.equal(diff.resolved.length, 1)
})
