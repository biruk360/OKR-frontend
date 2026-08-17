import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  testProjectCreationAiConnection,
  type AiConnectionTestOutcome,
} from '../ai/connection-test'
import { getAiProviderAdminSettings } from '../ai/admin-settings'

const ROOT = process.cwd()
const FULL_KEY = 'sk-connection-test-secret-2468'

function providerError(
  fields: { status?: number; code?: string; type?: string; name?: string },
): Error & typeof fields {
  return Object.assign(new Error(`raw provider failure containing ${FULL_KEY}`), fields)
}

function createConnectionDatabase(lastVerifiedAt: Date | null = null) {
  let credential: { provider: string; label: string | null; lastFour: string; lastVerifiedAt: Date | null } | null = {
    provider: 'openai',
    label: 'Connection test key',
    lastFour: '2468',
    lastVerifiedAt,
  }
  const auditEntries: any[] = []

  const tx: any = {
    aiProviderCredential: {
      async findUnique() {
        return credential ? { ...credential } : null
      },
      async update(args: any) {
        credential = credential ? { ...credential, ...args.data } : null
        return credential
      },
    },
    organizationSettings: {
      async findUnique() {
        return { aiProjectCreationModel: 'gpt-5.5', aiProjectCreationEnabled: true }
      },
    },
    systemSettings: {
      async findMany() {
        return []
      },
    },
    activityLog: {
      async create(args: any) {
        auditEntries.push(args)
        return args
      },
    },
  }

  const database = {
    ...tx,
    async $transaction<T>(operation: (transaction: any) => Promise<T>): Promise<T> {
      return operation(tx)
    },
  }

  return {
    database,
    auditEntries,
    removeCredential() {
      credential = null
    },
    get lastVerifiedAt(): Date | null {
      return credential?.lastVerifiedAt ?? null
    },
  }
}

function databaseCredential() {
  return Promise.resolve({
    apiKey: FULL_KEY,
    provider: 'openai' as const,
    source: 'database' as const,
  })
}

describe('Project Creation AI connection testing', () => {
  it('AC31: verifies a valid stored key, persists lastVerifiedAt, enables availability, and audits success', async () => {
    const fake = createConnectionDatabase()
    const verifiedAt = new Date('2026-08-16T10:15:30.000Z')
    let probedKey: string | null = null

    const result = await testProjectCreationAiConnection('admin-1', {
      database: fake.database,
      resolveCredential: databaseCredential,
      probe: async (apiKey) => {
        probedKey = apiKey
      },
      now: () => verifiedAt,
    })
    const settings = await getAiProviderAdminSettings(fake.database, {})

    assert.equal(probedKey, FULL_KEY)
    assert.deepEqual(result, {
      ok: true,
      outcome: 'SUCCESS',
      message: 'Connection successful. OpenAI accepted the configured key.',
      retryable: false,
      verifiedAt: verifiedAt.toISOString(),
    })
    assert.equal(fake.lastVerifiedAt?.toISOString(), verifiedAt.toISOString())
    assert.equal(settings.available, true)
    assert.equal(settings.lastVerifiedAt?.toISOString(), verifiedAt.toISOString())

    const audit = fake.auditEntries.at(-1).data
    assert.equal(audit.entityType, 'AI_CREDENTIAL')
    assert.equal(audit.action, 'KEY_TESTED')
    assert.equal(audit.actorId, 'admin-1')
    assert.equal(audit.metadata.provider, 'openai')
    assert.equal(audit.metadata.outcome, 'SUCCESS')
    assert.equal(audit.metadata.lastFour, '2468')
    assert.ok(!JSON.stringify({ result, audit }).includes(FULL_KEY))

    const route = readFileSync(path.join(ROOT, 'app/api/settings/integrations/ai/test/route.ts'), 'utf8')
    const panel = readFileSync(path.join(ROOT, 'components/settings/AiProviderSettingsPanel.tsx'), 'utf8')
    assert.match(route, /withRole\('ADMIN'/)
    assert.match(panel, /Test connection/)
    assert.match(panel, /\/api\/settings\/integrations\/ai\/test/)
  })

  it('AC32: reports invalid key, quota, rate-limit, and network failures as distinct safe outcomes', async () => {
    const cases: Array<{
      expected: AiConnectionTestOutcome
      error: Error
      messagePattern: RegExp
    }> = [
      {
        expected: 'INVALID_KEY',
        error: providerError({ status: 401, code: 'invalid_api_key' }),
        messagePattern: /configured OpenAI key was rejected/,
      },
      {
        expected: 'INSUFFICIENT_QUOTA',
        error: providerError({ status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota' }),
        messagePattern: /insufficient quota or has reached a spend limit/,
      },
      {
        expected: 'RATE_LIMITED',
        error: providerError({ status: 429, code: 'rate_limit_exceeded' }),
        messagePattern: /rate-limited/,
      },
      {
        expected: 'NETWORK_ERROR',
        error: providerError({ name: 'APIConnectionError' }),
        messagePattern: /could not reach OpenAI/,
      },
    ]

    for (const testCase of cases) {
      const previousVerification = new Date('2026-08-15T08:00:00.000Z')
      const fake = createConnectionDatabase(previousVerification)
      const result = await testProjectCreationAiConnection('admin-safe-errors', {
        database: fake.database,
        resolveCredential: databaseCredential,
        probe: async () => {
          throw testCase.error
        },
      })

      assert.equal(result.ok, false)
      assert.equal(result.outcome, testCase.expected)
      assert.match(result.message, testCase.messagePattern)
      assert.equal(result.verifiedAt, null)
      assert.ok(!JSON.stringify(result).includes(FULL_KEY))
      assert.ok(!JSON.stringify(result).includes(testCase.error.message))

      const audit = fake.auditEntries.at(-1).data
      assert.equal(audit.action, 'KEY_TESTED')
      assert.equal(audit.metadata.outcome, testCase.expected)
      assert.ok(!JSON.stringify(audit).includes(FULL_KEY))
      assert.ok(!JSON.stringify(audit).includes(testCase.error.message))

      if (testCase.expected === 'INVALID_KEY') assert.equal(fake.lastVerifiedAt, null)
      else assert.equal(fake.lastVerifiedAt?.toISOString(), previousVerification.toISOString())
    }
  })

  it('reports missing, unreadable, and concurrently changed credentials without probing or leaking details', async () => {
    const missing = createConnectionDatabase()
    missing.removeCredential()
    let probes = 0
    const missingResult = await testProjectCreationAiConnection('admin-1', {
      database: missing.database,
      resolveCredential: async () => null,
      probe: async () => { probes += 1 },
    })
    assert.equal(missingResult.outcome, 'NOT_CONFIGURED')

    const unreadable = createConnectionDatabase()
    const unreadableResult = await testProjectCreationAiConnection('admin-1', {
      database: unreadable.database,
      resolveCredential: async () => { throw new Error(`decrypt failed ${FULL_KEY}`) },
      probe: async () => { probes += 1 },
    })
    assert.equal(unreadableResult.outcome, 'CONFIGURATION_ERROR')

    const changed = createConnectionDatabase()
    const changedResult = await testProjectCreationAiConnection('admin-1', {
      database: changed.database,
      resolveCredential: databaseCredential,
      probe: async () => changed.removeCredential(),
    })
    assert.equal(changedResult.outcome, 'CONFIGURATION_CHANGED')
    assert.equal(changedResult.verifiedAt, null)
    assert.equal(probes, 0)
    assert.ok(!JSON.stringify({ missingResult, unreadableResult, changedResult }).includes(FULL_KEY))
  })
})
