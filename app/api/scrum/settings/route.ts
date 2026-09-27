import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getScrumSettings } from '@/features/scrum/services/settings'
import { settingsPatchSchema } from '@/features/scrum/services/schemas'
import { canWriteScrumSettings } from '@/features/scrum/services/access'
import { SCRUM_DEFAULT_SETTINGS_ID } from '@/types/scrum'

export const GET = withAuth(async () => apiSuccess(await getScrumSettings()))

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  if (!await canWriteScrumSettings(session)) return apiForbidden('You do not have permission to change scrum settings')
  const json = await request.json().catch(() => null)
  const parsed = settingsPatchSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid scrum settings', parsed.error.flatten())
  const before = await getScrumSettings()
  const settings = await prisma.scrumSettings.upsert({
    where: { id: SCRUM_DEFAULT_SETTINGS_ID },
    create: { id: SCRUM_DEFAULT_SETTINGS_ID, ...parsed.data },
    update: parsed.data,
  })
  const changes: ChangeMap = {}
  for (const [key, to] of Object.entries(parsed.data)) {
    const from = (before as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to }
  }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'SCRUM_SETTINGS',
      action: 'SETTINGS_UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { settingsId: SCRUM_DEFAULT_SETTINGS_ID },
    })
  }
  return apiSuccess(settings, { message: 'Scrum settings saved' })
})
