'use client'

/**
 * Recurring duties — browser client for /api/package/duties.
 */
import type { DutyDTO, DutyListPayload, DutyLogResult } from '../types'
import type { DutyAction } from './schemas'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  details?: unknown
}

export type DutyApiError = Error & { status?: number; code?: string; details?: unknown }

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as DutyApiError
    error.status = res.status
    error.code = body?.code
    error.details = body?.details
    throw error
  }
  return body.data as T
}

function qs(params: Record<string, string | boolean | null | undefined>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out.set(k, String(v))
  }
  const s = out.toString()
  return s ? `?${s}` : ''
}

/** Body of POST /api/package/duties (dates as "YYYY-MM-DD"). */
export interface DutyWriteBody {
  ownerId?: string | null
  timeframeId?: string
  title?: string
  cadence?: string
  eventLabel?: string | null
  timingText?: string | null
  durationMin?: number | null
  outputText?: string | null
  keyResultId?: string | null
  objectiveId?: string | null
  autoTask?: boolean
  startsOn?: string | null
  endsOn?: string | null
  collaboratorIds?: string[]
}

export const dutiesApi = {
  list: (params: { userId?: string; timeframeId?: string; includeRetired?: boolean }) =>
    request<DutyListPayload>(`/api/package/duties${qs(params)}`),
  get: (id: string) => request<DutyDTO>(`/api/package/duties/${encodeURIComponent(id)}`),
  create: (body: DutyWriteBody) =>
    request<DutyDTO>('/api/package/duties', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: DutyWriteBody) =>
    request<DutyDTO>(`/api/package/duties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  action: (id: string, action: DutyAction) =>
    request<DutyDTO>(`/api/package/duties/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }),
  remove: (id: string) =>
    request<{ id: string }>(`/api/package/duties/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  log: (id: string, body: { dueDate?: string | null; completed?: boolean; note?: string | null } = {}) =>
    request<DutyLogResult>(`/api/package/duties/${encodeURIComponent(id)}/log`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
