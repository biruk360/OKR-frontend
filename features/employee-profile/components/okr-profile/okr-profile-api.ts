'use client'

/**
 * Employee OKR profile — browser client + TanStack Query hooks for
 * `GET /api/users/[id]/okr-profile` and `POST /api/users/[id]/okr-profile/initiatives`.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { invalidateConnections } from '@/components/shared/connections'
import type { OkrProfilePayload } from './types'
import type { ProfileInitiativeKind } from './schemas'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
}

export class OkrProfileApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OkrProfileApiError'
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    throw new OkrProfileApiError(res.status, body?.error ?? `Request failed (${res.status})`)
  }
  return body.data as T
}

export interface CreateInitiativeBody {
  keyResultId: string
  kind: ProfileInitiativeKind
  title: string
  dueDate?: string | null
  assigneeId?: string | null
}

export interface CreatedInitiative {
  id: string
  cardNumber: number
  title: string
  kind: string
  keyResultId: string
  objectiveId: string
  assigneeId: string | null
  dueDate: string | null
}

export const okrProfileApi = {
  get(userId: string, timeframeId?: string | null, signal?: AbortSignal): Promise<OkrProfilePayload> {
    const qs = timeframeId ? `?${new URLSearchParams({ timeframeId })}` : ''
    return request<OkrProfilePayload>(`/api/users/${encodeURIComponent(userId)}/okr-profile${qs}`, { signal })
  },
  createInitiative(userId: string, body: CreateInitiativeBody): Promise<CreatedInitiative> {
    return request<CreatedInitiative>(`/api/users/${encodeURIComponent(userId)}/okr-profile/initiatives`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}

export const okrProfileKeys = {
  all: ['okr-profile'] as const,
  detail: (userId: string, timeframeId?: string | null) => ['okr-profile', userId, timeframeId || 'default'] as const,
}

export function useOkrProfile(userId: string, timeframeId?: string | null) {
  return useQuery({
    queryKey: okrProfileKeys.detail(userId, timeframeId),
    queryFn: ({ signal }) => okrProfileApi.get(userId, timeframeId, signal),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: (count, error) =>
      !(error instanceof OkrProfileApiError && [400, 403, 404, 422].includes(error.status)) && count < 2,
  })
}

/** Refresh every OKR profile and connection entry (after a check-in, close or add). */
export function useRefreshOkrProfile() {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: okrProfileKeys.all })
    void invalidateConnections(qc)
  }, [qc])
}

export function useCreateProfileInitiative(userId: string) {
  const refresh = useRefreshOkrProfile()
  return useMutation({
    mutationFn: (body: CreateInitiativeBody) => okrProfileApi.createInitiative(userId, body),
    onSuccess: (created) => {
      refresh()
      toast.success(created.kind === 'MILESTONE' ? 'Milestone added' : 'Task added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
