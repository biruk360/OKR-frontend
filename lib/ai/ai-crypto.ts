import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const VERSION = 'v1'
const AAD = Buffer.from('okr-ai:provider-key:v1', 'utf8')

export const AI_CREDENTIAL_KEY_ENV = 'AI_CREDENTIAL_ENCRYPTION_KEY'

export function encryptAiProviderKey(
  apiKey: string,
  keyInput = process.env[AI_CREDENTIAL_KEY_ENV]
): string {
  if (!apiKey) throw new Error('AI provider key is required')
  const key = parseAiCredentialEncryptionKey(keyInput)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES })
  cipher.setAAD(AAD)

  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptAiProviderKey(
  encryptedKey: string,
  keyInput = process.env[AI_CREDENTIAL_KEY_ENV]
): string {
  const key = parseAiCredentialEncryptionKey(keyInput)
  const parts = encryptedKey.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid AI provider key ciphertext')
  }

  const [, ivPart, authTagPart, ciphertextPart] = parts
  const iv = decodePart(ivPart)
  const authTag = decodePart(authTagPart)
  const ciphertext = decodePart(ciphertextPart)
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error('Invalid AI provider key ciphertext')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES })
  decipher.setAAD(AAD)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function parseAiCredentialEncryptionKey(
  keyInput = process.env[AI_CREDENTIAL_KEY_ENV]
): Buffer {
  const raw = keyInput?.trim()
  if (!raw) throw new Error(`${AI_CREDENTIAL_KEY_ENV} is required`)

  const encoded = raw.startsWith('base64:') ? raw.slice('base64:'.length) : raw
  const key = /^[0-9a-f]{64}$/i.test(encoded)
    ? Buffer.from(encoded, 'hex')
    : Buffer.from(encoded, 'base64')

  if (key.length !== 32) {
    throw new Error(`${AI_CREDENTIAL_KEY_ENV} must decode to exactly 32 bytes for AES-256-GCM`)
  }
  return key
}

function decodePart(value: string): Buffer {
  try {
    return Buffer.from(value, 'base64url')
  } catch {
    throw new Error('Invalid AI provider key ciphertext')
  }
}
