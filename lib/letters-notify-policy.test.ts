import test from 'node:test'
import assert from 'node:assert/strict'
import { letterEventEmails } from './letters-notify-policy'

test('letter approval requests are in-app only (no email)', () => {
  assert.equal(letterEventEmails('LETTER_SUBMITTED'), false)
})

test('other letter events still email', () => {
  for (const key of ['LETTER_APPROVED', 'LETTER_REJECTED', 'LETTER_SENT']) assert.equal(letterEventEmails(key), true)
})
