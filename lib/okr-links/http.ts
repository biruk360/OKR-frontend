/**
 * Maps `OkrLinkError` onto the standard response envelope for the okr-links routes.
 * Validation failures answer 422 (VALIDATION_ERROR) like the other zod-validated
 * routes; lock → 423 OKR_LOCKED; duplicates / reverse links → 409.
 */
import type { NextResponse } from 'next/server'
import { apiConflict, apiError, apiForbidden, apiLocked, apiNotFound, apiValidationError } from '@/lib/api'
import { OkrLinkError } from './service'

export function okrLinkErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof OkrLinkError)) return null
  switch (error.status) {
    case 400:
      return apiValidationError(error.message, { code: error.code })
    case 403:
      return apiForbidden(error.message)
    case 404:
      return apiNotFound(error.message)
    case 409:
      return apiConflict(error.message, { code: error.code })
    case 423:
      return apiLocked(error.message)
    default:
      return apiError(error.message, { status: error.status, code: error.code })
  }
}
