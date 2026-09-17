'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * useOkrOptions — the one way to load objectives + their key results for a
 * picker.
 *
 * Why this exists: there were two different fetch strategies for the same data.
 * `LinkToOkrPopover` called `/api/objectives?limit=200` *and*
 * `/api/key-results?limit=500` and re-joined them client-side; `CheckInPickerModal`
 * called `/api/objectives` alone and read `keyResults` off the payload. The
 * second is correct — `/api/objectives` already includes nested `keyResults`
 * (app/api/objectives/route.ts:104) — so one request replaces two.
 *
 * Consolidating `EntityPicker` without consolidating the fetch would just move
 * the duplication. See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
 */

export interface OkrKeyResultOption {
  id: string
  title: string
  progress?: number
  status?: string | null
  ownerId?: string | null
  unit?: string | null
  currentValue?: number
  targetValue?: number
}

export interface OkrObjectiveOption {
  id: string
  title: string
  level?: string | null
  status?: string | null
  ownerId?: string | null
  progress?: number
  keyResults: OkrKeyResultOption[]
}

export interface UseOkrOptionsParams {
  /** Only ACTIVE objectives, only the caller's own, etc. Passed straight to the API. */
  status?: string
  ownerId?: string
  timeframeId?: string
  level?: string
  /** Server-side page size. The API defaults to 10, which is never right here. */
  limit?: number
  /** Drop objectives that have no key results (pickers that require a KR). */
  requireKeyResults?: boolean
  /** Defer the request until the picker actually opens. */
  enabled?: boolean
}

interface ApiResponse {
  success: boolean
  data?: unknown
  error?: string
}

export const okrOptionsQueryKey = (params: UseOkrOptionsParams) =>
  [
    'okr-options',
    {
      status: params.status ?? null,
      ownerId: params.ownerId ?? null,
      timeframeId: params.timeframeId ?? null,
      level: params.level ?? null,
      limit: params.limit ?? 200,
    },
  ] as const

function toNumber(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function fetchOkrOptions(params: UseOkrOptionsParams): Promise<OkrObjectiveOption[]> {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 200) })
  if (params.status) qs.set('status', params.status)
  if (params.ownerId) qs.set('ownerId', params.ownerId)
  if (params.timeframeId) qs.set('timeframeId', params.timeframeId)
  if (params.level) qs.set('level', params.level)

  const res = await fetch(`/api/objectives?${qs}`)
  if (!res.ok) throw new Error(`Failed to load OKRs (${res.status})`)
  const json: ApiResponse = await res.json()
  if (!json.success) throw new Error(json.error || 'Failed to load OKRs')

  // The envelope is `{ data: [...] }`, but a couple of older routes wrap the
  // array in `{ data: { items: [...] } }`. Tolerate both.
  const raw = json.data as any
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []

  return list.map((o) => ({
    id: o.id,
    title: o.title,
    level: o.level ?? null,
    status: o.status ?? null,
    ownerId: o.ownerId ?? null,
    progress: toNumber(o.progress),
    keyResults: (o.keyResults ?? []).map((k: any) => ({
      id: k.id,
      title: k.title,
      progress: toNumber(k.progress),
      status: k.status ?? null,
      ownerId: k.ownerId ?? null,
      unit: k.unit ?? null,
      currentValue: toNumber(k.currentValue),
      targetValue: toNumber(k.targetValue),
    })),
  }))
}

export function useOkrOptions(params: UseOkrOptionsParams = {}) {
  const { requireKeyResults = false, enabled, ...fetchParams } = params

  const query = useQuery({
    queryKey: okrOptionsQueryKey(fetchParams),
    queryFn: () => fetchOkrOptions(fetchParams),
    enabled,
    staleTime: 60_000,
  })

  const objectives = query.data ?? []

  return {
    objectives: requireKeyResults
      ? objectives.filter((o) => o.keyResults.length > 0)
      : objectives,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
