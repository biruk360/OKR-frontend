/**
 * KPI routes — shared request/response helpers (server only).
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { Session } from 'next-auth'
import { apiError, apiForbidden } from '@/lib/api/apiResponse'
import { isKpiError } from './errors'

/** Map a KpiError to the standard envelope; rethrow anything else (withAuth → 500). */
export function kpiErrorResponse(error: unknown): NextResponse {
  if (isKpiError(error)) return apiError(error.message, { status: error.status, code: error.code })
  throw error
}

/** Parse a JSON body; `undefined` when missing or malformed. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/** Client-portal sessions never reach package data. */
export function rejectPortalSession(session: Session): NextResponse | null {
  return session.user.userType === 'CLIENT_PORTAL' ? apiForbidden() : null
}

/** `{ success: true, data, ...extra }` — list envelopes that carry `permissions` alongside `data`. */
export function apiSuccessWith<T, E extends Record<string, unknown>>(data: T, extra: E, status = 200) {
  return NextResponse.json({ success: true as const, data, ...extra }, { status })
}

/** Viewer identity for lib/package/access.ts. */
export function viewerOf(session: Session) {
  return { id: session.user.id, role: session.user.role as string }
}
