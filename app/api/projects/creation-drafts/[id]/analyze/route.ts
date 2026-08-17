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
  SCHEDULE_IMPORT_HEADERS,
} from '@/lib/projects/schedule-import'
import {
  hashProjectCreationImport,
  inspectProjectCreationSpreadsheet,
  resolveProjectCreationImportLimits,
  toPublicProjectCreationSpreadsheetInspection,
  validateProjectCreationSpreadsheet,
  validateProjectCreationSpreadsheetFile,
} from '@/lib/projects/creation-import'
import {
  deleteSecureProjectCreationUpload,
  secureProjectCreationUpload,
  type SecureProjectCreationUploadResult,
} from '@/lib/projects/creation-upload-security'

interface RouteParams {
  id: string
}

const mappingSchema = z.array(z.object({
  target: z.enum(SCHEDULE_IMPORT_HEADERS),
  sourceColumnKey: z.string().trim().min(1).max(50).nullable(),
}).strict()).min(1).max(SCHEDULE_IMPORT_HEADERS.length)

const analyzeFieldsSchema = z.object({
  version: z.coerce.number().int().min(1),
  sheetName: z.string().trim().min(1).max(100),
  mapping: z.string().min(2).max(20_000).transform((value, context) => {
    let json: unknown
    try {
      json = JSON.parse(value)
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Column mapping must be valid JSON' })
      return z.NEVER
    }
    const parsed = mappingSchema.safeParse(json)
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Column mapping is invalid' })
      return z.NEVER
    }
    return parsed.data
  }),
}).strict()

export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }

  const form = await request.formData().catch(() => null)
  if (!form) return apiBadRequest('The spreadsheet analysis request could not be read.')
  const parsedFields = analyzeFieldsSchema.safeParse({
    version: form.get('version'),
    sheetName: form.get('sheetName'),
    mapping: form.get('mapping'),
  })
  if (!parsedFields.success) {
    return apiValidationError('Invalid spreadsheet analysis request', parsedFields.error.flatten())
  }
  const file = form.get('file')
  if (!(file instanceof File)) return apiBadRequest('Choose the spreadsheet again to approve its mapping.')

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
    const validatedFile = validateProjectCreationSpreadsheetFile({
      name: file.name,
      type: file.type,
      size: file.size,
      maxFileBytes: limits.maxFileBytes,
    })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sourceHash = hashProjectCreationImport(bytes)
    if (draft.sourceHash && draft.sourceHash !== sourceHash) {
      return apiConflict('The selected file changed after its columns were inspected. Upload it again.', {
        reasonCode: 'SOURCE_FILE_CHANGED',
      })
    }
    retainedUpload = await secureProjectCreationUpload({
      draftId: draft.id,
      extension: validatedFile.extension,
      bytes,
    })
    const inspection = inspectProjectCreationSpreadsheet(bytes, { sheetName: parsedFields.data.sheetName })
    const validated = await validateProjectCreationSpreadsheet(
      inspection,
      parsedFields.data.mapping,
      { maxRows: limits.maxRows },
    )
    const updated = await updateProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsedFields.data.version,
      scheduleJson: validated.scheduleJson,
      validationJson: validated.validationJson,
      sourceMetadata: {
        fileName: validatedFile.safeFileName,
        mimeType: retainedUpload.detectedMimeType,
        size: file.size,
        hash: retainedUpload.hash,
        sourceRef: retainedUpload.sourceRef,
        scanStatus: retainedUpload.scanStatus,
        outcome: validated.hasBlockingErrors ? 'VALIDATION_FAILED' : 'PARSED',
        mappingMode: 'MANUAL',
      },
    })
    const previousSourceRef = draft.sourceRef
    const committedSourceRef = retainedUpload.sourceRef
    retainedUpload = null
    if (previousSourceRef && previousSourceRef !== committedSourceRef) {
      await deleteSecureProjectCreationUpload(previousSourceRef).catch(() => undefined)
    }
    return apiSuccess({
      stage: validated.hasBlockingErrors ? 'VALIDATION_ERRORS' : 'READY_FOR_REVIEW',
      draft: toProjectCreationDraftResponse(updated),
      inspection: toPublicProjectCreationSpreadsheetInspection(inspection),
      summary: validated.summary,
      aiUsed: false,
      mappingAccepted: true,
      commitBlocked: validated.hasBlockingErrors,
    })
  } catch (error) {
    if (retainedUpload) {
      await deleteSecureProjectCreationUpload(retainedUpload.sourceRef).catch(() => undefined)
    }
    return projectCreationImportErrorResponse(error)
  }
})
