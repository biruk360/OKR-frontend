'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { ProjectStatus, RagStatus } from '../types'

// --- fetch helpers -----------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${res.status}`)
  }
  return json.data as T
}

async function fetchPaginated<T>(url: string): Promise<{ data: T[]; pagination: any }> {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return { data: json.data as T[], pagination: json.pagination }
}

// --- types (client-facing) ---------------------------------------------------

export interface ProjectListItem {
  id: string
  code: string
  name: string
  clientName: string
  status: ProjectStatus
  ragStatus: RagStatus
  confidence: number
  percentComplete: number
  percentPlanned: number
  spi: number | null
  plannedStart: string
  plannedEnd: string
  baselineCommittedAt: string | null
  projectManagerId: string
  departmentId: string | null
  updatedAt: string
}

export interface ProjectTemplateSummary {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  version: number
  phaseCount: number
  milestoneCount: number
  activityCount: number
}

export interface CreateProjectPayload {
  name: string
  code?: string
  clientName: string
  description?: string | null
  projectManagerId: string
  departmentId?: string | null
  contractValue?: number | null
  currency?: 'ETB' | 'USD' | 'EUR'
  plannedStart: string
  plannedEnd: string
  templateId?: string | null
}

// --- keys --------------------------------------------------------------------

export const projectKeys = {
  all: ['projects'] as const,
  list: (params?: Record<string, string>) => ['projects', 'list', params ?? {}] as const,
  templates: ['projects', 'templates'] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
}

// --- reads -------------------------------------------------------------------

export function useProjectsList(params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return useQuery({
    queryKey: projectKeys.list(Object.fromEntries(qs) as Record<string, string>),
    queryFn: () => fetchPaginated<ProjectListItem>(`/api/projects${query ? `?${query}` : ''}`),
    staleTime: 15_000,
  })
}

export function useProjectTemplates() {
  return useQuery({
    queryKey: projectKeys.templates,
    queryFn: () => fetchJson<ProjectTemplateSummary[]>('/api/projects/templates'),
    staleTime: 5 * 60_000,
  })
}

// --- mutations ---------------------------------------------------------------

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      fetchJson<{ id: string; code: string }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      toast.success(`Project ${data.code} created`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
