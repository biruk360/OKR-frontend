import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiConflict, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import { runAfterResponse } from '@/lib/background'
import {
  ProjectCreationDraftNotFoundError,
  getProjectCreationDraft,
  toProjectCreationDraftResponse,
} from '@/lib/projects/creation-draft'
import { projectCreationImportErrorResponse } from '@/lib/projects/creation-import-api'
import {
  resolveProjectCreationImportLimits,
  validateProjectCreationImportFile,
} from '@/lib/projects/creation-import'
import {
  deleteSecureProjectCreationUpload,
  secureProjectCreationUpload,
  type SecureProjectCreationUploadResult,
} from '@/lib/projects/creation-upload-security'
import {
  beginProjectCreationProcessing,
  buildProjectCreationImportStatusView,
  readProjectCreationProcessingState,
  runProjectCreationUploadProcessing,
} from '@/lib/projects/creation-processing'

interface RouteParams {
  id: string
}

const uploadFieldsSchema = z.object({
  version: z.coerce.number().int().min(1),
  sheetName: z.string().trim().min(1).max(100).optional(),
}).strict()

/**
 * Story 2.7: the request only validates, malware-scans, and privately stores the file,
 * then marks the draft PROCESSING. Parsing/validation (spreadsheets) and extraction
 * (DOCX) run after the response; the client polls GET for the status view.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }

  const form = await request.formData().catch(() => null)
  if (!form) return apiBadRequest('The project file upload could not be read.')
  const parsedFields = uploadFieldsSchema.safeParse({
    version: form.get('version'),
    sheetName: form.get('sheetName') || undefined,
  })
  if (!parsedFields.success) {
    return apiValidationError('Invalid project file upload', parsedFields.error.flatten())
  }
  const file = form.get('file')
  if (!(file instanceof File)) return apiBadRequest('Choose a CSV, XLS, XLSX, or DOCX project file.')

  let retainedUpload: SecureProjectCreationUploadResult | null = null
  try {
    const draft = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    if (draft.ownerUserId !== session.user.id) throw new ProjectCreationDraftNotFoundError()
    if (draft.sourceMethod !== 'FILE_IMPORT') {
      return apiConflict('This draft is not using file import.', { reasonCode: 'INVALID_SOURCE_METHOD' })
    }

    const limits = resolveProjectCreationImportLimits()
    const validatedFile = validateProjectCreationImportFile({
      name: file.name,
      type: file.type,
      size: file.size,
      maxFileBytes: limits.maxFileBytes,
    })
    const bytes = new Uint8Array(await file.arrayBuffer())
    // Scan-before-processing: nothing is parsed or extracted until the file is stored clean.
    retainedUpload = await secureProjectCreationUpload({
      draftId: draft.id,
      extension: validatedFile.extension,
      bytes,
    })
    const { draft: processing } = await beginProjectCreationProcessing({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsedFields.data.version,
      sourceMetadata: {
        fileName: validatedFile.safeFileName,
        mimeType: retainedUpload.detectedMimeType,
        size: file.size,
        hash: retainedUpload.hash,
        sourceRef: retainedUpload.sourceRef,
        scanStatus: retainedUpload.scanStatus,
      },
    })
    const previousSourceRef = draft.sourceRef
    const committedUpload = retainedUpload
    retainedUpload = null
    if (previousSourceRef && previousSourceRef !== committedUpload.sourceRef) {
      await deleteSecureProjectCreationUpload(previousSourceRef).catch(() => undefined)
    }

    runAfterResponse('project-creation-upload-processing', () => runProjectCreationUploadProcessing({
      draftId: processing.id,
      actorUserId: session.user.id,
      jobVersion: processing.version,
      sourceRef: committedUpload.sourceRef,
      sourceHash: committedUpload.hash,
      sheetName: parsedFields.data.sheetName ?? null,
      maxRows: limits.maxRows,
    }))

    return apiSuccess({
      ...buildProjectCreationImportStatusView(processing, null),
      draft: toProjectCreationDraftResponse(processing),
    }, { status: 202 })
  } catch (error) {
    if (retainedUpload) {
      await deleteSecureProjectCreationUpload(retainedUpload.sourceRef).catch(() => undefined)
    }
    return projectCreationImportErrorResponse(error)
  }
})

/** Polling endpoint: current processing stage, inspection/summary, or categorised failure. */
export const GET = withAuth<RouteParams>(async (_request, { session, params }) => {
  try {
    const draft = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    if (draft.ownerUserId !== session.user.id) throw new ProjectCreationDraftNotFoundError()
    if (draft.sourceMethod !== 'FILE_IMPORT') {
      return apiConflict('This draft is not using file import.', { reasonCode: 'INVALID_SOURCE_METHOD' })
    }
    const state = draft.status === 'PROCESSING' ? null : await readProjectCreationProcessingState(draft.sourceRef)
    return apiSuccess({
      ...buildProjectCreationImportStatusView(draft, state),
      draft: toProjectCreationDraftResponse(draft),
    })
  } catch (error) {
    return projectCreationImportErrorResponse(error)
  }
})
