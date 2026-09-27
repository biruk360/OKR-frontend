import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { saveAiGuidedBrief } from '@/lib/projects/ai-guided-service'

interface RouteParams { id: string }

const bodySchema = z.object({
  version: z.number().int().min(1),
  brief: z.unknown(),
}).strict()

/** Story 3.1/3.2 — save the guided brief or pasted TOR into the private draft (no AI call). */
export const PUT = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Invalid brief request', parsed.error.flatten())
    const draft = await saveAiGuidedBrief({
      draftId: params.id,
      actorUserId: session.user.id,
      version: parsed.data.version,
      brief: parsed.data.brief,
    })
    return apiSuccess({ draft: toProjectCreationDraftResponse(draft) })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
