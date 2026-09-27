import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { applyAiGuidedRevision, previewAiGuidedRevision } from '@/lib/projects/ai-guided-service'

interface RouteParams { id: string }

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('PREVIEW'),
    version: z.number().int().min(1),
    instruction: z.string().max(2_000),
    providerNoticeAccepted: z.literal(true),
  }).strict(),
  z.object({
    mode: z.literal('APPLY'),
    version: z.number().int().min(1),
    previewToken: z.string().min(10).max(200_000),
    acceptConflicts: z.boolean().default(false),
  }).strict(),
])

/**
 * Story 3.7 — PREVIEW calls OpenAI and returns the affected count + diff without
 * writing; APPLY re-derives exactly that preview from its signed token.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Invalid revision request', parsed.error.flatten())
    if (parsed.data.mode === 'PREVIEW') {
      const preview = await previewAiGuidedRevision({
        draftId: params.id,
        actorUserId: session.user.id,
        version: parsed.data.version,
        instruction: parsed.data.instruction,
        providerNoticeAccepted: parsed.data.providerNoticeAccepted,
        signal: request.signal,
      })
      return apiSuccess({ preview })
    }
    const result = await applyAiGuidedRevision({
      draftId: params.id,
      actorUserId: session.user.id,
      version: parsed.data.version,
      previewToken: parsed.data.previewToken,
      acceptConflicts: parsed.data.acceptConflicts,
    })
    return apiSuccess({
      draft: toProjectCreationDraftResponse(result.draft),
      revisionId: result.revisionId,
      affectedCount: result.affectedCount,
      conflictsOverridden: result.conflictsOverridden,
    })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
