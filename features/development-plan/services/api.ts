'use client'

import type { DevelopmentKind, DevelopmentStatus } from '@/types/package'
import type { AddDevelopmentHoursResult, DevelopmentItemDTO, DevelopmentListResponse } from '../types'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  details?: unknown
}

export interface DevelopmentApiError extends Error {
  status?: number
  code?: string
  details?: unknown
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as (Envelope<T> & { code?: string }) | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as DevelopmentApiError
    error.status = res.status
    error.code = body?.code
    error.details = body?.details
    throw error
  }
  return body.data as T
}

/** Body of POST / PATCH. Dates as YYYY-MM-DD or ISO; '' / null clears an optional field on PATCH. */
export interface DevelopmentItemWriteBody {
  title?: string
  kind?: DevelopmentKind
  targetText?: string
  targetHours?: number | null
  hoursLogged?: number
  dueDate?: string | null
  keyResultId?: string | null
  isMandatory?: boolean
  status?: DevelopmentStatus
  evidenceNote?: string | null
  evidenceUrl?: string | null
  dropReason?: string | null
  completedAt?: string | null
  externalRef?: string | null
}

export interface DevelopmentHoursBody {
  hours: number
  note?: string | null
  date?: string | null
}

const BASE = '/api/package/development'

export const developmentApi = {
  list: (userId: string, timeframeId?: string | null) => {
    const params = new URLSearchParams({ userId })
    if (timeframeId) params.set('timeframeId', timeframeId)
    return request<DevelopmentListResponse>(`${BASE}?${params.toString()}`)
  },
  get: (id: string) => request<DevelopmentItemDTO>(`${BASE}/${encodeURIComponent(id)}`),
  create: (body: DevelopmentItemWriteBody & { ownerId: string; timeframeId: string; title: string; kind: DevelopmentKind; targetText: string }) =>
    request<DevelopmentItemDTO>(BASE, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: DevelopmentItemWriteBody) =>
    request<DevelopmentItemDTO>(`${BASE}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addHours: (id: string, body: DevelopmentHoursBody) =>
    request<AddDevelopmentHoursResult>(`${BASE}/${encodeURIComponent(id)}/hours`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
