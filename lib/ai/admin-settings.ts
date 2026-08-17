import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { encryptAiProviderKey } from './ai-crypto'
import {
  PROJECT_CREATION_AI_DEFAULT_DAILY_CAP,
  PROJECT_CREATION_AI_DEFAULT_MODEL,
  PROJECT_CREATION_AI_DEFAULT_USER_COOLDOWN_MINUTES,
  PROJECT_CREATION_AI_MODEL_ALLOWLIST,
  type ProjectCreationAiModel,
} from './config'
import { PROJECT_CREATION_AI_PROVIDER } from './credentials'

export const PROJECT_CREATION_AI_DAILY_CAP_SETTING = 'ai_project_creation_daily_cap'
export const PROJECT_CREATION_AI_USER_COOLDOWN_SETTING = 'ai_project_creation_user_cooldown_minutes'

interface CredentialMetadata {
  provider: string
  label: string | null
  lastFour: string
  lastVerifiedAt: Date | null
}

interface OrganizationAiSettings {
  aiProjectCreationModel: string | null
  aiProjectCreationEnabled: boolean
}

interface SystemSettingValue {
  key: string
  value: string
}

interface AiSettingsReader {
  aiProviderCredential: {
    findUnique(args: unknown): Promise<CredentialMetadata | null>
  }
  organizationSettings: {
    findUnique(args: unknown): Promise<OrganizationAiSettings | null>
  }
  systemSettings: {
    findMany(args: unknown): Promise<SystemSettingValue[]>
  }
}

interface AiSettingsTransaction extends AiSettingsReader {
  aiProviderCredential: AiSettingsReader['aiProviderCredential'] & {
    upsert(args: unknown): Promise<CredentialMetadata>
    update(args: unknown): Promise<CredentialMetadata>
    delete(args: unknown): Promise<unknown>
  }
  organizationSettings: AiSettingsReader['organizationSettings'] & {
    upsert(args: unknown): Promise<OrganizationAiSettings>
  }
  systemSettings: AiSettingsReader['systemSettings'] & {
    upsert(args: unknown): Promise<SystemSettingValue>
  }
  activityLog: {
    create(args: unknown): Promise<unknown>
  }
}

interface AiSettingsDatabase extends AiSettingsReader {
  $transaction<T>(operation: (tx: AiSettingsTransaction) => Promise<T>): Promise<T>
}

export interface AiProviderAdminSettings {
  provider: typeof PROJECT_CREATION_AI_PROVIDER
  configured: boolean
  available: boolean
  source: 'database' | 'environment' | null
  maskedKey: string | null
  label: string | null
  lastVerifiedAt: Date | null
  environmentFallbackConfigured: boolean
  canRemove: boolean
  featureEnabled: boolean
  model: ProjectCreationAiModel
  modelOptions: readonly ProjectCreationAiModel[]
  dailyGenerationCap: number
  perUserCooldownMinutes: number
}

export interface SaveAiProviderAdminSettingsInput {
  actorId: string
  apiKey?: string
  label?: string | null
  featureEnabled: boolean
  model: ProjectCreationAiModel
  dailyGenerationCap: number
  perUserCooldownMinutes: number
}

function isAllowedModel(value: string | null | undefined): value is ProjectCreationAiModel {
  return PROJECT_CREATION_AI_MODEL_ALLOWLIST.includes(value as ProjectCreationAiModel)
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

export function maskAiProviderKey(lastFour: string): string {
  return `sk-…${lastFour.slice(-4)}`
}

export async function getAiProviderAdminSettings(
  database: AiSettingsReader = prisma as unknown as AiSettingsReader,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AiProviderAdminSettings> {
  const [credential, organization, systemSettings] = await Promise.all([
    database.aiProviderCredential.findUnique({
      where: { provider: PROJECT_CREATION_AI_PROVIDER },
      select: { provider: true, label: true, lastFour: true, lastVerifiedAt: true },
    }),
    database.organizationSettings.findUnique({
      where: { id: 'singleton' },
      select: { aiProjectCreationModel: true, aiProjectCreationEnabled: true },
    }),
    database.systemSettings.findMany({
      where: {
        key: {
          in: [PROJECT_CREATION_AI_DAILY_CAP_SETTING, PROJECT_CREATION_AI_USER_COOLDOWN_SETTING],
        },
      },
      select: { key: true, value: true },
    }),
  ])

  const settingMap = new Map(systemSettings.map((setting) => [setting.key, setting.value]))
  const environmentKey = env.OPENAI_API_KEY?.trim()
  const source = credential ? 'database' : environmentKey ? 'environment' : null
  const lastFour = credential?.lastFour ?? environmentKey?.slice(-4) ?? null

  return {
    provider: PROJECT_CREATION_AI_PROVIDER,
    configured: source !== null,
    available: source === 'environment' || Boolean(credential?.lastVerifiedAt),
    source,
    maskedKey: lastFour ? maskAiProviderKey(lastFour) : null,
    label: credential?.label ?? (environmentKey ? 'Environment variable' : null),
    lastVerifiedAt: credential?.lastVerifiedAt ?? null,
    environmentFallbackConfigured: Boolean(environmentKey),
    canRemove: Boolean(credential),
    featureEnabled: organization?.aiProjectCreationEnabled === true,
    model: isAllowedModel(organization?.aiProjectCreationModel)
      ? organization.aiProjectCreationModel
      : PROJECT_CREATION_AI_DEFAULT_MODEL,
    modelOptions: PROJECT_CREATION_AI_MODEL_ALLOWLIST,
    dailyGenerationCap: parseBoundedInteger(
      settingMap.get(PROJECT_CREATION_AI_DAILY_CAP_SETTING),
      PROJECT_CREATION_AI_DEFAULT_DAILY_CAP,
      1,
      1000,
    ),
    perUserCooldownMinutes: parseBoundedInteger(
      settingMap.get(PROJECT_CREATION_AI_USER_COOLDOWN_SETTING),
      PROJECT_CREATION_AI_DEFAULT_USER_COOLDOWN_MINUTES,
      1,
      1440,
    ),
  }
}

export async function saveAiProviderAdminSettings(
  input: SaveAiProviderAdminSettingsInput,
  database: AiSettingsDatabase = prisma as unknown as AiSettingsDatabase,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AiProviderAdminSettings> {
  if (!isAllowedModel(input.model)) throw new Error('Unsupported project creation AI model')
  if (!Number.isInteger(input.dailyGenerationCap) || input.dailyGenerationCap < 1 || input.dailyGenerationCap > 1000) {
    throw new Error('Invalid project creation AI daily cap')
  }
  if (!Number.isInteger(input.perUserCooldownMinutes) || input.perUserCooldownMinutes < 1 || input.perUserCooldownMinutes > 1440) {
    throw new Error('Invalid project creation AI user cooldown')
  }

  const apiKey = input.apiKey?.trim()
  const encryptedKey = apiKey ? encryptAiProviderKey(apiKey) : null
  const nextLastFour = apiKey?.slice(-4) ?? null

  await database.$transaction(async (tx) => {
    const [existingCredential, existingOrganization, existingSystemSettings] = await Promise.all([
      tx.aiProviderCredential.findUnique({
        where: { provider: PROJECT_CREATION_AI_PROVIDER },
        select: { provider: true, label: true, lastFour: true, lastVerifiedAt: true },
      }),
      tx.organizationSettings.findUnique({
        where: { id: 'singleton' },
        select: { aiProjectCreationModel: true, aiProjectCreationEnabled: true },
      }),
      tx.systemSettings.findMany({
        where: {
          key: {
            in: [PROJECT_CREATION_AI_DAILY_CAP_SETTING, PROJECT_CREATION_AI_USER_COOLDOWN_SETTING],
          },
        },
        select: { key: true, value: true },
      }),
    ])
    const currentSettings = new Map(existingSystemSettings.map((setting) => [setting.key, setting.value]))

    if (encryptedKey && nextLastFour) {
      await tx.aiProviderCredential.upsert({
        where: { provider: PROJECT_CREATION_AI_PROVIDER },
        update: {
          encryptedKey,
          lastFour: nextLastFour,
          label: input.label?.trim() || null,
          createdById: input.actorId,
          lastVerifiedAt: null,
        },
        create: {
          provider: PROJECT_CREATION_AI_PROVIDER,
          encryptedKey,
          lastFour: nextLastFour,
          label: input.label?.trim() || null,
          createdById: input.actorId,
        },
        select: { provider: true, label: true, lastFour: true, lastVerifiedAt: true },
      })

      await recordActivity({
        entityType: 'AI_CREDENTIAL',
        action: existingCredential ? 'KEY_ROTATED' : 'CREATED',
        actorId: input.actorId,
        changes: {
          configured: { from: Boolean(existingCredential), to: true },
          lastFour: { from: existingCredential?.lastFour ?? null, to: nextLastFour },
        },
        metadata: {
          provider: PROJECT_CREATION_AI_PROVIDER,
          outcome: 'SUCCESS',
          lastFour: nextLastFour,
        },
      }, { client: tx, required: true })
    } else if (existingCredential && (input.label?.trim() || null) !== existingCredential.label) {
      const nextLabel = input.label?.trim() || null
      await tx.aiProviderCredential.update({
        where: { provider: PROJECT_CREATION_AI_PROVIDER },
        data: { label: nextLabel },
        select: { provider: true, label: true, lastFour: true, lastVerifiedAt: true },
      })
      await recordActivity({
        entityType: 'AI_CREDENTIAL',
        action: 'SETTINGS_UPDATED',
        actorId: input.actorId,
        changes: { label: { from: existingCredential.label, to: nextLabel } },
        metadata: { provider: PROJECT_CREATION_AI_PROVIDER, outcome: 'SUCCESS' },
      }, { client: tx, required: true })
    }

    await tx.organizationSettings.upsert({
      where: { id: 'singleton' },
      update: {
        aiProjectCreationModel: input.model,
        aiProjectCreationEnabled: input.featureEnabled,
      },
      create: {
        id: 'singleton',
        aiProjectCreationModel: input.model,
        aiProjectCreationEnabled: input.featureEnabled,
      },
      select: { aiProjectCreationModel: true, aiProjectCreationEnabled: true },
    })
    await Promise.all([
      tx.systemSettings.upsert({
        where: { key: PROJECT_CREATION_AI_DAILY_CAP_SETTING },
        update: { value: String(input.dailyGenerationCap) },
        create: { key: PROJECT_CREATION_AI_DAILY_CAP_SETTING, value: String(input.dailyGenerationCap) },
        select: { key: true, value: true },
      }),
      tx.systemSettings.upsert({
        where: { key: PROJECT_CREATION_AI_USER_COOLDOWN_SETTING },
        update: { value: String(input.perUserCooldownMinutes) },
        create: { key: PROJECT_CREATION_AI_USER_COOLDOWN_SETTING, value: String(input.perUserCooldownMinutes) },
        select: { key: true, value: true },
      }),
    ])

    const previousModel = isAllowedModel(existingOrganization?.aiProjectCreationModel)
      ? existingOrganization.aiProjectCreationModel
      : PROJECT_CREATION_AI_DEFAULT_MODEL
    const previousFeatureEnabled = existingOrganization?.aiProjectCreationEnabled === true
    const previousDailyCap = parseBoundedInteger(
      currentSettings.get(PROJECT_CREATION_AI_DAILY_CAP_SETTING),
      PROJECT_CREATION_AI_DEFAULT_DAILY_CAP,
      1,
      1000,
    )
    const previousCooldown = parseBoundedInteger(
      currentSettings.get(PROJECT_CREATION_AI_USER_COOLDOWN_SETTING),
      PROJECT_CREATION_AI_DEFAULT_USER_COOLDOWN_MINUTES,
      1,
      1440,
    )
    const settingsChanges = {
      ...(previousFeatureEnabled !== input.featureEnabled
        ? { featureEnabled: { from: previousFeatureEnabled, to: input.featureEnabled } }
        : {}),
      ...(previousModel !== input.model ? { model: { from: previousModel, to: input.model } } : {}),
      ...(previousDailyCap !== input.dailyGenerationCap
        ? { dailyGenerationCap: { from: previousDailyCap, to: input.dailyGenerationCap } }
        : {}),
      ...(previousCooldown !== input.perUserCooldownMinutes
        ? { perUserCooldownMinutes: { from: previousCooldown, to: input.perUserCooldownMinutes } }
        : {}),
    }
    if (Object.keys(settingsChanges).length > 0) {
      await recordActivity({
        entityType: 'AI_CREDENTIAL',
        action: 'SETTINGS_UPDATED',
        actorId: input.actorId,
        changes: settingsChanges,
        metadata: { provider: PROJECT_CREATION_AI_PROVIDER, outcome: 'SUCCESS' },
      }, { client: tx, required: true })
    }
  })

  return getAiProviderAdminSettings(database, env)
}

export async function removeAiProviderCredential(
  actorId: string,
  database: AiSettingsDatabase = prisma as unknown as AiSettingsDatabase,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ changed: boolean; settings: AiProviderAdminSettings }> {
  const changed = await database.$transaction(async (tx) => {
    const existing = await tx.aiProviderCredential.findUnique({
      where: { provider: PROJECT_CREATION_AI_PROVIDER },
      select: { provider: true, label: true, lastFour: true, lastVerifiedAt: true },
    })
    if (!existing) return false

    await tx.aiProviderCredential.delete({ where: { provider: PROJECT_CREATION_AI_PROVIDER } })
    await recordActivity({
      entityType: 'AI_CREDENTIAL',
      action: 'DELETED',
      actorId,
      changes: { configured: { from: true, to: false } },
      metadata: {
        provider: PROJECT_CREATION_AI_PROVIDER,
        outcome: 'SUCCESS',
        lastFour: existing.lastFour,
      },
    }, { client: tx, required: true })
    return true
  })

  return { changed, settings: await getAiProviderAdminSettings(database, env) }
}
