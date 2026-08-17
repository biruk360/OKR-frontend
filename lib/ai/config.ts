import { prisma } from '@/lib/prisma'

export const AI_FEATURE_KEYS = {
  SPRINT_PLAN: 'SPRINT_PLAN',
  PROJECT_AI_ASSISTANT: 'PROJECT_AI_ASSISTANT',
  PROJECT_CREATION_AI: 'PROJECT_CREATION_AI',
} as const
export type AiFeatureKey = (typeof AI_FEATURE_KEYS)[keyof typeof AI_FEATURE_KEYS]

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]
export const DEFAULT_PROVIDER: AiProviderId = 'anthropic'

/** Per-provider model defaults. Each pair is (planner, summary helper). */
export const AI_MODELS: Record<AiProviderId, { planner: string; summary: string }> = {
  anthropic: {
    planner: process.env.AI_ANTHROPIC_PLANNER_MODEL || 'claude-sonnet-4-6',
    summary: process.env.AI_ANTHROPIC_SUMMARY_MODEL || 'claude-haiku-4-5-20251001',
  },
  openai: {
    // Default to gpt-5.5 (chat). Override to gpt-5.5-pro for reasoning mode (slower, pricier).
    planner: process.env.AI_OPENAI_PLANNER_MODEL || 'gpt-5.5',
    summary: process.env.AI_OPENAI_SUMMARY_MODEL || 'gpt-5.5-mini',
  },
  gemini: {
    planner: process.env.AI_GEMINI_PLANNER_MODEL || 'gemini-2.5-pro',
    summary: process.env.AI_GEMINI_SUMMARY_MODEL || 'gemini-2.5-flash',
  },
}

export const DAILY_GENERATION_CAP = Number(process.env.AI_DAILY_GENERATION_CAP) || 50

/** Project Creation AI is OpenAI-only and may select only from this server list. */
export const PROJECT_CREATION_AI_MODEL_ALLOWLIST = [
  'gpt-5.5',
  'gpt-5.5-pro',
  'gpt-5.5-mini',
] as const
export type ProjectCreationAiModel = (typeof PROJECT_CREATION_AI_MODEL_ALLOWLIST)[number]
export const PROJECT_CREATION_AI_DEFAULT_MODEL: ProjectCreationAiModel = 'gpt-5.5'
export const PROJECT_CREATION_AI_DEFAULT_DAILY_CAP = DAILY_GENERATION_CAP
export const PROJECT_CREATION_AI_DEFAULT_USER_COOLDOWN_MINUTES = 30
export const PROJECT_CREATION_AI_DISABLED_MESSAGE = 'AI-assisted project creation is not enabled for this organization'

interface ProjectCreationAiFlagReader {
  organizationSettings: {
    findUnique(args: unknown): Promise<{ aiProjectCreationEnabled: boolean } | null>
  }
}

export class ProjectCreationAiDisabledError extends Error {
  readonly code = 'PROJECT_CREATION_AI_DISABLED'
  readonly status = 404

  constructor() {
    super(PROJECT_CREATION_AI_DISABLED_MESSAGE)
    this.name = 'ProjectCreationAiDisabledError'
  }
}

/** Independent project-creation flag; never derives from sprint-planning AI. */
export async function isProjectCreationAiEnabled(
  database: ProjectCreationAiFlagReader = prisma as unknown as ProjectCreationAiFlagReader,
): Promise<boolean> {
  const row = await database.organizationSettings.findUnique({
    where: { id: 'singleton' },
    select: { aiProjectCreationEnabled: true },
  })
  return row?.aiProjectCreationEnabled === true
}

/** Reusable first-line guard for every future project-creation AI endpoint. */
export async function requireProjectCreationAiEnabled(
  database: ProjectCreationAiFlagReader = prisma as unknown as ProjectCreationAiFlagReader,
): Promise<void> {
  if (!await isProjectCreationAiEnabled(database)) throw new ProjectCreationAiDisabledError()
}

/**
 * Resolve the org-wide AI Sprint Planning feature flag and preferred provider.
 * Returns false / DEFAULT_PROVIDER when the singleton row is missing rather than
 * throwing — so a fresh install simply hides the feature.
 */
export async function getAiOrgConfig(): Promise<{
  enabled: boolean
  preferredProvider: AiProviderId
}> {
  const row = await prisma.organizationSettings.findUnique({
    where: { id: 'singleton' },
    select: { aiSprintPlanningEnabled: true, aiPreferredProvider: true },
  })
  const preferred = (row?.aiPreferredProvider as AiProviderId) ?? DEFAULT_PROVIDER
  return {
    enabled: row?.aiSprintPlanningEnabled === true,
    preferredProvider: AI_PROVIDERS.includes(preferred) ? preferred : DEFAULT_PROVIDER,
  }
}

/** Backwards-compatible helper used by older call sites. */
export async function isAiSprintPlanningEnabled(): Promise<boolean> {
  return (await getAiOrgConfig()).enabled
}

/** Returns true when the API key for the given provider is present in env. */
export function hasProviderKey(provider: AiProviderId): boolean {
  const envName = providerKeyEnvName(provider)
  return Boolean(process.env[envName]?.trim())
}

export function providerKeyEnvName(provider: AiProviderId): string {
  switch (provider) {
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'gemini':
      return 'GEMINI_API_KEY'
  }
}

/** Returns the list of providers currently usable (key present). */
export function availableProviders(): AiProviderId[] {
  return AI_PROVIDERS.filter(hasProviderKey)
}
