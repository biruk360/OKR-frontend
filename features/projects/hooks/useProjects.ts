'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { ProjectStatus, RagStatus } from '../types'
import type { ProjectCreationSourceMethod } from '@/lib/projects/creation-draft'
import type {
  ProjectCreationProjectJson,
  ProjectCreationScheduleJson,
  ProjectCreationValidationJson,
} from '@/lib/projects/creation-normalize'
import type {
  ProjectCreationImportMappingSelection,
  ProjectCreationImportSummary,
  ProjectCreationSpreadsheetInspection,
} from '@/lib/projects/creation-import'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'

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

export interface ProjectCreationDraftNode {
  id: string
  ownerUserId: string
  sourceMethod: ProjectCreationSourceMethod
  status: string
  version: number
  projectJson: ProjectCreationProjectJson
  scheduleJson: ProjectCreationScheduleJson | null
  validationJson: ProjectCreationValidationJson | null
  sourceFileName: string | null
  sourceMimeType: string | null
  sourceSize: number | null
  sourceHash: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  committedProjectId?: string | null
  committedAt?: string | null
}

export interface ProjectCreationImportResponse {
  stage: 'SHEET_SELECTION' | 'MAPPING' | 'VALIDATION_ERRORS' | 'READY_FOR_REVIEW' | 'DOCX_EXTRACTED'
  draft: ProjectCreationDraftNode
  inspection: ProjectCreationSpreadsheetInspection | null
  documentExtraction: {
    blocks: number
    headings: number
    paragraphs: number
    tables: number
    pages: number
    warnings: number
  } | null
  summary: ProjectCreationImportSummary | null
  aiUsed: boolean
  commitBlocked: boolean
  mappingAccepted?: boolean
}

export interface UpdateProjectCreationDraftPayload {
  version: number
  sourceMethod?: ProjectCreationSourceMethod
  discardMethodData?: true
  projectJson?: ProjectCreationProjectJson
  scheduleJson?: ProjectCreationScheduleJson
  validationJson?: ProjectCreationValidationJson
}

// --- keys --------------------------------------------------------------------

export const projectKeys = {
  all: ['projects'] as const,
  list: (params?: Record<string, string>) => ['projects', 'list', params ?? {}] as const,
  templates: ['projects', 'templates'] as const,
  template: (id: string) => ['projects', 'templates', id] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  creationDraft: (id: string) => ['projects', 'creation-draft', id] as const,
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

export function useProjectCreationDraft(id: string | null, enabled = true) {
  return useQuery({
    queryKey: projectKeys.creationDraft(id ?? ''),
    queryFn: () => fetchJson<ProjectCreationDraftNode>(`/api/projects/creation-drafts/${id}`),
    enabled: enabled && Boolean(id),
    retry: false,
    staleTime: 10_000,
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

export function useCreateProjectCreationDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      sourceMethod: ProjectCreationSourceMethod
      projectJson?: ProjectCreationProjectJson
    }) => fetchJson<ProjectCreationDraftNode>('/api/projects/creation-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: (draft) => {
      qc.setQueryData(projectKeys.creationDraft(draft.id), draft)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useUpdateProjectCreationDraft(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateProjectCreationDraftPayload) =>
      fetchJson<ProjectCreationDraftNode>(`/api/projects/creation-drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: (draft) => {
      qc.setQueryData(projectKeys.creationDraft(draft.id), draft)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useDiscardProjectCreationDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number; silent?: boolean }) =>
      fetchJson<{ id: string; discarded: true }>(
        `/api/projects/creation-drafts/${id}?version=${version}`,
        { method: 'DELETE' },
      ),
    onSuccess: ({ id }, variables) => {
      qc.removeQueries({ queryKey: projectKeys.creationDraft(id) })
      if (!variables.silent) toast.success('Draft discarded')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useCommitProjectCreationDraft(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ version }: { version: number }) =>
      fetchJson<CommitProjectCreationDraftResult>(`/api/projects/creation-drafts/${id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      qc.removeQueries({ queryKey: projectKeys.creationDraft(id) })
      toast.success(project.existing ? `Project ${project.code} already created` : `Project ${project.code} created`)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useInspectProjectCreationImport(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, version, sheetName }: {
      file: File
      version: number
      sheetName?: string
    }) => {
      const body = new FormData()
      body.set('file', file)
      body.set('version', String(version))
      if (sheetName) body.set('sheetName', sheetName)
      return fetchJson<ProjectCreationImportResponse>(
        `/api/projects/creation-drafts/${id}/upload`,
        { method: 'POST', body },
      )
    },
    onSuccess: ({ draft }) => qc.setQueryData(projectKeys.creationDraft(draft.id), draft),
  })
}

export function useAnalyzeProjectCreationImport(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, version, sheetName, mapping }: {
      file: File
      version: number
      sheetName: string
      mapping: ProjectCreationImportMappingSelection[]
    }) => {
      const body = new FormData()
      body.set('file', file)
      body.set('version', String(version))
      body.set('sheetName', sheetName)
      body.set('mapping', JSON.stringify(mapping))
      return fetchJson<ProjectCreationImportResponse>(
        `/api/projects/creation-drafts/${id}/analyze`,
        { method: 'POST', body },
      )
    },
    onSuccess: ({ draft }) => qc.setQueryData(projectKeys.creationDraft(draft.id), draft),
  })
}

export function useProposeProjectCreationImportMapping(id: string) {
  return useMutation({
    mutationFn: ({ version, sheetName }: { version: number; sheetName: string }) =>
      fetchJson<ProjectCreationImportResponse>(
        `/api/projects/creation-drafts/${id}/mapping-proposal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version, sheetName }),
        },
      ),
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
