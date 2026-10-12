/**
 * KPI service error — carries the HTTP status the route should answer with.
 */
export type KpiErrorStatus = 400 | 403 | 404 | 409 | 422

export class KpiError extends Error {
  readonly status: KpiErrorStatus
  readonly code: string

  constructor(status: KpiErrorStatus, message: string, code?: string) {
    super(message)
    this.name = 'KpiError'
    this.status = status
    this.code =
      code ??
      ({ 400: 'BAD_REQUEST', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_ERROR' } as const)[status]
  }
}

export function isKpiError(error: unknown): error is KpiError {
  return error instanceof KpiError
}
