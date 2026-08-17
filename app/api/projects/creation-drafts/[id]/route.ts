import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  apiConflict,
  apiNotFound,
  apiSuccess,
  apiValidationError,
  withAuth,
} from '@/lib/api'
import {
  PROJECT_CREATION_SOURCE_METHODS,
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
  deleteProjectCreationDraft,
  getProjectCreationDraft,
  isProjectCreationDraftJsonWithinLimit,
  toProjectCreationDraftResponse,
  updateProjectCreationDraft,
} from '@/lib/projects/creation-draft'
import {
  projectCreationProjectJsonSchema,
  projectCreationScheduleJsonSchema,
  projectCreationValidationJsonSchema,
} from '@/lib/projects/creation-normalize'
import { deleteSecureProjectCreationUpload } from '@/lib/projects/creation-upload-security'

interface RouteParams {
  id: string
}

const bounded = <T extends z.ZodTypeAny>(schema: T) => schema.refine(
  (value) => isProjectCreationDraftJsonWithinLimit(value as Record<string, unknown>),
  'Draft JSON field exceeds 1 MB',
)
const updateDraftSchema = z.object({
  version: z.number().int().min(1),
  sourceMethod: z.enum(PROJECT_CREATION_SOURCE_METHODS).optional(),
  discardMethodData: z.literal(true).optional(),
  projectJson: bounded(projectCreationProjectJsonSchema).optional(),
  scheduleJson: bounded(projectCreationScheduleJsonSchema).optional(),
  validationJson: bounded(projectCreationValidationJsonSchema).optional(),
}).strict().superRefine((value, context) => {
  if (value.sourceMethod === undefined
    && value.projectJson === undefined
    && value.scheduleJson === undefined
    && value.validationJson === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one draft field is required' })
  }
  if (value.sourceMethod !== undefined && value.discardMethodData !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Changing creation method requires explicit method-data discard confirmation',
      path: ['discardMethodData'],
    })
  }
  if (value.sourceMethod !== undefined
    && (value.scheduleJson !== undefined || value.validationJson !== undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Method-specific data cannot be supplied while switching creation method',
      path: ['sourceMethod'],
    })
  }
})

const deleteDraftSchema = z.object({
  version: z.coerce.number().int().min(1),
})

function draftErrorResponse(error: unknown) {
  if (error instanceof ProjectCreationDraftNotFoundError) {
    return apiNotFound('Project creation draft not found')
  }
  if (error instanceof ProjectCreationDraftVersionConflictError) {
    return apiConflict(error.message, {
      reasonCode: error.code,
      expectedVersion: error.expectedVersion,
      currentVersion: error.currentVersion,
      actions: error.actions,
    })
  }
  if (error instanceof ProjectCreationDraftStateError) {
    return apiConflict(error.message, { reasonCode: error.code, status: error.status })
  }
  throw error
}

export const GET = withAuth<RouteParams>(async (_request, { session, params }) => {
  try {
    const draft = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    return apiSuccess(toProjectCreationDraftResponse(draft))
  } catch (error) {
    return draftErrorResponse(error)
  }
})

export const PATCH = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const parsed = updateDraftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiValidationError('Invalid project creation draft update', parsed.error.flatten())
  }

  try {
    const previous = parsed.data.sourceMethod === undefined
      ? null
      : await getProjectCreationDraft({
        id: params.id,
        actorUserId: session.user.id,
        actorRole: session.user.role,
      })
    const draft = await updateProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsed.data.version,
      sourceMethod: parsed.data.sourceMethod,
      discardMethodData: parsed.data.discardMethodData,
      projectJson: parsed.data.projectJson,
      scheduleJson: parsed.data.scheduleJson,
      validationJson: parsed.data.validationJson,
    })
    if (previous?.sourceRef && previous.sourceMethod !== draft.sourceMethod) {
      await deleteSecureProjectCreationUpload(previous.sourceRef).catch(() => undefined)
    }
    return apiSuccess(toProjectCreationDraftResponse(draft))
  } catch (error) {
    return draftErrorResponse(error)
  }
})

export const DELETE = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const parsed = deleteDraftSchema.safeParse({
    version: new URL(request.url).searchParams.get('version') ?? undefined,
  })
  if (!parsed.success) {
    return apiValidationError('A current draft version is required', parsed.error.flatten())
  }

  try {
    const previous = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    const result = await deleteProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsed.data.version,
    })
    if (previous.sourceRef) {
      await deleteSecureProjectCreationUpload(previous.sourceRef).catch(() => undefined)
    }
    return apiSuccess(result)
  } catch (error) {
    return draftErrorResponse(error)
  }
})
