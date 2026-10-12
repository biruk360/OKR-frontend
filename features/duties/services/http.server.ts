/**
 * Recurring duties — route helpers: JSON body reading and DutyError → envelope.
 * Server only.
 */
import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { DutyError } from './duties.server'

/** The parsed JSON body, or undefined for an empty / invalid body (zod then reports it). */
export async function readDutyJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/** Maps a DutyError to the standard error envelope; rethrows anything else (withAuth → 500). */
export function dutyErrorResponse(error: unknown): NextResponse {
  if (error instanceof DutyError) {
    return apiError(error.message, { status: error.status, code: error.code }) as NextResponse
  }
  throw error
}
