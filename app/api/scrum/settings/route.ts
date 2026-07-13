import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getScrumSettings } from '@/features/scrum/services/settings'
import { settingsPatchSchema } from '@/features/scrum/services/schemas'
import { SCRUM_DEFAULT_SETTINGS_ID } from '@/types/scrum'

export const GET = withAuth(async () => apiSuccess(await getScrumSettings()))

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const json = await request.json().catch(() => null)
  const parsed = settingsPatchSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid scrum settings', parsed.error.flatten())
  const settings = await prisma.scrumSettings.upsert({
    where: { id: SCRUM_DEFAULT_SETTINGS_ID },
    create: { id: SCRUM_DEFAULT_SETTINGS_ID, ...parsed.data },
    update: parsed.data,
  })
  return apiSuccess(settings, { message: 'Scrum settings saved' })
})
