import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { listScrumUpdates, saveScrumUpdate } from '@/features/scrum/services/scrum-updates'
import { canProxyFor } from '@/features/scrum/services/access'
import { scrumUpdateInputSchema } from '@/features/scrum/services/schemas'
import { getScrumPrefill } from '@/features/scrum/services/prefill'
import { getOwnScrumDraft } from '@/features/scrum/services/scrum-updates'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  if (url.searchParams.get('prefill') === '1') {
    const userId = url.searchParams.get('userId') || session.user.id
    // Prefill exposes the subject's previous plan/blockers — only for self or someone allowed to proxy for them.
    if (userId !== session.user.id && !await canProxyFor(session, userId)) {
      return apiForbidden('You cannot view this user\'s scrum prefill')
    }
    const date = url.searchParams.get('date')
    const prefill = await getScrumPrefill(userId, date ? new Date(`${date}T00:00:00.000Z`) : new Date())
    // A stored draft is private working state: only returned to its owner.
    const serverDraft = userId === session.user.id ? await getOwnScrumDraft(userId, prefill.scrumDate) : null
    return apiSuccess({ ...prefill, serverDraft })
  }
  return apiSuccess(await listScrumUpdates(session, url.searchParams))
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = scrumUpdateInputSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid scrum update', parsed.error.flatten())
  const result = await saveScrumUpdate(session, parsed.data)
  if ('notFound' in result && result.notFound) return apiNotFound('Scrum update not found')
  if ('forbidden' in result && result.forbidden) return result.forbidden
  if ('conflict' in result && result.conflict) return result.conflict
  if ('error' in result && result.error) return apiBadRequest(result.error)
  const isDraft = 'draft' in result && result.draft
  return apiSuccess(result.update, { status: isDraft ? 200 : 201, message: isDraft ? 'Draft saved' : 'Scrum update saved' })
})
