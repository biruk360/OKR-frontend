import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiSuccess, apiValidationError, withRole } from '@/lib/api'
import {
  getAiProviderAdminSettings,
  removeAiProviderCredential,
  saveAiProviderAdminSettings,
} from '@/lib/ai/admin-settings'
import { PROJECT_CREATION_AI_MODEL_ALLOWLIST } from '@/lib/ai/config'

const saveSettingsSchema = z.object({
  apiKey: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(12, 'OpenAI key is too short').max(512).startsWith('sk-', 'OpenAI key must start with sk-').optional(),
  ),
  label: z.string().trim().max(100).nullable().optional(),
  featureEnabled: z.boolean(),
  model: z.enum(PROJECT_CREATION_AI_MODEL_ALLOWLIST),
  dailyGenerationCap: z.number().int().min(1).max(1000),
  perUserCooldownMinutes: z.number().int().min(1).max(1440),
})

export const GET = withRole('ADMIN', async () => {
  return apiSuccess(await getAiProviderAdminSettings())
})

export const PUT = withRole('ADMIN', async (request: NextRequest, { session }) => {
  const parsed = saveSettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiValidationError('Invalid AI integration settings', parsed.error.flatten())
  }

  const settings = await saveAiProviderAdminSettings({
    actorId: session.user.id,
    ...parsed.data,
  })
  return apiSuccess(settings, { message: 'AI integration settings saved' })
})

export const DELETE = withRole('ADMIN', async (_request, { session }) => {
  const result = await removeAiProviderCredential(session.user.id)
  return apiSuccess(result.settings, {
    message: result.changed ? 'Stored OpenAI key removed' : 'No stored OpenAI key to remove',
  })
})
