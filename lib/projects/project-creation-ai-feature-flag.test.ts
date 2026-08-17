import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  AI_FEATURE_KEYS,
  ProjectCreationAiDisabledError,
  isProjectCreationAiEnabled,
  requireProjectCreationAiEnabled,
} from '../ai/config'
import { saveAiProviderAdminSettings } from '../ai/admin-settings'

const ROOT = process.cwd()

function createFlagDatabase() {
  const organization = {
    aiSprintPlanningEnabled: true,
    aiProjectCreationEnabled: false,
    aiProjectCreationModel: null as string | null,
  }
  const systemSettings = new Map<string, string>()
  const auditEntries: any[] = []

  const tx: any = {
    aiProviderCredential: {
      async findUnique() { return null },
      async upsert() { throw new Error('No credential write expected') },
      async update() { throw new Error('No credential write expected') },
      async delete() { throw new Error('No credential write expected') },
    },
    organizationSettings: {
      async findUnique() {
        return {
          aiProjectCreationEnabled: organization.aiProjectCreationEnabled,
          aiProjectCreationModel: organization.aiProjectCreationModel,
        }
      },
      async upsert(args: any) {
        const values = args.update
        if ('aiProjectCreationEnabled' in values) {
          organization.aiProjectCreationEnabled = values.aiProjectCreationEnabled
        }
        if ('aiProjectCreationModel' in values) {
          organization.aiProjectCreationModel = values.aiProjectCreationModel
        }
        return {
          aiProjectCreationEnabled: organization.aiProjectCreationEnabled,
          aiProjectCreationModel: organization.aiProjectCreationModel,
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

  return { database, organization, auditEntries }
}

describe('Project Creation AI feature flag', () => {
  it('AC36: refuses project-creation AI while disabled without reading or changing the sprint-planning flag', async () => {
    const fake = createFlagDatabase()

    assert.equal(AI_FEATURE_KEYS.PROJECT_CREATION_AI, 'PROJECT_CREATION_AI')
    assert.notEqual(AI_FEATURE_KEYS.PROJECT_CREATION_AI, AI_FEATURE_KEYS.SPRINT_PLAN)
    assert.equal(await isProjectCreationAiEnabled(fake.database), false)
    await assert.rejects(
      requireProjectCreationAiEnabled(fake.database),
      (error: unknown) => {
        assert.ok(error instanceof ProjectCreationAiDisabledError)
        assert.equal(error.code, 'PROJECT_CREATION_AI_DISABLED')
        assert.equal(error.status, 404)
        return true
      },
    )
    assert.equal(fake.organization.aiSprintPlanningEnabled, true)
  })

  it('enables and disables only project-creation AI and audits each toggle atomically', async () => {
    const fake = createFlagDatabase()
    const enabled = await saveAiProviderAdminSettings({
      actorId: 'admin-flag',
      featureEnabled: true,
      model: 'gpt-5.5',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    }, fake.database, {})

    assert.equal(enabled.featureEnabled, true)
    assert.equal(await isProjectCreationAiEnabled(fake.database), true)
    await requireProjectCreationAiEnabled(fake.database)
    assert.equal(fake.organization.aiSprintPlanningEnabled, true)

    const enableAudit = fake.auditEntries.at(-1).data
    assert.equal(enableAudit.entityType, 'AI_CREDENTIAL')
    assert.equal(enableAudit.action, 'SETTINGS_UPDATED')
    assert.equal(enableAudit.actorId, 'admin-flag')
    assert.deepEqual(enableAudit.changes.featureEnabled, { from: false, to: true })
    assert.equal(enableAudit.metadata.provider, 'openai')
    assert.equal(enableAudit.metadata.outcome, 'SUCCESS')

    const disabled = await saveAiProviderAdminSettings({
      actorId: 'admin-flag',
      featureEnabled: false,
      model: 'gpt-5.5',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    }, fake.database, {})

    assert.equal(disabled.featureEnabled, false)
    assert.equal(await isProjectCreationAiEnabled(fake.database), false)
    assert.equal(fake.organization.aiSprintPlanningEnabled, true)
    assert.deepEqual(fake.auditEntries.at(-1).data.changes.featureEnabled, { from: true, to: false })
  })

  it('wires the Administrator toggle and server validation to the independent default-off schema field', () => {
    const schema = readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
    const route = readFileSync(path.join(ROOT, 'app/api/settings/integrations/ai/route.ts'), 'utf8')
    const panel = readFileSync(path.join(ROOT, 'components/settings/AiProviderSettingsPanel.tsx'), 'utf8')
    const config = readFileSync(path.join(ROOT, 'lib/ai/config.ts'), 'utf8')

    assert.match(schema, /aiProjectCreationEnabled\s+Boolean\s+@default\(false\)/)
    assert.match(route, /featureEnabled: z\.boolean\(\)/)
    assert.match(panel, /Enable AI-assisted project creation/)
    assert.match(panel, /Independent of AI Sprint Planning/)
    assert.match(config, /PROJECT_CREATION_AI: 'PROJECT_CREATION_AI'/)
    assert.match(config, /select: \{ aiProjectCreationEnabled: true \}/)
    assert.doesNotMatch(config, /aiProjectCreationEnabled ===.*aiSprintPlanningEnabled/)
  })
})
