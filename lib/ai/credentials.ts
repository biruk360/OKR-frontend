import { prisma } from '@/lib/prisma'
import { decryptAiProviderKey } from './ai-crypto'
import { providerKeyEnvName, type AiProviderId } from './config'

export const PROJECT_CREATION_AI_PROVIDER = 'openai' as const

export interface ResolvedAiProviderCredential {
  apiKey: string
  provider: AiProviderId
  source: 'database' | 'environment'
}

interface StoredCredential {
  encryptedKey: string
}

type FindStoredCredential = (provider: AiProviderId) => Promise<StoredCredential | null>

interface ResolveCredentialOptions {
  encryptionKey?: string
  env?: Readonly<Record<string, string | undefined>>
  findStoredCredential?: FindStoredCredential
}

async function findStoredCredential(provider: AiProviderId): Promise<StoredCredential | null> {
  return prisma.aiProviderCredential.findUnique({
    where: { provider },
    select: { encryptedKey: true },
  })
}

/**
 * Resolves a server-side provider key with the database taking precedence over
 * the legacy environment path. A configured but undecryptable database value
 * fails closed instead of silently falling back to a different key.
 */
export async function resolveAiProviderCredential(
  provider: AiProviderId,
  options: ResolveCredentialOptions = {}
): Promise<ResolvedAiProviderCredential | null> {
  const stored = await (options.findStoredCredential ?? findStoredCredential)(provider)
  if (stored) {
    return {
      apiKey: decryptAiProviderKey(stored.encryptedKey, options.encryptionKey),
      provider,
      source: 'database',
    }
  }

  const env = options.env ?? process.env
  const apiKey = env[providerKeyEnvName(provider)]?.trim()
  if (!apiKey) return null

  return { apiKey, provider, source: 'environment' }
}

/** Project creation is OpenAI-only, regardless of the org sprint-provider preference. */
export function resolveProjectCreationAiCredential(
  options: ResolveCredentialOptions = {}
): Promise<ResolvedAiProviderCredential | null> {
  return resolveAiProviderCredential(PROJECT_CREATION_AI_PROVIDER, options)
}
