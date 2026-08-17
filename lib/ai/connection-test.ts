import OpenAI, { APIConnectionError, APIConnectionTimeoutError } from 'openai'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import {
  PROJECT_CREATION_AI_PROVIDER,
  resolveProjectCreationAiCredential,
  type ResolvedAiProviderCredential,
} from './credentials'

export type AiConnectionTestOutcome =
  | 'SUCCESS'
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'INSUFFICIENT_QUOTA'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'CONFIGURATION_CHANGED'

export interface AiConnectionTestResult {
  ok: boolean
  outcome: AiConnectionTestOutcome
  message: string
  retryable: boolean
  verifiedAt: string | null
}

interface CredentialState {
  lastFour: string
  lastVerifiedAt: Date | null
}

interface ConnectionTestTransaction {
  aiProviderCredential: {
    findUnique(args: unknown): Promise<CredentialState | null>
    update(args: unknown): Promise<CredentialState>
  }
  activityLog: {
    create(args: unknown): Promise<unknown>
  }
}

interface ConnectionTestDatabase {
  $transaction<T>(operation: (tx: ConnectionTestTransaction) => Promise<T>): Promise<T>
}

type ResolveCredential = () => Promise<ResolvedAiProviderCredential | null>
type ProbeOpenAi = (apiKey: string) => Promise<void>

interface ConnectionTestOptions {
  database?: ConnectionTestDatabase
  resolveCredential?: ResolveCredential
  probe?: ProbeOpenAi
  now?: () => Date
}

interface OpenAiErrorShape {
  status?: unknown
  code?: unknown
  type?: unknown
  name?: unknown
}

const QUOTA_ERROR_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
])

const SAFE_RESULTS: Record<Exclude<AiConnectionTestOutcome, 'SUCCESS'>, Omit<AiConnectionTestResult, 'outcome'>> = {
  NOT_CONFIGURED: {
    ok: false,
    message: 'No OpenAI key is configured. Save a key before testing the connection.',
    retryable: false,
    verifiedAt: null,
  },
  INVALID_KEY: {
    ok: false,
    message: 'The configured OpenAI key was rejected. Replace or rotate the key, then test again.',
    retryable: false,
    verifiedAt: null,
  },
  INSUFFICIENT_QUOTA: {
    ok: false,
    message: 'OpenAI accepted the request but the account has insufficient quota or has reached a spend limit. Review OpenAI billing and limits.',
    retryable: false,
    verifiedAt: null,
  },
  RATE_LIMITED: {
    ok: false,
    message: 'OpenAI rate-limited the connection test. Wait briefly, then try again.',
    retryable: true,
    verifiedAt: null,
  },
  NETWORK_ERROR: {
    ok: false,
    message: 'The server could not reach OpenAI. Check network, proxy, firewall, and TLS settings, then try again.',
    retryable: true,
    verifiedAt: null,
  },
  CONFIGURATION_ERROR: {
    ok: false,
    message: 'The stored OpenAI credential could not be read. Rotate the key, then test again.',
    retryable: false,
    verifiedAt: null,
  },
  PROVIDER_ERROR: {
    ok: false,
    message: 'OpenAI could not complete the connection test. Try again; if the problem persists, check the OpenAI service status.',
    retryable: true,
    verifiedAt: null,
  },
  CONFIGURATION_CHANGED: {
    ok: false,
    message: 'The OpenAI credential changed while it was being tested. Test the current key again.',
    retryable: true,
    verifiedAt: null,
  },
}

function safeResult(outcome: Exclude<AiConnectionTestOutcome, 'SUCCESS'>): AiConnectionTestResult {
  return { outcome, ...SAFE_RESULTS[outcome] }
}

/**
 * Maps provider failures without ever copying the provider message, request,
 * stack, or credential into a client-visible or audited value.
 */
export function classifyOpenAiConnectionError(error: unknown): AiConnectionTestResult {
  const shape = error && typeof error === 'object' ? error as OpenAiErrorShape : {}
  const status = typeof shape.status === 'number' ? shape.status : undefined
  const code = typeof shape.code === 'string' ? shape.code : undefined
  const type = typeof shape.type === 'string' ? shape.type : undefined

  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError || shape.name === 'APIConnectionError' || shape.name === 'APIConnectionTimeoutError') {
    return safeResult('NETWORK_ERROR')
  }
  if (status === 401 || status === 403) return safeResult('INVALID_KEY')
  if (status === 429 && (type === 'insufficient_quota' || (code && QUOTA_ERROR_CODES.has(code)))) {
    return safeResult('INSUFFICIENT_QUOTA')
  }
  if (status === 429) return safeResult('RATE_LIMITED')
  if (status !== undefined && status >= 500) return safeResult('NETWORK_ERROR')
  return safeResult('PROVIDER_ERROR')
}

async function probeOpenAi(apiKey: string): Promise<void> {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 10_000 })
  // Authentication-only live call: no prompt, generation tokens, or user data.
  await client.models.list()
}

function valuesMatch(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime()
}

async function persistConnectionTest(
  actorId: string,
  candidate: AiConnectionTestResult,
  credential: ResolvedAiProviderCredential | null,
  verifiedAt: Date | null,
  database: ConnectionTestDatabase,
): Promise<AiConnectionTestResult> {
  return database.$transaction(async (tx) => {
    const stored = await tx.aiProviderCredential.findUnique({
      where: { provider: PROJECT_CREATION_AI_PROVIDER },
      select: { lastFour: true, lastVerifiedAt: true },
    })
    const testedLastFour = credential?.apiKey.slice(-4) ?? null
    const databaseCredentialChanged = credential?.source === 'database'
      && (!stored || stored.lastFour !== testedLastFour)
    const result = databaseCredentialChanged
      ? safeResult('CONFIGURATION_CHANGED')
      : candidate

    let nextLastVerifiedAt = stored?.lastVerifiedAt ?? null
    if (credential?.source === 'database' && stored) {
      if (result.outcome === 'SUCCESS') nextLastVerifiedAt = verifiedAt
      if (result.outcome === 'INVALID_KEY') nextLastVerifiedAt = null
      if (!valuesMatch(stored.lastVerifiedAt, nextLastVerifiedAt)) {
        await tx.aiProviderCredential.update({
          where: { provider: PROJECT_CREATION_AI_PROVIDER },
          data: { lastVerifiedAt: nextLastVerifiedAt },
          select: { lastFour: true, lastVerifiedAt: true },
        })
      }
    }

    await recordActivity({
      entityType: 'AI_CREDENTIAL',
      action: 'KEY_TESTED',
      actorId,
      changes: valuesMatch(stored?.lastVerifiedAt ?? null, nextLastVerifiedAt)
        ? null
        : {
            lastVerifiedAt: {
              from: stored?.lastVerifiedAt?.toISOString() ?? null,
              to: nextLastVerifiedAt?.toISOString() ?? null,
            },
          },
      metadata: {
        provider: PROJECT_CREATION_AI_PROVIDER,
        source: credential?.source ?? null,
        outcome: result.outcome,
        retryable: result.retryable,
        lastFour: stored?.lastFour ?? testedLastFour,
      },
    }, { client: tx, required: true })

    return result.outcome === 'SUCCESS' && verifiedAt
      ? { ...result, verifiedAt: verifiedAt.toISOString() }
      : result
  })
}

export async function testProjectCreationAiConnection(
  actorId: string,
  options: ConnectionTestOptions = {},
): Promise<AiConnectionTestResult> {
  const database = options.database ?? prisma as unknown as ConnectionTestDatabase
  const resolveCredential = options.resolveCredential ?? (() => resolveProjectCreationAiCredential())
  const probe = options.probe ?? probeOpenAi
  const now = options.now ?? (() => new Date())

  let credential: ResolvedAiProviderCredential | null
  try {
    credential = await resolveCredential()
  } catch {
    return persistConnectionTest(actorId, safeResult('CONFIGURATION_ERROR'), null, null, database)
  }

  if (!credential) {
    return persistConnectionTest(actorId, safeResult('NOT_CONFIGURED'), null, null, database)
  }

  try {
    await probe(credential.apiKey)
  } catch (error) {
    return persistConnectionTest(actorId, classifyOpenAiConnectionError(error), credential, null, database)
  }

  const verifiedAt = now()
  return persistConnectionTest(actorId, {
    ok: true,
    outcome: 'SUCCESS',
    message: 'Connection successful. OpenAI accepted the configured key.',
    retryable: false,
    verifiedAt: verifiedAt.toISOString(),
  }, credential, verifiedAt, database)
}
