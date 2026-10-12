'use client'

import type { DecisionLinkEntityType, DecisionStatus } from '@/types/package'
import type { DecideDecisionResult, DecisionDetailDTO, DecisionListResponse } from '../types'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  details?: unknown
}

export interface DecisionApiError extends Error {
  status?: number
  code?: string
  details?: unknown
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as DecisionApiError
    error.status = res.status
    error.code = body?.code
    error.details = body?.details
    throw error
  }
  return body.data as T
}

/** GET /api/decisions filters (see listDecisionsQuerySchema). */
export interface DecisionListFilters {
  status?: DecisionStatus[] | 'all'
  /** User id or 'me'. */
  deciderId?: string
  affectingUserId?: string
  requestedById?: string
  batch?: string
  timeframeId?: string | null
  openAnyTimeframe?: boolean
  q?: string
  limit?: number
}

export function decisionListParams(filters: DecisionListFilters): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status === 'all' ? 'all' : filters.status.join(','))
  if (filters.deciderId) params.set('deciderId', filters.deciderId)
  if (filters.affectingUserId) params.set('affectingUserId', filters.affectingUserId)
  if (filters.requestedById) params.set('requestedById', filters.requestedById)
  if (filters.batch) params.set('batch', filters.batch)
  if (filters.timeframeId) params.set('timeframeId', filters.timeframeId)
  if (filters.openAnyTimeframe) params.set('openAnyTimeframe', '1')
  if (filters.q) params.set('q', filters.q)
  if (filters.limit) params.set('limit', String(filters.limit))
  return params.toString()
}

export interface DecisionLinkBody {
  entityType: DecisionLinkEntityType
  entityId: string
}

/** Body of POST. Dates as YYYY-MM-DD or ISO. */
export interface DecisionCreateBody {
  title: string
  timeframeId?: string | null
  externalRef?: string | null
  requestedById?: string | null
  requestedByText?: string | null
  deciderId?: string | null
  neededBy?: string | null
  batch?: string | null
  optionsText?: string | null
  unblocksText?: string | null
  links?: DecisionLinkBody[]
}

/** Body of PATCH. `links` replaces the whole set. */
export interface DecisionUpdateBody {
  title?: string
  externalRef?: string | null
  requestedByText?: string | null
  deciderId?: string
  neededBy?: string | null
  batch?: string | null
  optionsText?: string | null
  unblocksText?: string | null
  status?: DecisionStatus
  decisionText?: string
  links?: DecisionLinkBody[]
}

export interface DecideBody {
  decisionText: string
  decidedAt?: string | null
  closeDependencies?: boolean
}

const BASE = '/api/decisions'
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`

export const decisionApi = {
  list: (filters: DecisionListFilters) => {
    const qs = decisionListParams(filters)
    return request<DecisionListResponse>(qs ? `${BASE}?${qs}` : BASE)
  },
  get: (id: string) => request<DecisionDetailDTO>(one(id)),
  create: (body: DecisionCreateBody) => request<DecisionDetailDTO>(BASE, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: DecisionUpdateBody) =>
    request<DecisionDetailDTO>(one(id), { method: 'PATCH', body: JSON.stringify(body) }),
  decide: (id: string, body: DecideBody) =>
    request<DecideDecisionResult>(`${one(id)}/decide`, { method: 'POST', body: JSON.stringify(body) }),
}
