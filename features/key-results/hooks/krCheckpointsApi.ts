'use client'

/**
 * Client calls for KR checkpoints (KRX-3) and the KR definition (KRX-4).
 * Envelope: `{ success, data, error }` (lib/api/apiResponse.ts).
 */
import type {
  CreateKrCheckpointInput,
  KrCheckpointDTO,
  KrCheckpointsPayload,
  UpdateKrCheckpointInput,
  UpdateKrDefinitionInput,
} from '../components/checkpoints/checkpoint-types'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
}

export type KrApiError = Error & { status?: number }

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed (${res.status})`) as KrApiError
    error.status = res.status
    throw error
  }
  return body.data as T
}

const base = (keyResultId: string) => `/api/keyresults/${encodeURIComponent(keyResultId)}`

export const krCheckpointsApi = {
  list: (keyResultId: string) => request<KrCheckpointsPayload>(`${base(keyResultId)}/checkpoints`),
  create: (keyResultId: string, body: CreateKrCheckpointInput) =>
    request<KrCheckpointDTO>(`${base(keyResultId)}/checkpoints`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (keyResultId: string, checkpointId: string, body: UpdateKrCheckpointInput) =>
    request<KrCheckpointDTO>(`${base(keyResultId)}/checkpoints/${encodeURIComponent(checkpointId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (keyResultId: string, checkpointId: string) =>
    request<{ id: string }>(`${base(keyResultId)}/checkpoints/${encodeURIComponent(checkpointId)}`, {
      method: 'DELETE',
    }),
  /** PATCH /api/keyresults/[id] — KRX definition fields (F2 route). */
  updateDefinition: (keyResultId: string, body: UpdateKrDefinitionInput) =>
    request<unknown>(base(keyResultId), { method: 'PATCH', body: JSON.stringify(body) }),
}

export const krCheckpointKeys = {
  all: ['key-result-checkpoints'] as const,
  detail: (keyResultId: string) => ['key-result-checkpoints', keyResultId] as const,
}
