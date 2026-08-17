import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import {
  PROJECT_CREATION_SOURCE_METHODS,
  createProjectCreationDraft,
  isProjectCreationDraftJsonWithinLimit,
  toProjectCreationDraftResponse,
} from '@/lib/projects/creation-draft'
import {
  createEmptyProjectCreationProjectJson,
  projectCreationProjectJsonSchema,
} from '@/lib/projects/creation-normalize'

const projectJsonSchema = projectCreationProjectJsonSchema.refine(
  isProjectCreationDraftJsonWithinLimit,
  'Draft JSON field exceeds 1 MB',
)

const createDraftSchema = z.object({
  sourceMethod: z.enum(PROJECT_CREATION_SOURCE_METHODS),
  projectJson: projectJsonSchema.optional(),
}).strict()

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }

  const parsed = createDraftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiValidationError('Invalid project creation draft', parsed.error.flatten())
  }

  const draft = await createProjectCreationDraft({
    ownerUserId: session.user.id,
    sourceMethod: parsed.data.sourceMethod,
    projectJson: parsed.data.projectJson
      ?? createEmptyProjectCreationProjectJson(session.user.id),
  })
  return apiSuccess(toProjectCreationDraftResponse(draft), { status: 201 })
})
