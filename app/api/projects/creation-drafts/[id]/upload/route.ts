import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiConflict, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import {
  ProjectCreationDraftNotFoundError,
  getProjectCreationDraft,
  toProjectCreationDraftResponse,
  updateProjectCreationDraft,
} from '@/lib/projects/creation-draft'
import { projectCreationImportErrorResponse } from '@/lib/projects/creation-import-api'
import {
  inspectProjectCreationSpreadsheet,
  resolveProjectCreationImportLimits,
  toPublicProjectCreationSpreadsheetInspection,
  validateProjectCreationSpreadsheet,
  validateProjectCreationImportFile,
} from '@/lib/projects/creation-import'
import {
  deleteSecureProjectCreationUpload,
  secureProjectCreationUpload,
  type SecureProjectCreationUploadResult,
} from '@/lib/projects/creation-upload-security'
import {
  extractProjectCreationDocx,
  projectCreationDocxExtractionToSchedule,
  summarizeProjectCreationDocxExtraction,
} from '@/lib/projects/docx-extract'
import { createEmptyProjectCreationValidationJson } from '@/lib/projects/creation-normalize'

interface RouteParams {
  id: string
}

const uploadFieldsSchema = z.object({
  version: z.coerce.number().int().min(1),
  sheetName: z.string().trim().min(1).max(100).optional(),
}).strict()

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
    return apiValidationError('Invalid spreadsheet upload', parsedFields.error.flatten())
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
    retainedUpload = await secureProjectCreationUpload({
      draftId: draft.id,
      extension: validatedFile.extension,
      bytes,
    })
    if (validatedFile.kind === 'DOCX') {
      const extraction = await extractProjectCreationDocx(bytes)
      const updated = await updateProjectCreationDraft({
        id: params.id,
        actorUserId: session.user.id,
        expectedVersion: parsedFields.data.version,
        scheduleJson: projectCreationDocxExtractionToSchedule(extraction),
        validationJson: createEmptyProjectCreationValidationJson(),
        sourceMetadata: {
          fileName: validatedFile.safeFileName,
          mimeType: retainedUpload.detectedMimeType,
          size: file.size,
          hash: retainedUpload.hash,
          sourceRef: retainedUpload.sourceRef,
          scanStatus: retainedUpload.scanStatus,
          outcome: 'DOCX_EXTRACTED',
          mappingMode: 'NONE',
        },
      })
      const previousSourceRef = draft.sourceRef
      const committedSourceRef = retainedUpload.sourceRef
      retainedUpload = null
      if (previousSourceRef && previousSourceRef !== committedSourceRef) {
        await deleteSecureProjectCreationUpload(previousSourceRef).catch(() => undefined)
      }
      return apiSuccess({
        stage: 'DOCX_EXTRACTED',
        draft: toProjectCreationDraftResponse(updated),
        inspection: null,
        documentExtraction: summarizeProjectCreationDocxExtraction(extraction),
        summary: { phases: 0, milestones: 0, activities: 0, dependencies: 0, deliverables: 0 },
        aiUsed: false,
        commitBlocked: false,
      })
    }
    const inspection = inspectProjectCreationSpreadsheet(bytes, {
      sheetName: parsedFields.data.sheetName,
    })

    const validated = !inspection.requiresSheetSelection && !inspection.requiresMapping
      ? await validateProjectCreationSpreadsheet(inspection, undefined, { maxRows: limits.maxRows })
      : null
    const outcome = inspection.requiresSheetSelection
      ? 'SHEET_SELECTION_REQUIRED'
      : inspection.requiresMapping
      ? 'MAPPING_REQUIRED'
      : validated?.hasBlockingErrors
      ? 'VALIDATION_FAILED'
      : 'PARSED'
    const updated = await updateProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsedFields.data.version,
      scheduleJson: validated?.scheduleJson,
      validationJson: validated?.validationJson,
      clearMethodData: validated ? undefined : true,
      sourceMetadata: {
        fileName: validatedFile.safeFileName,
        mimeType: retainedUpload.detectedMimeType,
        size: file.size,
        hash: retainedUpload.hash,
        sourceRef: retainedUpload.sourceRef,
        scanStatus: retainedUpload.scanStatus,
        outcome,
        mappingMode: validated ? 'EXACT' : 'NONE',
      },
    })
    const previousSourceRef = draft.sourceRef
    const committedSourceRef = retainedUpload.sourceRef
    retainedUpload = null
    if (previousSourceRef && previousSourceRef !== committedSourceRef) {
      await deleteSecureProjectCreationUpload(previousSourceRef).catch(() => undefined)
    }

    return apiSuccess({
      stage: inspection.requiresSheetSelection
        ? 'SHEET_SELECTION'
        : inspection.requiresMapping
        ? 'MAPPING'
        : validated?.hasBlockingErrors
        ? 'VALIDATION_ERRORS'
        : 'READY_FOR_REVIEW',
      draft: toProjectCreationDraftResponse(updated),
      inspection: toPublicProjectCreationSpreadsheetInspection(inspection),
      documentExtraction: null,
      summary: validated?.summary ?? null,
      aiUsed: false,
      commitBlocked: validated?.hasBlockingErrors ?? false,
    })
  } catch (error) {
    if (retainedUpload) {
      await deleteSecureProjectCreationUpload(retainedUpload.sourceRef).catch(() => undefined)
    }
    return projectCreationImportErrorResponse(error)
  }
})
