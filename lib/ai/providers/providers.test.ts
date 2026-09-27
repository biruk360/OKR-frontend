import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * AI provider wiring: only OpenAI has a concrete implementation, it is the
 * default, UI pickers see only wired providers, and getProvider() refuses
 * (ProviderNotConfiguredError → 503) when a key is missing or the provider is a
 * stub. getAiOrgConfig() normalises the org row. No network: the OpenAI SDK
 * client is constructed but never called.
 */

let orgRow: { aiSprintPlanningEnabled: boolean; aiPreferredProvider: string | null } | null = null
;(globalThis as any).prisma = {
  organizationSettings: {
    async findUnique() { return orgRow },
  },
}

const KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'] as const

async function withEnv<T>(env: Partial<Record<(typeof KEYS)[number], string>>, fn: () => T | Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, env)
  try {
    return await fn()
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

async function load() {
  const providers = await import('./index')
  const config = await import('../config')
  return { providers, config }
}

test('only OpenAI is wired, and it is the default provider', async () => {
  const { providers, config } = await load()
  assert.equal(config.DEFAULT_PROVIDER, 'openai')
  assert.deepEqual([...providers.WIRED_AI_PROVIDERS], ['openai'])
  assert.equal(providers.isWiredAiProvider('openai'), true)
  for (const id of ['anthropic', 'gemini', 'OPENAI', '']) assert.equal(providers.isWiredAiProvider(id), false, id)
  assert.ok((providers.WIRED_AI_PROVIDERS as readonly string[]).includes(config.DEFAULT_PROVIDER))
  for (const id of config.AI_PROVIDERS) assert.equal(typeof providers.AI_PROVIDER_LABELS[id], 'string', id)
})

test('providerKeyEnvName / hasProviderKey / availableProviders read the env (blank keys do not count)', async () => {
  const { config } = await load()
  assert.equal(config.providerKeyEnvName('openai'), 'OPENAI_API_KEY')
  assert.equal(config.providerKeyEnvName('anthropic'), 'ANTHROPIC_API_KEY')
  assert.equal(config.providerKeyEnvName('gemini'), 'GEMINI_API_KEY')
  await withEnv({ OPENAI_API_KEY: '   ' }, () => {
    assert.equal(config.hasProviderKey('openai'), false)
    assert.deepEqual(config.availableProviders(), [])
  })
  await withEnv({ OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'g' }, () => {
    assert.equal(config.hasProviderKey('openai'), true)
    assert.deepEqual(config.availableProviders(), ['openai', 'gemini'])
  })
})

test('getProvider: OpenAI with a key → OpenAIProvider; missing key or stub provider → ProviderNotConfiguredError', async () => {
  const { providers } = await load()
  await withEnv({}, () => {
    assert.throws(() => providers.getProvider('openai'), (e: any) => e instanceof providers.ProviderNotConfiguredError && e.provider === 'openai')
  })
  await withEnv({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }, () => {
    const p = providers.getProvider('openai')
    assert.equal(p.id, 'openai')
    assert.equal(typeof p.generateSprintPlan, 'function')
    for (const stub of ['anthropic', 'gemini'] as const) {
      assert.throws(() => providers.getProvider(stub), (e: any) => e instanceof providers.ProviderNotConfiguredError
        && e.provider === stub && e.message === `Provider not configured: ${stub}`)
    }
  })
})

test('every wired provider resolves when its key is present', async () => {
  const { providers, config } = await load()
  await withEnv({ OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'k' }, () => {
    for (const id of providers.WIRED_AI_PROVIDERS) assert.equal(providers.getProvider(id).id, id)
    for (const id of config.AI_PROVIDERS.filter((x) => !providers.isWiredAiProvider(x))) {
      assert.throws(() => providers.getProvider(id), providers.ProviderNotConfiguredError, id)
    }
  })
})

test('ProviderCallError carries provider, model and cause', async () => {
  const { providers } = await load()
  const cause = new Error('429')
  const e = new providers.ProviderCallError('openai', 'gpt-5.5', cause)
  assert.equal(e.name, 'ProviderCallError')
  assert.equal(e.message, 'Provider call failed (openai/gpt-5.5)')
  assert.equal(e.cause, cause)
})

test('getAiOrgConfig: missing row → disabled + default; unknown provider → default', async () => {
  const { config } = await load()
  orgRow = null
  assert.deepEqual(await config.getAiOrgConfig(), { enabled: false, preferredProvider: 'openai' })
  orgRow = { aiSprintPlanningEnabled: true, aiPreferredProvider: 'mistral' }
  assert.deepEqual(await config.getAiOrgConfig(), { enabled: true, preferredProvider: 'openai' })
  orgRow = { aiSprintPlanningEnabled: true, aiPreferredProvider: null }
  assert.deepEqual(await config.getAiOrgConfig(), { enabled: true, preferredProvider: 'openai' })
  orgRow = { aiSprintPlanningEnabled: false, aiPreferredProvider: 'openai' }
  assert.equal(await config.isAiSprintPlanningEnabled(), false)
  orgRow = null
})

test('project-creation AI: independent flag, OpenAI-only model allowlist', async () => {
  const { config } = await load()
  const db = (row: { aiProjectCreationEnabled: boolean } | null) => ({ organizationSettings: { findUnique: async () => row } })
  assert.equal(await config.isProjectCreationAiEnabled(db(null)), false)
  assert.equal(await config.isProjectCreationAiEnabled(db({ aiProjectCreationEnabled: true })), true)
  await assert.rejects(config.requireProjectCreationAiEnabled(db({ aiProjectCreationEnabled: false })), (e: any) =>
    e instanceof config.ProjectCreationAiDisabledError && e.status === 404 && e.code === 'PROJECT_CREATION_AI_DISABLED')
  await config.requireProjectCreationAiEnabled(db({ aiProjectCreationEnabled: true }))
  assert.ok((config.PROJECT_CREATION_AI_MODEL_ALLOWLIST as readonly string[]).includes(config.PROJECT_CREATION_AI_DEFAULT_MODEL))
  assert.ok(config.PROJECT_CREATION_AI_MODEL_ALLOWLIST.every((m) => m.startsWith('gpt-')))
})
