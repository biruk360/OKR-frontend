'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectCreationAssumptionDecision,
  ProjectCreationAssumptionScope,
} from '@/lib/projects/creation-assumption-decisions'
import { projectKeys, type ProjectCreationDraftNode } from '../../hooks/useProjects'

export interface BulkAssumptionDecisionPayload {
  version: number
  decision: ProjectCreationAssumptionDecision
  scope: ProjectCreationAssumptionScope
  /** The count the PM saw in the confirmation dialog. */
  expectedCount: number
}

/** One explicit, confirmed PM decision over many AI proposals (atomic + audited once). */
export function useBulkAssumptionDecision(draftId: string) {
  const queryClient = useQueryClient()
  return useMutation<{ draft: ProjectCreationDraftNode; count: number }, Error, BulkAssumptionDecisionPayload>({
    mutationFn: async (payload) => {
      const response = await fetch(`/api/projects/creation-drafts/${draftId}/assumptions/bulk-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || json.success === false) {
        throw new Error(json.error || `Request failed: ${response.status}`)
      }
      return json.data as { draft: ProjectCreationDraftNode; count: number }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(projectKeys.creationDraft(result.draft.id), result.draft)
    },
  })
}
