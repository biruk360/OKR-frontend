/**
 * Decision routes: shared request/response helpers (server-only).
 */
import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { isDecisionError } from './decisions.server'

/** Map a DecisionError to the standard envelope; rethrow anything else (withAuth → 500). */
export function decisionErrorResponse(error: unknown): NextResponse {
  if (isDecisionError(error)) {
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
