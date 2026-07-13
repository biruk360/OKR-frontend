import { NextRequest } from 'next/server'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getScrumUpdateForViewer, saveScrumUpdate } from '@/features/scrum/services/scrum-updates'
import { scrumUpdatePatchSchema } from '@/features/scrum/services/schemas'

export const GET = withAuth<{ id: string }>(async (_request, { session, params }) => {
  const update = await getScrumUpdateForViewer(session, params.id)
  if (!update) return apiNotFound('Scrum update not found')
  if ((update as any).forbidden) return apiForbidden('Insufficient permissions')
  return apiSuccess(update)
})

export const PATCH = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const json = await request.json().catch(() => null)
  const parsed = scrumUpdatePatchSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid scrum update patch', parsed.error.flatten())
  const result = await saveScrumUpdate(session, parsed.data, params.id)
  if ('forbidden' in result && result.forbidden) return result.forbidden
  if ('error' in result && result.error) return apiValidationError(result.error)
  return apiSuccess(result.update, { message: 'Scrum update updated' })
})
