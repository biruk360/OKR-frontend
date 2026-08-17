import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  getAiProviderAdminSettings,
  removeAiProviderCredential,
  saveAiProviderAdminSettings,
} from '../ai/admin-settings'
import { AI_CREDENTIAL_KEY_ENV } from '../ai/ai-crypto'
import { resolveProjectCreationAiCredential } from '../ai/credentials'

const ROOT = process.cwd()
const ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64')
const previousEncryptionKey = process.env[AI_CREDENTIAL_KEY_ENV]

before(() => {
  process.env[AI_CREDENTIAL_KEY_ENV] = ENCRYPTION_KEY
})

after(() => {
  if (previousEncryptionKey === undefined) delete process.env[AI_CREDENTIAL_KEY_ENV]
  else process.env[AI_CREDENTIAL_KEY_ENV] = previousEncryptionKey
})

function createSettingsDatabase() {
  let credential: any = null
  let organization: { model: string | null; featureEnabled: boolean; sprintEnabled: boolean } | null = null
  const systemSettings = new Map<string, string>()
  const auditEntries: any[] = []
  const credentialSelects: any[] = []

  function metadata() {
    return credential
      ? {
          provider: credential.provider,
          label: credential.label,
          lastFour: credential.lastFour,
          lastVerifiedAt: credential.lastVerifiedAt,
        }
      : null
  }

  const tx: any = {
    aiProviderCredential: {
      async findUnique(args: any) {
        credentialSelects.push(args)
        return metadata()
      },
      async upsert(args: any) {
        const values = credential ? args.update : args.create
        credential = {
          ...(credential ?? {}),
          provider: 'openai',
          ...values,
          lastVerifiedAt: values.lastVerifiedAt ?? credential?.lastVerifiedAt ?? null,
        }
        return metadata()
      },
      async update(args: any) {
        credential = { ...credential, ...args.data }
        return metadata()
      },
      async delete() {
        credential = null
        return null
      },
    },
    organizationSettings: {
      async findUnique() {
        return organization === null
          ? null
          : {
              aiProjectCreationModel: organization.model,
              aiProjectCreationEnabled: organization.featureEnabled,
            }
      },
      async upsert(args: any) {
        const values = organization === null ? args.create : args.update
        organization = {
          model: values.aiProjectCreationModel,
          featureEnabled: values.aiProjectCreationEnabled,
          sprintEnabled: organization?.sprintEnabled ?? false,
        }
        return {
          aiProjectCreationModel: organization.model,
          aiProjectCreationEnabled: organization.featureEnabled,
        }
      },
    },
    systemSettings: {
      async findMany() {
        return Array.from(systemSettings, ([key, value]) => ({ key, value }))
      },
      async upsert(args: any) {
        const value = systemSettings.has(args.where.key) ? args.update.value : args.create.value
        systemSettings.set(args.where.key, value)
        return { key: args.where.key, value }
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
    credentialSelects,
    get encryptedKey(): string | null {
      return credential?.encryptedKey ?? null
    },
    get storedCredentialCount(): number {
      return credential ? 1 : 0
    },
  }
}

describe('Project Creation AI administration', () => {
  it('AC30: reports AI unavailable with no database or environment key without changing manual/import paths', async () => {
    const fake = createSettingsDatabase()
    const settings = await getAiProviderAdminSettings(fake.database, {})

    assert.equal(settings.configured, false)
    assert.equal(settings.available, false)
    assert.equal(settings.source, null)
    assert.equal(settings.maskedKey, null)

    const panel = readFileSync(path.join(ROOT, 'components/settings/AiProviderSettingsPanel.tsx'), 'utf8')
    assert.match(panel, /AI-assisted creation is unavailable/)
    assert.match(panel, /manual creation and deterministic file import remain unaffected/i)
  })

  it('AC33: returns only a masked key and never places full key or ciphertext in response or audit data', async () => {
    const fake = createSettingsDatabase()
    const fullKey = 'sk-project-secret-value-1234'
    const settings = await saveAiProviderAdminSettings({
      actorId: 'admin-1',
      apiKey: fullKey,
      label: 'Production project key',
      featureEnabled: false,
      model: 'gpt-5.5',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    }, fake.database, {})

    assert.equal(settings.maskedKey, 'sk-…1234')
    assert.equal(settings.source, 'database')
    assert.equal(settings.configured, true)
    assert.equal(settings.available, false)
    assert.equal(settings.canRemove, true)
    assert.ok(fake.encryptedKey)
    const publicPayload = JSON.stringify(settings)
    const auditPayload = JSON.stringify(fake.auditEntries)
    assert.ok(!publicPayload.includes(fullKey))
    assert.ok(!publicPayload.includes(fake.encryptedKey!))
    assert.ok(!publicPayload.includes('encryptedKey'))
    assert.ok(!auditPayload.includes(fullKey))
    assert.ok(!auditPayload.includes(fake.encryptedKey!))
    assert.ok(fake.credentialSelects.every((query) => query.select?.encryptedKey !== true))

    const route = readFileSync(path.join(ROOT, 'app/api/settings/integrations/ai/route.ts'), 'utf8')
    const page = readFileSync(path.join(ROOT, 'app/dashboard/settings/integrations/page.tsx'), 'utf8')
    const panel = readFileSync(path.join(ROOT, 'components/settings/AiProviderSettingsPanel.tsx'), 'utf8')
    assert.match(route, /withRole\('ADMIN'/)
    assert.match(page, /showAiProviderSettings=\{session\.user\.role === 'ADMIN'\}/)
    assert.match(panel, /apiKey: ''/)
    assert.doesNotMatch(route, /encryptedKey/)
  })

  it('AC34: rotation overwrites the key used by the next resolver call and audits no key material', async () => {
    const fake = createSettingsDatabase()
    const oldKey = 'sk-project-old-secret-1111'
    const newKey = 'sk-project-new-secret-2222'
    await saveAiProviderAdminSettings({
      actorId: 'admin-1',
      apiKey: oldKey,
      label: 'Primary',
      featureEnabled: false,
      model: 'gpt-5.5',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    }, fake.database, {})
    const oldCiphertext = fake.encryptedKey

    const rotated = await saveAiProviderAdminSettings({
      actorId: 'admin-2',
      apiKey: newKey,
      label: 'Rotated primary',
      featureEnabled: false,
      model: 'gpt-5.5-pro',
      dailyGenerationCap: 75,
      perUserCooldownMinutes: 15,
    }, fake.database, { OPENAI_API_KEY: 'sk-environment-must-not-win-9999' })
    const resolved = await resolveProjectCreationAiCredential({
      encryptionKey: ENCRYPTION_KEY,
      env: { OPENAI_API_KEY: 'sk-environment-must-not-win-9999' },
      findStoredCredential: async () => ({ encryptedKey: fake.encryptedKey! }),
    })

    assert.notEqual(fake.encryptedKey, oldCiphertext)
    assert.equal(fake.storedCredentialCount, 1)
    assert.equal(rotated.maskedKey, 'sk-…2222')
    assert.equal(rotated.model, 'gpt-5.5-pro')
    assert.equal(rotated.dailyGenerationCap, 75)
    assert.equal(rotated.perUserCooldownMinutes, 15)
    assert.equal(rotated.lastVerifiedAt, null)
    assert.equal(resolved?.apiKey, newKey)
    assert.equal(resolved?.source, 'database')

    const rotationAudit = fake.auditEntries.find((entry) => entry.data.action === 'KEY_ROTATED')
    assert.equal(rotationAudit.data.actorId, 'admin-2')
    const auditPayload = JSON.stringify(fake.auditEntries)
    assert.ok(!auditPayload.includes(oldKey))
    assert.ok(!auditPayload.includes(newKey))
    assert.ok(!auditPayload.includes(fake.encryptedKey!))
  })

  it('removes only the database key, audits removal, and reveals safe environment fallback state', async () => {
    const fake = createSettingsDatabase()
    await saveAiProviderAdminSettings({
      actorId: 'admin-1',
      apiKey: 'sk-project-removable-4567',
      featureEnabled: false,
      model: 'gpt-5.5',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    }, fake.database, {})

    const result = await removeAiProviderCredential(
      'admin-2',
      fake.database,
      { OPENAI_API_KEY: 'sk-environment-fallback-9876' },
    )

    assert.equal(result.changed, true)
    assert.equal(fake.storedCredentialCount, 0)
    assert.equal(result.settings.source, 'environment')
    assert.equal(result.settings.maskedKey, 'sk-…9876')
    assert.equal(result.settings.canRemove, false)
    const removalAudit = fake.auditEntries.find((entry) => entry.data.action === 'DELETED')
    assert.equal(removalAudit.data.entityType, 'AI_CREDENTIAL')
    assert.equal(removalAudit.data.actorId, 'admin-2')
  })
})
