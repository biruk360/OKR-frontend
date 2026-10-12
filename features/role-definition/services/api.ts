'use client'

import type { ApproveRoleDefinitionResult, RoleDefinitionDTO, RoleDefinitionListResponse } from '../types'
import type { RoleItemSection } from '@/types/package'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  details?: unknown
}

export interface RoleDefinitionApiError extends Error {
  status?: number
  details?: unknown
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as RoleDefinitionApiError
    error.status = res.status
    error.details = body?.details
    throw error
  }
  return body.data as T
}

/** Body of POST / PATCH. Dates as YYYY-MM-DD or ISO; `items` replaces the list on PATCH. */
export interface RoleDefinitionWriteBody {
  seatTitle?: string
  reportsToId?: string | null
  reportsToText?: string | null
  purpose?: string
  effectiveFrom?: string | null
  /** On PATCH, send `id` for existing items to update them in place. */
  items?: Array<{ id?: string; section: RoleItemSection; label?: string | null; text: string }>
}

const BASE = '/api/package/role-definitions'

export const roleDefinitionApi = {
  list: (userId: string, timeframeId?: string | null) => {
    const params = new URLSearchParams({ userId })
    if (timeframeId) params.set('timeframeId', timeframeId)
    return request<RoleDefinitionListResponse>(`${BASE}?${params.toString()}`)
  },
  get: (id: string) => request<RoleDefinitionDTO>(`${BASE}/${encodeURIComponent(id)}`),
  create: (body: RoleDefinitionWriteBody & { userId: string; timeframeId?: string | null }) =>
    request<RoleDefinitionDTO>(BASE, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: RoleDefinitionWriteBody) =>
    request<RoleDefinitionDTO>(`${BASE}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => request<{ id: string }>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  approve: (id: string, body: { updateDesignation?: boolean }) =>
    request<ApproveRoleDefinitionResult>(`${BASE}/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
