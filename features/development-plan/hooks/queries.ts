'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  developmentApi,
  type DevelopmentApiError,
  type DevelopmentHoursBody,
  type DevelopmentItemWriteBody,
} from '../services/api'

export const developmentKeys = {
  all: ['development-plan'] as const,
  list: (userId: string, timeframeId?: string | null) =>
    ['development-plan', 'list', userId, timeframeId || 'active'] as const,
  detail: (id: string) => ['development-plan', 'detail', id] as const,
}

function noRetryOnClientError(failureCount: number, error: unknown) {
  const status = (error as DevelopmentApiError | undefined)?.status ?? 0
  return !(status >= 400 && status < 500) && failureCount < 3
}

/** GET /api/package/development?userId&timeframeId (items, DEV-3 rule, counts, permissions). */
export function useDevelopmentItems(userId: string, timeframeId?: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: developmentKeys.list(userId, timeframeId),
    queryFn: () => developmentApi.list(userId, timeframeId),
    enabled: !!userId && (options.enabled ?? true),
    retry: noRetryOnClientError,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: developmentKeys.all })
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useCreateDevelopmentItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: developmentApi.create,
    onSuccess: () => {
      invalidate()
      toast.success('Development item added')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not add the development item')),
  })
}

export interface UpdateDevelopmentVariables {
  id: string
  body: DevelopmentItemWriteBody
  /** Toast text on success (status changes say what happened). */
  successMessage?: string
}

export function useUpdateDevelopmentItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: UpdateDevelopmentVariables) => developmentApi.update(id, body),
    onSuccess: (_item, variables) => {
      invalidate()
      toast.success(variables.successMessage ?? 'Development item updated')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the development item')),
  })
}

export function useAddDevelopmentHours() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DevelopmentHoursBody }) => developmentApi.addHours(id, body),
    onSuccess: (result) => {
      invalidate()
      toast.success(`${result.hoursAdded} h logged`)
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not log the hours')),
  })
}
