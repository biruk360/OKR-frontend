'use client'

import type { PackageReviewEntityType, PackageWeights, ReviewVerdict } from '@/types/package'
import type {
  ApprovePackageResult,
  OperatingPackageResponse,
  PackageReviewsResponse,
  UpsertPackageReviewResult,
} from '../types'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  details?: unknown
}

export interface PackageApiError extends Error {
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
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as PackageApiError
    error.status = res.status
    error.code = body?.code
    error.details = body?.details
    throw error
  }
  return body.data as T
}

export interface PackageCreateBody {
  userId: string
  timeframeId: string
  version?: string
  seatTitle?: string | null
  summaryLines?: string[]
  weights?: PackageWeights | null
  sourceFile?: string | null
}

export interface PackageUpdateBody {
  version?: string
  seatTitle?: string | null
  summaryLines?: string[]
  weights?: PackageWeights | null
  sourceFile?: string | null
  status?: 'DRAFT' | 'ARCHIVED'
}

export interface PackageReviewBody {
  entityType: PackageReviewEntityType
  entityId: string
  verdict: ReviewVerdict
  comment?: string | null
}

const BASE = '/api/package/packages'
const enc = encodeURIComponent

export const operatingPackageApi = {
  get: (userId: string, timeframeId: string) => {
    const params = new URLSearchParams({ userId, timeframeId })
    return request<OperatingPackageResponse>(`${BASE}?${params.toString()}`)
  },
  getById: (id: string) => request<OperatingPackageResponse>(`${BASE}/${enc(id)}`),
  create: (body: PackageCreateBody) =>
    request<OperatingPackageResponse>(BASE, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: PackageUpdateBody) =>
    request<OperatingPackageResponse>(`${BASE}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  submit: (id: string) => request<OperatingPackageResponse>(`${BASE}/${enc(id)}/submit`, { method: 'POST' }),
  approve: (id: string) => request<ApprovePackageResult>(`${BASE}/${enc(id)}/approve`, { method: 'POST' }),
  reviews: (id: string) => request<PackageReviewsResponse>(`${BASE}/${enc(id)}/reviews`),
  review: (id: string, body: PackageReviewBody) =>
    request<UpsertPackageReviewResult>(`${BASE}/${enc(id)}/reviews`, { method: 'PUT', body: JSON.stringify(body) }),
  resolve: (id: string, reviewId: string, resolution: string) =>
    request<UpsertPackageReviewResult>(`${BASE}/${enc(id)}/reviews/${enc(reviewId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),
}
