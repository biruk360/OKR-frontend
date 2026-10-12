import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseKrExtensionFields,
  successGrade,
  suggestCloseOutcome,
  suggestCloseOutcomeFromPercent,
  normalizeKrCommitment,
} from './kr-commitment'

// ── KRX-2 outcome suggestion ────────────────────────────────────────────────

test('ASPIRATIONAL: 0.7 is the success line', () => {
  assert.equal(suggestCloseOutcome(0.7, 'ASPIRATIONAL'), 'ACHIEVED')
  assert.equal(suggestCloseOutcome(0.95, 'ASPIRATIONAL'), 'ACHIEVED')
  assert.equal(suggestCloseOutcome(0.69, 'ASPIRATIONAL'), 'PARTIAL')
  assert.equal(suggestCloseOutcome(0.1, 'ASPIRATIONAL'), 'MISSED')
  // Float noise from percent → grade conversion does not drop below the line.
  assert.equal(suggestCloseOutcome(70 / 100, 'aspirational'), 'ACHIEVED')
})

test('COMMITTED / MIXED / unset need the full result', () => {
  for (const c of ['COMMITTED', 'MIXED', null, undefined, 'bogus']) {
    assert.equal(suggestCloseOutcome(1, c), 'ACHIEVED', String(c))
    assert.equal(suggestCloseOutcome(0.9, c), 'PARTIAL', String(c))
    assert.equal(suggestCloseOutcome(0.3, c), 'PARTIAL', String(c))
    assert.equal(suggestCloseOutcome(0.29, c), 'MISSED', String(c))
  }
})

test('non-finite progress counts as 0; percent helper divides by 100', () => {
  assert.equal(suggestCloseOutcome(Number.NaN, 'ASPIRATIONAL'), 'MISSED')
  assert.equal(suggestCloseOutcomeFromPercent(72, 'ASPIRATIONAL'), 'ACHIEVED')
  assert.equal(suggestCloseOutcomeFromPercent(72, 'COMMITTED'), 'PARTIAL')
  assert.equal(suggestCloseOutcomeFromPercent(100, 'COMMITTED'), 'ACHIEVED')
})

test('successGrade / normalizeKrCommitment', () => {
  assert.equal(successGrade('ASPIRATIONAL'), 0.7)
  assert.equal(successGrade('COMMITTED'), 1)
  assert.equal(successGrade(null), 1)
  assert.equal(normalizeKrCommitment(' mixed '), 'MIXED')
  assert.equal(normalizeKrCommitment('x'), null)
  assert.equal(normalizeKrCommitment(3), null)
})

// ── KRX field validation ────────────────────────────────────────────────────

test('parseKrExtensionFields: only sent keys come back; blanks clear; enums upper-cased', () => {
  const r = parseKrExtensionFields({
    title: 'ignored',
    commitment: 'aspirational',
    direction: 'decrease',
    baselineText: '  38% of qualified bids  ',
    targetText: '',
    measuredBy: null,
    dueDate: '2027-03-31',
  })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(Object.keys(r.data).sort(), ['baselineText', 'commitment', 'direction', 'dueDate', 'measuredBy', 'targetText'])
  assert.equal(r.data.commitment, 'ASPIRATIONAL')
  assert.equal(r.data.direction, 'DECREASE')
  assert.equal(r.data.baselineText, '38% of qualified bids')
  assert.equal(r.data.targetText, null)
  assert.equal(r.data.measuredBy, null)
  assert.ok(r.data.dueDate instanceof Date)
  assert.equal((r.data.dueDate as Date).toISOString().slice(0, 10), '2027-03-31')
})

test('parseKrExtensionFields: empty body → empty data; commitment "" clears', () => {
  const r = parseKrExtensionFields({})
  assert.deepEqual(r, { ok: true, data: {} })
  const c = parseKrExtensionFields({ commitment: '', dueDate: null, externalRef: 'EDN-K03' })
  assert.ok(c.ok)
  if (c.ok) assert.deepEqual(c.data, { commitment: null, dueDate: null, externalRef: 'EDN-K03' })
  assert.deepEqual(parseKrExtensionFields(null), { ok: true, data: {} })
})

test('parseKrExtensionFields: rejects bad enums, dates and over-long text', () => {
  const bad = [
    { commitment: 'SOMETIMES' },
    { direction: 'SIDEWAYS' },
    { direction: null },
    { dueDate: 'not a date' },
    { externalRef: 'x'.repeat(65) },
    { baselineText: 42 },
  ]
  for (const body of bad) {
    const r = parseKrExtensionFields(body)
    assert.equal(r.ok, false, JSON.stringify(body))
    if (!r.ok) assert.match(r.message, /^Invalid /)
  }
})
