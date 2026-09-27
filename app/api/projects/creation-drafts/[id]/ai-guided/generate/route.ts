import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { generateAiGuidedDraft } from '@/lib/projects/ai-guided-service'

interface RouteParams { id: string }

const bodySchema = z.object({
  version: z.number().int().min(1),
  providerNoticeAccepted: z.literal(true),
  replaceExisting: z.boolean().default(false),
}).strict()

/**
 * Story 3.4–3.6 — generate an editable, schema-validated schedule proposal into
 * the private draft. Never commits, notifies, or publishes anything.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Confirm the external AI provider notice and current draft version', parsed.error.flatten())
    const result = await generateAiGuidedDraft({
      draftId: params.id,
      actorUserId: session.user.id,
      version: parsed.data.version,
      providerNoticeAccepted: parsed.data.providerNoticeAccepted,
      replaceExisting: parsed.data.replaceExisting,
      signal: request.signal,
    })
    return apiSuccess({ draft: toProjectCreationDraftResponse(result.draft), summary: result.summary })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
