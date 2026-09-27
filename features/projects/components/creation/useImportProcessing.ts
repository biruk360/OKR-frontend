'use client'

/**
 * Story 2.7 import-processing hooks (background upload processing + polling + retry).
 * Kept beside the Import step because they serve only it; they reuse the shared draft
 * query key so the rest of the creation flow sees the same draft.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectKeys, type ProjectCreationDraftNode } from '../../hooks/useProjects'
import type { ProjectCreationImportStatusView } from '@/lib/projects/creation-processing'
import type { ProjectCreationImportMappingSelection } from '@/lib/projects/creation-import'

export type ProjectCreationImportStatus = ProjectCreationImportStatusView & {
  draft: ProjectCreationDraftNode
  retryStarted?: boolean
}

export const PROJECT_CREATION_IMPORT_POLL_MS = 1_500

async function fetchData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const json = await response.json().catch(() => ({}))
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${response.status}`)
  }
  return json.data as T
}

const statusKey = (id: string) => [...projectKeys.creationDraft(id), 'import-status'] as const

/** Polls the processing status while the draft is PROCESSING; idle otherwise. */
export function useProjectCreationImportStatus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: statusKey(id),
    queryFn: () => fetchData<ProjectCreationImportStatus>(`/api/projects/creation-drafts/${id}/upload`),
    enabled,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.stage === 'PROCESSING' ? PROJECT_CREATION_IMPORT_POLL_MS : false),
    refetchIntervalInBackground: true,
  })
}

export function useStartProjectCreationImport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, version }: { file: File; version: number }) => {
      const body = new FormData()
      body.set('file', file)
      body.set('version', String(version))
      return fetchData<ProjectCreationImportStatus>(`/api/projects/creation-drafts/${id}/upload`, { method: 'POST', body })
    },
    onSuccess: (status) => {
      queryClient.setQueryData(projectKeys.creationDraft(id), status.draft)
      queryClient.setQueryData(statusKey(id), status)
    },
  })
}

export function useRetryProjectCreationImport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ version, sheetName }: { version: number; sheetName?: string }) =>
      fetchData<ProjectCreationImportStatus>(`/api/projects/creation-drafts/${id}/upload/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, ...(sheetName ? { sheetName } : {}) }),
      }),
    onSuccess: (status) => {
      queryClient.setQueryData(projectKeys.creationDraft(id), status.draft)
      queryClient.setQueryData(statusKey(id), status)
    },
  })
}

/** Approves a column mapping against the retained upload (no second file upload). */
export function useApproveRetainedProjectCreationMapping(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ version, sheetName, mapping }: {
      version: number
      sheetName: string
      mapping: ProjectCreationImportMappingSelection[]
    }) => {
      const body = new FormData()
      body.set('version', String(version))
      body.set('sheetName', sheetName)
      body.set('mapping', JSON.stringify(mapping))
      return fetchData<{ stage: string; draft: ProjectCreationDraftNode; summary: ProjectCreationImportStatusView['summary']; commitBlocked: boolean }>(
        `/api/projects/creation-drafts/${id}/analyze`,
        { method: 'POST', body },
      )
    },
    onSuccess: ({ draft }) => {
      queryClient.setQueryData(projectKeys.creationDraft(id), draft)
      void queryClient.invalidateQueries({ queryKey: statusKey(id) })
    },
  })
}
