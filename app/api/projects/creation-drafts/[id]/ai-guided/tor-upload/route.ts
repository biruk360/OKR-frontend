import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { canCreateProject } from '@/lib/permissions'
import { toProjectCreationDraftResponse } from '@/lib/projects/creation-draft'
import { aiGuidedErrorResponse } from '@/lib/projects/ai-guided-api'
import { uploadAiGuidedTor } from '@/lib/projects/ai-guided-tor-upload'

interface RouteParams { id: string }

const fieldsSchema = z.object({ version: z.coerce.number().int().min(1) }).strict()

/**
 * Upload a DOCX TOR in AI mode: same validation → malware scan (fail closed) →
 * private storage → bounded DOCX extraction as file import. Returns the extracted
 * text for the editable TOR field. No AI call; no document content is logged.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  try {
    await requireProjectCreationAiEnabled()
    const form = await request.formData().catch(() => null)
    if (!form) return apiBadRequest('The TOR upload could not be read.')
    const fields = fieldsSchema.safeParse({ version: form.get('version') })
    if (!fields.success) return apiValidationError('Invalid TOR upload', fields.error.flatten())
    const file = form.get('file')
    if (!(file instanceof File)) return apiBadRequest('Choose a Word (.docx) TOR document.')
    const result = await uploadAiGuidedTor({
      draftId: params.id,
      actorUserId: session.user.id,
      version: fields.data.version,
      file: { name: file.name, type: file.type, size: file.size, readBytes: async () => new Uint8Array(await file.arrayBuffer()) },
    })
    return apiSuccess({
      draft: toProjectCreationDraftResponse(result.draft),
      torText: result.torText,
      truncated: result.truncated,
      extractedCharacters: result.extractedCharacters,
    })
  } catch (error) {
    return aiGuidedErrorResponse(error)
  }
})
