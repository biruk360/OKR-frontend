import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { discardScrumDraft, getScrumUpdateForViewer, saveScrumUpdate } from '@/features/scrum/services/scrum-updates'
import { scrumUpdatePatchSchema } from '@/features/scrum/services/schemas'
import { purgeCommentAttachmentsAfterParentDelete } from '@/lib/attachments/parent-delete'

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
  if ('notFound' in result && result.notFound) return apiNotFound('Scrum update not found')
  if ('forbidden' in result && result.forbidden) return result.forbidden
  if ('error' in result && result.error) return apiValidationError(result.error)
  const isDraft = 'draft' in result && result.draft
  return apiSuccess(result.update, { message: isDraft ? 'Draft saved' : 'Scrum update updated' })
})

/** Discard the caller's own draft. Submitted updates cannot be deleted. */
export const DELETE = withAuth<{ id: string }>(async (_request, { session, params }) => {
  const result = await discardScrumDraft(session, params.id)
  if ('notFound' in result) return apiNotFound('Scrum draft not found')
  if ('error' in result && result.error) return apiBadRequest(result.error)
  // A draft has no thread, but any SCRUM attachment row keyed to this update
  // would otherwise outlive it. Only after the delete succeeded; never fails it.
  if ('deleted' in result && result.deleted) await purgeCommentAttachmentsAfterParentDelete('SCRUM', params.id)
  return apiSuccess({ id: params.id }, { message: 'Draft discarded' })
})
