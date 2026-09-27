import { apiError } from '@/lib/api'
import { ProjectCreationAiDisabledError, requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { projectCreationImportErrorResponse } from './creation-import-api'
import { AiGuidedPreviewTokenError } from './ai-guided-revise'
import { AI_GUIDED_SOURCE_METHODS, AiGuidedError } from './ai-guided-service'

/**
 * Maps AI-guided creation failures to the standard envelope. The disabled flag
 * is a distinct 404 refusal (AC36); provider/budget failures never expose
 * prompts, provider messages, keys, or stack traces (§15).
 */
export function aiGuidedErrorResponse(error: unknown) {
  if (error instanceof ProjectCreationAiDisabledError) {
    return apiError(error.message, { status: 404, code: 'PROJECT_CREATION_AI_DISABLED' })
  }
  if (error instanceof AiGuidedError) {
    return apiError(error.message, { status: error.status, code: error.code, details: error.details })
  }
  if (error instanceof AiGuidedPreviewTokenError) {
    return apiError(error.message, { status: 409, code: 'AI_REVISION_PREVIEW_INVALID' })
  }
  return projectCreationImportErrorResponse(error)
}

export function isAiCreationSourceMethod(sourceMethod: string | undefined | null): boolean {
  return sourceMethod != null && (AI_GUIDED_SOURCE_METHODS as readonly string[]).includes(sourceMethod)
}

/**
 * AC36: a draft may only enter an AI creation method while the independent
 * project-creation AI flag is on. Returns the same 404
 * `PROJECT_CREATION_AI_DISABLED` refusal the AI endpoints use, or `null` when
 * the method is not AI or the flag is enabled. Checked before any draft write.
 */
export async function refuseAiSourceMethodWhenDisabled(
  sourceMethod: string | undefined | null,
  requireEnabled: () => Promise<void> = () => requireProjectCreationAiEnabled(),
) {
  if (!isAiCreationSourceMethod(sourceMethod)) return null
  try {
    await requireEnabled()
    return null
  } catch (error) {
    if (error instanceof ProjectCreationAiDisabledError) return aiGuidedErrorResponse(error)
    throw error
  }
}
