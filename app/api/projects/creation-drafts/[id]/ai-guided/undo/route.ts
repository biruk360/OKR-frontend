import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { undoAiGuidedRevisionForDraft } from '@/lib/projects/ai-guided-service'

interface RouteParams { id: string }

const bodySchema = z.object({
  version: z.number().int().min(1),
  revisionId: z.string().trim().min(1).max(100),
  acceptConflicts: z.boolean().default(false),
}).strict()

/** Story 3.7 — undo one applied AI revision (no AI call). */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Invalid undo request', parsed.error.flatten())
    const result = await undoAiGuidedRevisionForDraft({
      draftId: params.id,
      actorUserId: session.user.id,
      version: parsed.data.version,
      revisionId: parsed.data.revisionId,
      acceptConflicts: parsed.data.acceptConflicts,
    })
    return apiSuccess({ draft: toProjectCreationDraftResponse(result.draft), restored: result.restored })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
