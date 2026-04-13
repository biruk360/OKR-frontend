import { apiError } from './apiResponse'

/**
 * Standard error handler for API route try/catch blocks.
 *
 * @example
 * try {
 *   ...
 * } catch (err) {
 *   return handleApiError(err, 'GET /api/objectives')
 * }
 */
export function handleApiError(error: unknown, context?: string) {
  const message = error instanceof Error ? error.message : String(error)
  const prefix = context ? `[api:${context}]` : '[api]'
  console.error(`${prefix} Unhandled error:`, error)

  // Prisma known errors have a `code` property (P2002, P2025, etc.)
  const anyErr = error as { code?: string; meta?: unknown }
  if (anyErr?.code === 'P2002') {
    return apiError('A record with these unique fields already exists.', {
      status: 409,
      code: 'CONFLICT',
      details: process.env.NODE_ENV !== 'production' ? anyErr.meta : undefined,
    })
  }
  if (anyErr?.code === 'P2025') {
    return apiError('The requested record was not found.', {
      status: 404,
      code: 'NOT_FOUND',
    })
  }

  return apiError('Internal server error', {
    status: 500,
    code: 'INTERNAL_ERROR',
    details: process.env.NODE_ENV !== 'production' ? { message } : undefined,
  })
}
