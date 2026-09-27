import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { aiGuidedAnswersSchema, answerAiGuidedQuestions } from '@/lib/projects/ai-guided-service'

interface RouteParams { id: string }

const bodySchema = aiGuidedAnswersSchema.extend({ version: z.number().int().min(1) }).strict()

/** Story 3.3 — record answers or continue with the listed assumptions (no AI call). */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Invalid clarification answers', parsed.error.flatten())
    const draft = await answerAiGuidedQuestions({
      draftId: params.id,
      actorUserId: session.user.id,
      version: parsed.data.version,
      answers: parsed.data.answers,
      continueWithAssumptions: parsed.data.continueWithAssumptions,
    })
    return apiSuccess({ draft: toProjectCreationDraftResponse(draft) })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
