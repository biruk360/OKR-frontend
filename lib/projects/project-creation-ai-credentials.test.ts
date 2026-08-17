import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_CREDENTIAL_KEY_ENV,
  decryptAiProviderKey,
  encryptAiProviderKey,
  parseAiCredentialEncryptionKey,
} from '../ai/ai-crypto'
import {
  PROJECT_CREATION_AI_PROVIDER,
  resolveAiProviderCredential,
  resolveProjectCreationAiCredential,
} from '../ai/credentials'
import { decryptJiraToken, encryptJiraToken } from './jira-crypto'

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64')
const OTHER_KEY = Buffer.from('abcdef0123456789abcdef0123456789', 'utf8').toString('base64')

test('AI credential crypto round-trips without storing plaintext and uses random IVs', () => {
  const first = encryptAiProviderKey('sk-database-secret', KEY)
  const second = encryptAiProviderKey('sk-database-secret', KEY)

  assert.match(first, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  assert.ok(!first.includes('sk-database-secret'))
  assert.notEqual(first, second)
  assert.equal(decryptAiProviderKey(first, KEY), 'sk-database-secret')
  assert.equal(decryptAiProviderKey(second, KEY), 'sk-database-secret')
})

test('AI credential crypto rejects tampering, wrong keys, and Jira ciphertext in both directions', () => {
  const aiCiphertext = encryptAiProviderKey('sk-ai-secret', KEY)
  const jiraCiphertext = encryptJiraToken('jira-secret', KEY)
  const tampered = aiCiphertext.replace(/.$/, aiCiphertext.endsWith('A') ? 'B' : 'A')

  assert.throws(() => decryptAiProviderKey(aiCiphertext, OTHER_KEY))
  assert.throws(() => decryptAiProviderKey(tampered, KEY))
  assert.throws(() => decryptAiProviderKey(jiraCiphertext, KEY))
  assert.throws(() => decryptJiraToken(aiCiphertext, KEY))
})

test('AI credential encryption key accepts env, prefixed base64, and hex and rejects invalid keys', () => {
  const previous = process.env[AI_CREDENTIAL_KEY_ENV]
  try {
    process.env[AI_CREDENTIAL_KEY_ENV] = KEY
    assert.equal(parseAiCredentialEncryptionKey().length, 32)
    assert.equal(parseAiCredentialEncryptionKey(`base64:${KEY}`).length, 32)
    assert.equal(parseAiCredentialEncryptionKey(Buffer.from(KEY, 'base64').toString('hex')).length, 32)
    delete process.env[AI_CREDENTIAL_KEY_ENV]
    assert.throws(() => parseAiCredentialEncryptionKey(), /required/)
    assert.throws(
      () => parseAiCredentialEncryptionKey(Buffer.from('short').toString('base64')),
      /32 bytes/
    )
  } finally {
    if (previous === undefined) delete process.env[AI_CREDENTIAL_KEY_ENV]
    else process.env[AI_CREDENTIAL_KEY_ENV] = previous
  }
})

test('AC35: database OpenAI key wins when both database and environment keys exist', async () => {
  const databaseKey = 'sk-database-wins'
  const result = await resolveProjectCreationAiCredential({
    encryptionKey: KEY,
    env: { OPENAI_API_KEY: 'sk-environment-loses' },
    findStoredCredential: async (provider) => {
      assert.equal(provider, PROJECT_CREATION_AI_PROVIDER)
      return { encryptedKey: encryptAiProviderKey(databaseKey, KEY) }
    },
  })

  assert.deepEqual(result, {
    apiKey: databaseKey,
    provider: 'openai',
    source: 'database',
  })
})

test('AI credential resolver preserves environment fallback and unavailable degradation', async () => {
  const fallback = await resolveAiProviderCredential('openai', {
    env: { OPENAI_API_KEY: '  sk-existing-deployment  ' },
    findStoredCredential: async () => null,
  })
  const missing = await resolveAiProviderCredential('openai', {
    env: {},
    findStoredCredential: async () => null,
  })

  assert.deepEqual(fallback, {
    apiKey: 'sk-existing-deployment',
    provider: 'openai',
    source: 'environment',
  })
  assert.equal(missing, null)
})

test('AI credential resolver fails closed when the configured database ciphertext is invalid', async () => {
  await assert.rejects(
    resolveProjectCreationAiCredential({
      encryptionKey: KEY,
      env: { OPENAI_API_KEY: 'sk-must-not-be-used' },
      findStoredCredential: async () => ({ encryptedKey: 'invalid' }),
    }),
    /Invalid AI provider key ciphertext/
  )
})
