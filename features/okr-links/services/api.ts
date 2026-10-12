/**
 * OKR links API client (browser). Every response uses the standard envelope
 * `{ success, data, error }` — see lib/api/apiResponse.ts.
 *
 *   GET    /api/okr-links?type=&id=                  → OkrLinkListDto
 *   POST   /api/okr-links                            → created link (201)
 *   DELETE /api/okr-links/[id]                       → { id }
 *   GET    /api/objectives/alignment-search          → objective targets (server-side search)
 *   GET    /api/keyresults?search=                   → key-result targets
 */
import type { OkrLinkEntityType } from '@/types/package'
import type { CreateOkrLinkPayload, LinkTargetOption, OkrLinkListDto } from '../types'
import {
  keyResultRowToTarget,
  objectiveRowToTarget,
  type KeyResultSearchRow,
  type ObjectiveSearchRow,
} from '../utils'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
}

export class OkrLinkApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'OkrLinkApiError'
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => ({}))) as Envelope<T>
  if (!response.ok || !body.success) {
    const fallback =
      response.status === 423
        ? 'This item is locked.'
        : response.status === 403
          ? 'You do not have permission to change links on this item.'
          : 'Request failed'
    throw new OkrLinkApiError(response.status, body.error || fallback)
  }
  return body.data as T
}

export const okrLinksApi = {
  list(type: OkrLinkEntityType, id: string, signal?: AbortSignal) {
    const qs = new URLSearchParams({ type, id })
    return request<OkrLinkListDto>(`/api/okr-links?${qs}`, { signal })
  },

  create(payload: CreateOkrLinkPayload) {
    return request<{ id: string }>('/api/okr-links', { method: 'POST', body: JSON.stringify(payload) })
  },

  remove(linkId: string) {
    return request<{ id: string }>(`/api/okr-links/${encodeURIComponent(linkId)}`, { method: 'DELETE' })
  },

  /** Objectives in one timeframe, searched in the database (titles the viewer may read). */
  async searchObjectives(params: { timeframeId: string; q: string; level?: string }, signal?: AbortSignal): Promise<LinkTargetOption[]> {
    const qs = new URLSearchParams({ timeframeId: params.timeframeId, activeTimeframeOnly: 'false' })
    if (params.q.trim()) qs.set('q', params.q.trim())
    if (params.level) qs.set('level', params.level)
    const rows = await request<ObjectiveSearchRow[]>(`/api/objectives/alignment-search?${qs}`, { signal })
    return (Array.isArray(rows) ? rows : []).map(objectiveRowToTarget)
  },

  /** Key results by title (the KR list API has no timeframe filter; callers filter on `timeframeId`). */
  async searchKeyResults(params: { q: string; limit?: number }, signal?: AbortSignal): Promise<LinkTargetOption[]> {
    const qs = new URLSearchParams({ limit: String(params.limit ?? 100) })
    if (params.q.trim()) qs.set('search', params.q.trim())
    const rows = await request<KeyResultSearchRow[]>(`/api/keyresults?${qs}`, { signal })
    return (Array.isArray(rows) ? rows : []).map(keyResultRowToTarget)
  },
}
