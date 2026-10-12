/**
 * Operating package routes — shared request/response helpers (server-only).
 */
import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { isPackageError } from './errors'

/** Map a PackageError to the standard envelope; rethrow anything else (withAuth → 500). */
export function packageErrorResponse(error: unknown): NextResponse {
  if (isPackageError(error)) {
    return apiError(error.message, { status: error.status, code: error.code })
  }
  throw error
}

/** Parse a JSON body; `undefined` when the body is missing or malformed. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
