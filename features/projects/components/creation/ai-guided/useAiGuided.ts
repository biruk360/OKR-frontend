'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AiGuidedBrief } from '@/lib/projects/ai-guided-brief'
import type { AiGuidedGenerationSummary } from '@/lib/projects/ai-guided-schedule'
import type { AiGuidedRevisionPreview } from '@/lib/projects/ai-guided-service'
import { projectKeys, type ProjectCreationDraftNode } from '../../../hooks/useProjects'

/** Error carrying the server envelope's code/details so the flow can react precisely. */
export class AiGuidedRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AiGuidedRequestError'
  }
}

async function send<T>(url: string, method: 'POST' | 'PUT' | 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || json.success === false) {
    throw new AiGuidedRequestError(json.error || `Request failed: ${response.status}`, json.code, response.status, json.details)
  }
  return json.data as T
}

const base = (draftId: string) => `/api/projects/creation-drafts/${draftId}/ai-guided`

function useDraftMutation<TPayload, TResult extends { draft?: ProjectCreationDraftNode }>(
  mutationFn: (payload: TPayload) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation<TResult, AiGuidedRequestError, TPayload>({
    mutationFn,
    onSuccess: (result) => {
      if (result.draft) queryClient.setQueryData(projectKeys.creationDraft(result.draft.id), result.draft)
    },
  })
}

export function useSaveAiGuidedBrief(draftId: string) {
  return useDraftMutation((payload: { version: number; brief: AiGuidedBrief }) =>
    send<{ draft: ProjectCreationDraftNode }>(`${base(draftId)}/brief`, 'PUT', payload))
}

export function useClarifyAiGuidedDraft(draftId: string) {
  return useDraftMutation((payload: { version: number }) =>
    send<{ draft: ProjectCreationDraftNode; questionsAdded: number; skipped: string | null }>(
      `${base(draftId)}/clarify`, 'POST', { ...payload, providerNoticeAccepted: true },
    ))
}

export function useAnswerAiGuidedQuestions(draftId: string) {
  return useDraftMutation((payload: { version: number; answers: Array<{ questionId: string; answer: string | null }>; continueWithAssumptions: boolean }) =>
    send<{ draft: ProjectCreationDraftNode }>(`${base(draftId)}/answers`, 'POST', payload))
}

export function useGenerateAiGuidedDraft(draftId: string) {
  return useDraftMutation((payload: { version: number; replaceExisting: boolean }) =>
    send<{ draft: ProjectCreationDraftNode; summary: AiGuidedGenerationSummary }>(
      `${base(draftId)}/generate`, 'POST', { ...payload, providerNoticeAccepted: true },
    ))
}

export function usePreviewAiGuidedRevision(draftId: string) {
  return useMutation<{ preview: AiGuidedRevisionPreview }, AiGuidedRequestError, { version: number; instruction: string }>({
    mutationFn: (payload) => send(`${base(draftId)}/revise`, 'POST', { mode: 'PREVIEW', ...payload, providerNoticeAccepted: true }),
  })
}

export function useApplyAiGuidedRevision(draftId: string) {
  return useDraftMutation((payload: { version: number; previewToken: string; acceptConflicts: boolean }) =>
    send<{ draft: ProjectCreationDraftNode; revisionId: string; affectedCount: number; conflictsOverridden: number }>(
      `${base(draftId)}/revise`, 'POST', { mode: 'APPLY', ...payload },
    ))
}

export function useUndoAiGuidedRevision(draftId: string) {
  return useDraftMutation((payload: { version: number; revisionId: string; acceptConflicts: boolean }) =>
    send<{ draft: ProjectCreationDraftNode; restored: number }>(`${base(draftId)}/undo`, 'POST', payload))
}

/**
 * Uploads a DOCX TOR through the import security path (validate → scan → private
 * storage → extraction). Returns the extracted text for the editable TOR field.
 */
export function useUploadAiGuidedTor(draftId: string) {
  return useDraftMutation(async (payload: { version: number; file: File }) => {
    const form = new FormData()
    form.set('version', String(payload.version))
    form.set('file', payload.file)
    const response = await fetch(`${base(draftId)}/tor-upload`, { method: 'POST', body: form })
    const json = await response.json().catch(() => ({}))
    if (!response.ok || json.success === false) {
      throw new AiGuidedRequestError(json.error || `Request failed: ${response.status}`, json.code, response.status, json.details)
    }
    return json.data as { draft: ProjectCreationDraftNode; torText: string; truncated: boolean; extractedCharacters: number }
  })
}

export function useReloadAiGuidedDraft(draftId: string) {
  const queryClient = useQueryClient()
  return useMutation<ProjectCreationDraftNode, AiGuidedRequestError, void>({
    mutationFn: () => send<ProjectCreationDraftNode>(`/api/projects/creation-drafts/${draftId}`, 'GET'),
    onSuccess: (draft) => queryClient.setQueryData(projectKeys.creationDraft(draft.id), draft),
  })
}
