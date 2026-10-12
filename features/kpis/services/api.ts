'use client'

import type { KpiListResponse, KpiReadingView, KpiReadingsResponse, KpiView } from '../types'

interface Envelope {
  success: boolean
  data?: unknown
  error?: string
  details?: unknown
  [key: string]: unknown
}

export type KpiApiError = Error & { status?: number; details?: unknown }

async function requestBody<T extends object>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as KpiApiError
    error.status = res.status
    error.details = body?.details
    throw error
  }
  return body as unknown as T
}

async function requestData<T>(input: string, init?: RequestInit): Promise<T> {
  const body = await requestBody<{ data: T }>(input, init)
  return body.data
}

function qs(params: Record<string, string | boolean | null | undefined>) {
  const out = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) out.set(key, String(value))
  }
  const query = out.toString()
  return query ? `?${query}` : ''
}

export interface KpiListParams {
  userId: string
  timeframeId?: string | null
  includeRetired?: boolean
}

export const kpisApi = {
  list: (params: KpiListParams) =>
    requestBody<KpiListResponse & { success: true }>(
      `/api/package/kpis${qs({ userId: params.userId, timeframeId: params.timeframeId, includeRetired: params.includeRetired ? '1' : undefined })}`,
    ),
  get: (id: string) => requestData<KpiView>(`/api/package/kpis/${encodeURIComponent(id)}`),
  create: (body: Record<string, unknown>) =>
    requestData<KpiView>('/api/package/kpis', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    requestData<KpiView>(`/api/package/kpis/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  retire: (id: string) => requestData<KpiView>(`/api/package/kpis/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  readings: (id: string) =>
    requestBody<KpiReadingsResponse & { success: true }>(`/api/package/kpis/${encodeURIComponent(id)}/readings`),
  saveReading: (id: string, body: Record<string, unknown>) =>
    requestBody<{ data: KpiReadingView; kpi: KpiView; created: boolean }>(
      `/api/package/kpis/${encodeURIComponent(id)}/readings`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
}
