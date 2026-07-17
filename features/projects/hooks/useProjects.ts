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
  phases: number
  milestones: number
  activities: number
}

export interface ProjectTemplateDetail {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  version: number
  structureJson: {
    phases: Array<{
      name: string
      weight: number
      milestones: Array<{
        name: string
        weight?: number
        isKeyMilestone: boolean
        activities: Array<{
          title: string
          ownerParty: '360GROUND' | 'CLIENT' | 'SHARED'
          weight?: number
          isApproval: boolean
        }>
      }>
    }>
  }
}

export interface CreateTemplatePayload {
  name: string
  description?: string | null
  structureJson?: ProjectTemplateDetail['structureJson']
}

export interface UpdateTemplatePayload {
  name?: string
  description?: string | null
  structureJson?: ProjectTemplateDetail['structureJson']
}

export interface CloneTemplatePayload {
  name?: string
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
  template: (id: string) => ['projects', 'templates', id] as const,
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

export function useProjectTemplate(id: string | null) {
  return useQuery({
    queryKey: projectKeys.template(id ?? ''),
    queryFn: () => fetchJson<ProjectTemplateDetail>(`/api/projects/templates/${id}`),
    enabled: !!id,
    staleTime: 60_000,
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

export function useCreateProjectTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTemplatePayload) =>
      fetchJson<{ id: string }>('/api/projects/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.templates })
      toast.success('Template created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateProjectTemplate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateTemplatePayload) =>
      fetchJson<{ id: string }>(`/api/projects/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.template(id) })
      qc.invalidateQueries({ queryKey: projectKeys.templates })
      toast.success('Template saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteProjectTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ id: string }>(`/api/projects/templates/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.templates })
      toast.success('Template deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCloneProjectTemplate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CloneTemplatePayload) =>
      fetchJson<{ id: string }>(`/api/projects/templates/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.templates })
      toast.success('Template cloned')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
