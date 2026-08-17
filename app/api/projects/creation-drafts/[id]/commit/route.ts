import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  apiBadRequest,
  apiConflict,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  apiValidationError,
  withAuth,
} from '@/lib/api'
import {
  commitProjectCreationDraft,
  ProjectCreationCommitAuthorizationError,
  ProjectCreationCommitNotFoundError,
  ProjectCreationCommitStateError,
  ProjectCreationCommitValidationError,
  ProjectCreationCommitVersionError,
} from '@/lib/projects/creation-commit'

const commitSchema = z.object({
  version: z.number().int().positive(),
}).strict()

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const json = await request.json().catch(() => null)
  const parsed = commitSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid commit request', parsed.error.flatten())

  try {
    const result = await commitProjectCreationDraft({
      draftId: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsed.data.version,
    })
    return apiSuccess(result, { status: result.existing ? 200 : 201 })
  } catch (error) {
    if (error instanceof ProjectCreationCommitNotFoundError) return apiNotFound(error.message)
    if (error instanceof ProjectCreationCommitAuthorizationError) {
      return apiForbidden(error.message)
    }
    if (error instanceof ProjectCreationCommitValidationError) {
      return apiValidationError(error.message, {
        reasonCode: error.code,
        blockers: error.blockers,
        validation: error.validation,
      })
    }
    if (error instanceof ProjectCreationCommitVersionError) {
      return apiConflict(error.message, {
        reasonCode: error.code,
        expectedVersion: error.expectedVersion,
        currentVersion: error.currentVersion,
      })
    }
    if (error instanceof ProjectCreationCommitStateError) {
      return apiConflict(error.message, { reasonCode: error.code, status: error.status })
    }
    if ((error as { code?: string })?.code === 'P2002') {
      return apiBadRequest('Project code must be unique. Reload the draft and choose another code.')
    }
    throw error
  }
})
