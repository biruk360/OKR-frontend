import { NextResponse } from 'next/server'

/**
 * Standard API response envelope shared by every endpoint in this project.
 *
 * - Success: `{ success: true, data: T, message?, pagination? }`
 * - Error:   `{ success: false, error: string, code?, details? }`
 *
 * See docs/CONVENTIONS.md "API Routes" for the policy.
 */

export interface SuccessEnvelope<T> {
  success: true
  data: T
  message?: string
}

export interface PaginatedEnvelope<T> extends SuccessEnvelope<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ErrorEnvelope {
  success: false
  error: string
  /** Machine-readable error code (e.g. `UNAUTHORIZED`, `NOT_FOUND`). */
  code?: string
  /** Optional extra info for debugging (validation details, stack in dev, etc.). */
  details?: unknown
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages?: number
}

/** Success response: `{ success: true, data }` (HTTP 200 by default). */
export function apiSuccess<T>(data: T, opts?: { status?: number; message?: string }): NextResponse<SuccessEnvelope<T>> {
  const body: SuccessEnvelope<T> = { success: true, data }
  if (opts?.message) body.message = opts.message
  return NextResponse.json(body, { status: opts?.status ?? 200 })
}

/** Paginated response: `{ success: true, data, pagination }`. */
export function apiPaginated<T>(
  data: T[],
  pagination: PaginationMeta,
  opts?: { status?: number; message?: string }
): NextResponse<PaginatedEnvelope<T>> {
  const totalPages = pagination.totalPages ?? Math.ceil(pagination.total / Math.max(pagination.limit, 1))
  const body: PaginatedEnvelope<T> = {
    success: true,
    data,
    pagination: { ...pagination, totalPages },
  }
  if (opts?.message) body.message = opts.message
  return NextResponse.json(body, { status: opts?.status ?? 200 })
}

/** Error response with standard envelope. */
export function apiError(
  error: string,
  opts?: { status?: number; code?: string; details?: unknown }
): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = { success: false, error }
  if (opts?.code) body.code = opts.code
  if (opts?.details !== undefined) body.details = opts.details
  return NextResponse.json(body, { status: opts?.status ?? 500 })
}

/** 401 Unauthorized with envelope. */
export function apiUnauthorized(message = 'Unauthorized') {
  return apiError(message, { status: 401, code: 'UNAUTHORIZED' })
}

/** 403 Forbidden with envelope. */
export function apiForbidden(message = 'Forbidden') {
  return apiError(message, { status: 403, code: 'FORBIDDEN' })
}

/** 404 Not Found with envelope. */
export function apiNotFound(message = 'Not found') {
  return apiError(message, { status: 404, code: 'NOT_FOUND' })
}

/** 400 Bad Request with envelope. */
export function apiBadRequest(message: string, details?: unknown) {
  return apiError(message, { status: 400, code: 'BAD_REQUEST', details })
}

/** 422 Unprocessable Entity — validation errors. */
export function apiValidationError(message: string, details?: unknown) {
  return apiError(message, { status: 422, code: 'VALIDATION_ERROR', details })
}

/** 409 Conflict — e.g. unique-constraint violations. */
export function apiConflict(message: string, details?: unknown) {
  return apiError(message, { status: 409, code: 'CONFLICT', details })
}

/** 423 Locked — the entity is closed/frozen and cannot be mutated until reopened. */
export function apiLocked(message: string, details?: unknown) {
  return apiError(message, { status: 423, code: 'OKR_LOCKED', details })
}
