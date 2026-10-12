/**
 * Work dependencies — route helpers: JSON body reading and DependencyError →
 * envelope. Server only.
 */
import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { DependencyError } from './dependencies.server'

/** The parsed JSON body, or undefined for an empty / invalid body (zod then reports it). */
export async function readDependencyJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/** Maps a DependencyError to the standard error envelope; rethrows anything else (withAuth → 500). */
export function dependencyErrorResponse(error: unknown): NextResponse {
  if (error instanceof DependencyError) {
    return apiError(error.message, { status: error.status, code: error.code }) as NextResponse
  }
  throw error
}
