import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countSummaryBullets,
  currentBiMonthlyPeriod,
  enforceSummaryCaps,
  validateAiSummary,
} from './client-report'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS } from '../../features/projects/types'

test('validateAiSummary: accepts five bullets within 800 chars', () => {
  const summary = ['- One', '- Two', '- Three', '- Four', '- Five'].join('\n')
  const result = validateAiSummary(summary)
  assert.equal(result.valid, true)
  assert.equal(result.bullets, AI_SUMMARY_MAX_BULLETS)
  assert.equal(result.chars, summary.length)
})

test('validateAiSummary: rejects more than five bullets', () => {
  const summary = ['- One', '- Two', '- Three', '- Four', '- Five', '- Six'].join('\n')
  const result = validateAiSummary(summary)
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /5 bullets/)
})

test('validateAiSummary: rejects more than 800 chars', () => {
  const result = validateAiSummary(`- ${'x'.repeat(AI_SUMMARY_MAX_CHARS)}`)
  assert.equal(result.valid, false)
  assert.match(result.errors.join(' '), /800 characters/)
})

test('enforceSummaryCaps: trims generated summaries to hard limits', () => {
  const summary = enforceSummaryCaps(Array.from({ length: 8 }, (_, i) => `- ${i} ${'x'.repeat(250)}`))
  assert.equal(countSummaryBullets(summary) <= AI_SUMMARY_MAX_BULLETS, true)
  assert.equal(summary.length <= AI_SUMMARY_MAX_CHARS, true)
})

test('currentBiMonthlyPeriod: splits month into 1-15 and 16-end windows', () => {
  const first = currentBiMonthlyPeriod(new Date('2026-07-15T12:00:00.000Z'))
  assert.equal(first.start.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(first.end.toISOString(), '2026-07-15T23:59:59.999Z')

  const second = currentBiMonthlyPeriod(new Date('2026-02-16T12:00:00.000Z'))
  assert.equal(second.start.toISOString(), '2026-02-16T00:00:00.000Z')
  assert.equal(second.end.toISOString(), '2026-02-28T23:59:59.999Z')
})
