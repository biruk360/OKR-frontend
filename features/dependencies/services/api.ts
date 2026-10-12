'use client'

/**
 * Work dependencies — client fetchers for /api/dependencies/**. Unwraps the
 * standard `{ success, data }` envelope and throws an Error carrying `status`.
 */
import type {
  DeliveryTaskResult,
  DependencyDetailRow,
  DependencyListFilters,
  DependencyListResponse,
  DependencyRow,
  DependencyStatusBody,
  DependencyStatusResult,
  DependencyWriteBody,
  PersonDependenciesResponse,
} from '../types'

interface Envelope {
  success: boolean
  data?: unknown
  error?: string
  details?: unknown
}

export type DependencyApiError = Error & { status?: number; details?: unknown }

async function requestData<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as DependencyApiError
    error.status = res.status
    error.details = body?.details
    throw error
  }
  return body.data as T
}

/** Query string for the list / export filters. */
export function dependencyFilterQuery(filters: DependencyListFilters = {}): string {
  const out = new URLSearchParams()
  const set = (key: string, value: string | undefined) => {
    if (value) out.set(key, value)
  }
  set('timeframeId', filters.timeframeId)
  if (filters.status?.length) out.set('status', filters.status.join(','))
  if (filters.type?.length) out.set('type', filters.type.join(','))
  set('providerId', filters.providerId)
  set('neederId', filters.neederId)
  set('partyId', filters.partyId)
  set('due', filters.due)
  set('linkedType', filters.linkedType)
  set('linkedId', filters.linkedId)
  set('deliveryTodoId', filters.deliveryTodoId)
  set('q', filters.q)
  set('scope', filters.scope)
  if (filters.mine) out.set('mine', '1')
  const query = out.toString()
  return query ? `?${query}` : ''
}

/** URL of the CSV export for the given filters (DEP-6) — use as an <a href download>. */
export function dependencyExportHref(filters: DependencyListFilters = {}): string {
  return `/api/dependencies/export${dependencyFilterQuery(filters)}`
}

export interface PersonDependencyParams {
  userId: string
  timeframeId?: string | null
  includeClosed?: boolean
}

const enc = encodeURIComponent

export const dependenciesApi = {
  list: (filters: DependencyListFilters = {}) =>
    requestData<DependencyListResponse>(`/api/dependencies${dependencyFilterQuery(filters)}`),
  person: ({ userId, timeframeId, includeClosed }: PersonDependencyParams) => {
    const qs = new URLSearchParams()
    if (timeframeId) qs.set('timeframeId', timeframeId)
    if (includeClosed === false) qs.set('includeClosed', '0')
    const query = qs.toString()
    return requestData<PersonDependenciesResponse>(`/api/dependencies/person/${enc(userId)}${query ? `?${query}` : ''}`)
  },
  get: (id: string) => requestData<DependencyRow>(`/api/dependencies/${enc(id)}`),
  create: (body: DependencyWriteBody) =>
    requestData<{ dependency: DependencyDetailRow; deliveryTask: DeliveryTaskResult['todo'] | null }>('/api/dependencies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: DependencyWriteBody) =>
    requestData<DependencyDetailRow>(`/api/dependencies/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setStatus: (id: string, body: DependencyStatusBody) =>
    requestData<DependencyStatusResult>(`/api/dependencies/${enc(id)}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createDeliveryTask: (id: string) =>
    requestData<DeliveryTaskResult>(`/api/dependencies/${enc(id)}/delivery-task`, { method: 'POST' }),
}
