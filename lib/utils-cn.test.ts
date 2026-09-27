import test from 'node:test'
import assert from 'node:assert/strict'
import { cn } from './utils'

test('cn keeps a custom font size next to a text colour', () => {
  assert.equal(cn('text-body-sm', 'text-ink-secondary'), 'text-body-sm text-ink-secondary')
  assert.equal(cn('text-page-title', 'text-primary-600'), 'text-page-title text-primary-600')
})

test('cn still resolves conflicts within each group', () => {
  assert.equal(cn('text-body', 'text-body-sm'), 'text-body-sm')
  assert.equal(cn('text-primary-600', 'text-ink-primary'), 'text-ink-primary')
})
