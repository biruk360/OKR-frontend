import {
  apiConflict,
  apiError,
  apiNotFound,
} from '@/lib/api'
import {
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
} from '@/lib/projects/creation-draft'
import { ProjectCreationImportError } from '@/lib/projects/creation-import'
import { ProjectCreationUploadSecurityError } from '@/lib/projects/creation-upload-security'
import { ProjectCreationDocxExtractionError } from '@/lib/projects/docx-extract'

export function projectCreationImportErrorResponse(error: unknown) {
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
  if (error instanceof ProjectCreationImportError) {
    const status = error.code === 'FILE_TOO_LARGE'
      ? 413
      : error.code === 'PARSE_FAILED' || error.code === 'INVALID_MAPPING'
      ? 422
      : 400
    const code = error.code === 'PARSE_FAILED' || error.code === 'ROW_LIMIT_EXCEEDED'
      ? 'PARSING_ERROR'
      : error.code === 'INVALID_MAPPING'
      ? 'MAPPING_ERROR'
      : 'FILE_ERROR'
    return apiError(error.message, { status, code, details: error.details })
  }
  if (error instanceof ProjectCreationUploadSecurityError) {
    const status = error.code === 'MALWARE_SCAN_UNAVAILABLE' || error.code === 'STORAGE_UNAVAILABLE'
      ? 503
      : error.code === 'MALWARE_DETECTED'
      ? 422
      : 400
    const code = error.code === 'MALWARE_SCAN_UNAVAILABLE'
      ? 'MALWARE_SCAN_UNAVAILABLE'
      : error.code === 'STORAGE_UNAVAILABLE'
      ? 'UPLOAD_STORAGE_UNAVAILABLE'
      : 'UNSAFE_FILE'
    return apiError(error.message, { status, code })
  }
  if (error instanceof ProjectCreationDocxExtractionError) {
    return apiError(error.message, {
      status: error.code === 'DOCX_LIMIT_EXCEEDED' ? 413 : 422,
      code: 'PARSING_ERROR',
    })
  }
  throw error
}
