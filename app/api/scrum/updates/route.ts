import { NextRequest } from 'next/server'
import { apiBadRequest, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { listScrumUpdates, saveScrumUpdate } from '@/features/scrum/services/scrum-updates'
import { scrumUpdateInputSchema } from '@/features/scrum/services/schemas'
import { getScrumPrefill } from '@/features/scrum/services/prefill'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  if (url.searchParams.get('prefill') === '1') {
    const userId = url.searchParams.get('userId') || session.user.id
    const date = url.searchParams.get('date')
    return apiSuccess(await getScrumPrefill(userId, date ? new Date(`${date}T00:00:00.000Z`) : new Date()))
  }
  return apiSuccess(await listScrumUpdates(session, url.searchParams))
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = scrumUpdateInputSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid scrum update', parsed.error.flatten())
  const result = await saveScrumUpdate(session, parsed.data)
  if ('forbidden' in result && result.forbidden) return result.forbidden
  if ('error' in result && result.error) return apiBadRequest(result.error)
  return apiSuccess(result.update, { status: 201, message: 'Scrum update saved' })
})
