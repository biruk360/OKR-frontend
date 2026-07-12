'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { EvaluationActivityEntry } from '../types'

/**
 * Self-contained UI-extra hooks (mirrors useTemplateSettings.ts) so the shared
 * services/api.ts and hooks/queries.ts stay untouched by concurrent work.
 */

type Envelope<T> = { success?: boolean; data?: T; error?: string } | null

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const json = await response.json().catch(() => null) as Envelope<T>
  if (!response.ok || !json?.success) {
    const error = new Error(json?.error ?? `Request failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return json.data as T
}

/**
 * Audit trail for one evaluation via GET /api/performance/evaluations/[id]/activity.
 * The API is restricted to performance admins and lead evaluators (calibration
 * access) and returns 403 otherwise — the query is non-retrying so consumers
 * can simply hide the view on error.
 */
export function useEvaluationActivity(evaluationId: string, enabled = true) {
  return useQuery({
    queryKey: ['performance', 'evaluation-activity', evaluationId],
    queryFn: () => requestJson<EvaluationActivityEntry[]>(`/api/performance/evaluations/${evaluationId}/activity`),
    enabled: enabled && !!evaluationId,
    retry: false,
  })
}

/**
 * Excuse an evaluation via POST /api/performance/evaluations/[id]/excuse
 * (admin-only; body `{ reason }`; the server 400s on invalid state and 403s
 * on missing permission — errors surface as toasts).
 */
export function useExcuseEvaluation(evaluationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestJson<unknown>(`/api/performance/evaluations/${evaluationId}/excuse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance', 'evaluation', evaluationId] })
      client.invalidateQueries({ queryKey: ['performance', 'evaluations'] })
      client.invalidateQueries({ queryKey: ['performance', 'evaluation-activity', evaluationId] })
      toast.success('Evaluation excused')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
