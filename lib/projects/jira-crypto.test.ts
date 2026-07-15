import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JIRA_TOKEN_KEY_ENV,
  decryptJiraToken,
  encryptJiraToken,
  parseJiraEncryptionKey,
} from './jira-crypto'

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64')
const OTHER_KEY = Buffer.from('abcdef0123456789abcdef0123456789', 'utf8').toString('base64')

test('encryptJiraToken/decryptJiraToken: round-trips token without storing plaintext', () => {
  const encrypted = encryptJiraToken('jira-api-token-123', KEY)

  assert.match(encrypted, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  assert.ok(!encrypted.includes('jira-api-token-123'))
  assert.equal(decryptJiraToken(encrypted, KEY), 'jira-api-token-123')
})

test('encryptJiraToken: random IV makes repeated ciphertexts unique', () => {
  const first = encryptJiraToken('same-token', KEY)
  const second = encryptJiraToken('same-token', KEY)

  assert.notEqual(first, second)
  assert.equal(decryptJiraToken(first, KEY), 'same-token')
  assert.equal(decryptJiraToken(second, KEY), 'same-token')
})

test('decryptJiraToken: rejects wrong keys and tampered ciphertext', () => {
  const encrypted = encryptJiraToken('sensitive-token', KEY)
  const tampered = encrypted.replace(/.$/, encrypted.endsWith('A') ? 'B' : 'A')

  assert.throws(() => decryptJiraToken(encrypted, OTHER_KEY), /Unsupported state|authenticate|bad decrypt|Invalid/i)
  assert.throws(() => decryptJiraToken(tampered, KEY), /Unsupported state|authenticate|bad decrypt|Invalid/i)
})

test('parseJiraEncryptionKey: reads 32-byte keys from env, base64 prefix, or hex', () => {
  const previous = process.env[JIRA_TOKEN_KEY_ENV]
  try {
    process.env[JIRA_TOKEN_KEY_ENV] = KEY
    assert.equal(parseJiraEncryptionKey().length, 32)
    assert.equal(parseJiraEncryptionKey(`base64:${KEY}`).length, 32)
    assert.equal(parseJiraEncryptionKey(Buffer.from(KEY, 'base64').toString('hex')).length, 32)
  } finally {
    if (previous === undefined) delete process.env[JIRA_TOKEN_KEY_ENV]
    else process.env[JIRA_TOKEN_KEY_ENV] = previous
  }
})

test('parseJiraEncryptionKey: rejects missing or wrong-sized keys', () => {
  assert.throws(() => parseJiraEncryptionKey(undefined), /required/)
  assert.throws(() => parseJiraEncryptionKey(Buffer.from('short').toString('base64')), /32 bytes/)
})
