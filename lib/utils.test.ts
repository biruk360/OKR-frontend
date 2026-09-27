import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDate,
  formatRelativeTime,
  getConfidenceColor,
  getOkrStatusColor,
  getProgressBarClass,
  getProgressBarColor,
  getProgressColor,
  isValidEmail,
} from './utils'

/**
 * lib/utils.ts colour helpers and formatters (cn() is covered by
 * lib/utils-cn.test.ts). The 70 / 40 progress bands are the product rule; the
 * three progress helpers must agree band-for-band.
 */

const BANDS: Array<[number, 'ok' | 'warn' | 'danger']> = [
  [100, 'ok'], [70, 'ok'], [69.99, 'warn'], [40, 'warn'], [39.99, 'danger'], [0, 'danger'], [-5, 'danger'], [150, 'ok'],
]

test('getProgressColor / getProgressBarClass / getProgressBarColor share the 70/40 bands', () => {
  const cls = { ok: 'bg-success-500', warn: 'bg-warning-500', danger: 'bg-danger-500' }
  const css = { ok: 'var(--ap-ok)', warn: 'var(--ap-warn)', danger: 'var(--ap-danger)' }
  for (const [p, band] of BANDS) {
    assert.equal(getProgressColor(p), cls[band], `class ${p}`)
    assert.equal(getProgressBarClass(p), cls[band], `bar class ${p}`)
    assert.equal(getProgressBarColor(p), css[band], `css ${p}`)
  }
})

test('getProgressColor: NaN is not "on track"', () => {
  assert.equal(getProgressColor(Number.NaN), 'bg-danger-500')
  assert.equal(getProgressBarColor(Number.NaN), 'var(--ap-danger)')
})

test('getConfidenceColor: enum → token; unknown / missing → neutral, never green', () => {
  assert.equal(getConfidenceColor('ON_TRACK'), 'var(--ap-ok)')
  assert.equal(getConfidenceColor('AT_RISK'), 'var(--ap-warn)')
  assert.equal(getConfidenceColor('OFF_TRACK'), 'var(--ap-danger)')
  for (const v of [null, undefined, '', 'on-track', 'on_track', 'COMPLETED']) {
    assert.equal(getConfidenceColor(v), 'var(--ap-none)', String(v))
  }
})

test('getOkrStatusColor: kebab-case UI statuses; enum values fall back to muted', () => {
  assert.equal(getOkrStatusColor('on-track'), 'var(--ap-ok)')
  assert.equal(getOkrStatusColor('completed'), 'var(--ap-ok)')
  assert.equal(getOkrStatusColor('in-progress'), 'var(--ap-ok)')
  assert.equal(getOkrStatusColor('at-risk'), 'var(--ap-warn)')
  assert.equal(getOkrStatusColor('off-track'), 'var(--ap-danger)')
  assert.equal(getOkrStatusColor('ON_TRACK'), 'var(--ap-fg-muted)')
  assert.equal(getOkrStatusColor('not-started'), 'var(--ap-fg-muted)')
})

test('formatDate: default and custom patterns, Date or string input', () => {
  // Local-time inputs so the result does not depend on the machine's timezone.
  assert.equal(formatDate(new Date(2026, 8, 5, 12)), 'Sep 05, 2026')
  assert.equal(formatDate('2026-09-05T12:00:00', 'yyyy-MM-dd'), '2026-09-05')
  assert.throws(() => formatDate('not a date'), RangeError)
})

test('formatRelativeTime: past and future with suffix', () => {
  assert.equal(formatRelativeTime(new Date(Date.now() - 3 * 60 * 60 * 1000)), 'about 3 hours ago')
  assert.equal(formatRelativeTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60_000)), 'in 2 days')
  assert.equal(formatRelativeTime(new Date(Date.now() - 10_000).toISOString()), 'less than a minute ago')
})

test('isValidEmail', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org']) assert.equal(isValidEmail(ok), true, ok)
  for (const bad of ['', 'a@b', 'a b@c.d', '@b.co', 'a@.co ', 'a@b.co\n']) assert.equal(isValidEmail(bad), false, JSON.stringify(bad))
})
