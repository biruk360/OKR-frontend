'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  decisionApi,
  decisionListParams,
  type DecideBody,
  type DecisionApiError,
  type DecisionListFilters,
  type DecisionUpdateBody,
} from '../services/api'

export const decisionKeys = {
  all: ['decisions'] as const,
  list: (filters: DecisionListFilters) => ['decisions', 'list', decisionListParams(filters)] as const,
  detail: (id: string) => ['decisions', 'detail', id] as const,
}

function noRetryOnClientError(failureCount: number, error: unknown) {
  const status = (error as DecisionApiError | undefined)?.status ?? 0
  return !(status >= 400 && status < 500) && failureCount < 3
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** GET /api/decisions with filters. */
export function useDecisions(filters: DecisionListFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: decisionKeys.list(filters),
    queryFn: () => decisionApi.list(filters),
    enabled: options.enabled ?? true,
    retry: noRetryOnClientError,
  })
}

/** DEC-1: OPEN decisions where `deciderId` (default: the viewer) decides. */
export function useAwaitingDecisions(deciderId: string = 'me', options: { enabled?: boolean } = {}) {
  return useDecisions({ deciderId, status: ['OPEN'], limit: 500 }, options)
}

/**
 * DEC-3: decisions affecting a person: the selected timeframe's decisions plus
 * still-open ones from any timeframe (an undecided request keeps blocking).
 */
export function useDecisionsAffecting(userId: string, timeframeId?: string | null, options: { enabled?: boolean } = {}) {
  return useDecisions(
    { affectingUserId: userId, timeframeId: timeframeId || undefined, openAnyTimeframe: !!timeframeId, limit: 500 },
    { enabled: !!userId && (options.enabled ?? true) },
  )
}

export function useDecision(id: string | null | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: decisionKeys.detail(id ?? ''),
    queryFn: () => decisionApi.get(id!),
    enabled: !!id && (options.enabled ?? true),
    retry: noRetryOnClientError,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return (opts: { dependencies?: boolean } = {}) => {
    void qc.invalidateQueries({ queryKey: decisionKeys.all })
    // Connection chips show open decisions and blocked flags.
    void qc.invalidateQueries({ queryKey: ['connections'] })
    if (opts.dependencies) {
      void qc.invalidateQueries({ queryKey: ['work-dependencies'] })
      void qc.invalidateQueries({ queryKey: ['dependencies'] })
    }
  }
}

export function useCreateDecision() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: decisionApi.create,
    onSuccess: () => {
      invalidate()
      toast.success('Decision requested')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not request the decision')),
  })
}

export function useUpdateDecision() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecisionUpdateBody }) => decisionApi.update(id, body),
    onSuccess: (_data, variables) => {
      invalidate()
      const status = variables.body.status
      toast.success(
        status === 'WITHDRAWN'
          ? 'Request withdrawn'
          : status === 'DEFERRED'
            ? 'Decision deferred'
            : status === 'OPEN'
              ? 'Decision reopened'
              : 'Decision updated',
      )
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the decision')),
  })
}

export function useDecideDecision() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecideBody }) => decisionApi.decide(id, body),
    onSuccess: (result) => {
      invalidate({ dependencies: result.closedDependencyIds.length > 0 })
      const n = result.closedDependencyIds.length
      toast.success(n > 0 ? `Decision recorded · ${n} dependenc${n === 1 ? 'y' : 'ies'} marked done` : 'Decision recorded')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not record the decision')),
  })
}
