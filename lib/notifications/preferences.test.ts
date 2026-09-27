import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CADENCE_LABEL,
  DEFAULT_EMAIL_CADENCE,
  EMAIL_CADENCES,
  SELECTABLE_CADENCES,
  isEmailCadence,
  resolveEffectivePref,
  seedCadenceFor,
} from './cadence'
import { ALL_CATEGORIES, CATEGORY_LABEL, EVENT_META } from './events'

/**
 * BAT-2 end-to-end: BATCHED must actually be what a default user gets, and no
 * save path may silently turn it back into IMMEDIATE.
 */

const row = (emailCadence: string, over: Partial<{ inApp: boolean; email: boolean }> = {}) => ({
  inApp: true, email: true, emailCadence, ...over,
})

test('hard-coded default is BATCHED with in-app and email on', () => {
  const p = resolveEffectivePref({ category: 'TODO' })
  assert.equal(DEFAULT_EMAIL_CADENCE, 'BATCHED')
  assert.deepEqual(p, { inApp: true, email: true, emailCadence: 'BATCHED', mandatory: false, source: 'hardcoded' })
})

test('org row wins over the hard-coded default', () => {
  const p = resolveEffectivePref({ category: 'TODO', orgRow: row('DAILY') })
  assert.equal(p.emailCadence, 'DAILY')
  assert.equal(p.source, 'org')
})

test('user row wins over the org row', () => {
  const p = resolveEffectivePref({ category: 'TODO', userRow: row('IMMEDIATE'), orgRow: row('WEEKLY') })
  assert.equal(p.emailCadence, 'IMMEDIATE')
  assert.equal(p.source, 'user')
})

test('user row with BATCHED is preserved (not coerced to IMMEDIATE)', () => {
  const p = resolveEffectivePref({ category: 'COMMENT', userRow: row('BATCHED'), orgRow: row('IMMEDIATE') })
  assert.equal(p.emailCadence, 'BATCHED')
})

test('DISABLED cadence resolves to email off, in-app untouched', () => {
  const p = resolveEffectivePref({ category: 'TODO', userRow: row('DISABLED') })
  assert.equal(p.email, false)
  assert.equal(p.inApp, true)
  assert.equal(p.emailCadence, 'DISABLED')
  const org = resolveEffectivePref({ category: 'TODO', orgRow: row('DISABLED') })
  assert.equal(org.email, false)
})

test('email switch off is honoured whatever the cadence', () => {
  const p = resolveEffectivePref({ category: 'TODO', userRow: row('IMMEDIATE', { email: false }) })
  assert.equal(p.email, false)
})

test('unknown stored cadence falls back to the next layer, never to IMMEDIATE', () => {
  assert.equal(resolveEffectivePref({ category: 'TODO', userRow: row('BOGUS') }).emailCadence, 'BATCHED')
  assert.equal(resolveEffectivePref({ category: 'TODO', userRow: row('BOGUS'), orgRow: row('WEEKLY') }).emailCadence, 'WEEKLY')
  assert.equal(resolveEffectivePref({ category: 'TODO', orgRow: row('BOGUS') }).emailCadence, 'BATCHED')
})

test('mandatory category is always in-app + IMMEDIATE email, rows ignored', () => {
  const p = resolveEffectivePref({
    category: 'ACCOUNT',
    userRow: row('DISABLED', { inApp: false, email: false }),
    orgRow: row('BATCHED'),
  })
  assert.deepEqual(p, { inApp: true, email: true, emailCadence: 'IMMEDIATE', mandatory: true, source: 'mandatory' })
  assert.equal(resolveEffectivePref({ category: 'ACCOUNT' }).emailCadence, 'IMMEDIATE')
})

test('org seeding: BATCHED for every non-mandatory category, IMMEDIATE for ACCOUNT', () => {
  for (const c of ALL_CATEGORIES) {
    assert.equal(seedCadenceFor(c), c === 'ACCOUNT' ? 'IMMEDIATE' : 'BATCHED', c)
  }
})

test('cadence vocabulary: BATCHED and DISABLED are valid and labelled; junk is not', () => {
  for (const c of ['IMMEDIATE', 'BATCHED', 'DAILY', 'WEEKLY', 'MONTHLY', 'DISABLED']) {
    assert.ok(isEmailCadence(c), c)
    assert.ok(CADENCE_LABEL[c as keyof typeof CADENCE_LABEL], `label for ${c}`)
  }
  for (const c of ['', 'immediate', 'HOURLY', null, undefined, 3]) assert.equal(isEmailCadence(c), false, String(c))
  assert.ok(SELECTABLE_CADENCES.includes('BATCHED'))
  assert.equal(SELECTABLE_CADENCES[0], 'BATCHED', 'default cadence is listed first')
  for (const c of SELECTABLE_CADENCES) assert.ok(EMAIL_CADENCES.includes(c))
})

test('every event category has a label and appears in ALL_CATEGORIES (settings pages cannot drift)', () => {
  const used = new Set(Object.values(EVENT_META).map((m) => m.category))
  for (const c of Array.from(used)) {
    assert.ok(ALL_CATEGORIES.includes(c), `${c} missing from ALL_CATEGORIES`)
    assert.ok(CATEGORY_LABEL[c], `${c} has no label`)
  }
  for (const c of ['PERFORMANCE', 'PROJECT', 'SCRUM', 'TRAVEL', 'LETTER', 'AUTOMATION'] as const) {
    assert.ok(ALL_CATEGORIES.includes(c), c)
    assert.ok(CATEGORY_LABEL[c].length > 0, c)
  }
  assert.equal(new Set(ALL_CATEGORIES).size, ALL_CATEGORIES.length)
})
