'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { dutiesApi, type DutyWriteBody } from '../services/api'
import type { DutyAction } from '../services/schemas'

export const dutyKeys = {
  all: ['package', 'duties'] as const,
  list: (userId: string, timeframeId?: string) => ['package', 'duties', 'list', userId, timeframeId ?? 'all'] as const,
  detail: (id: string) => ['package', 'duties', 'detail', id] as const,
}

/** A person's duties for a timeframe, with `permissions`. 403 is final (no retries). */
export function useDuties(userId: string, timeframeId?: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dutyKeys.list(userId, timeframeId),
    queryFn: () => dutiesApi.list({ userId, timeframeId }),
    enabled: opts.enabled ?? Boolean(userId),
    retry: (count, error) => {
      const status = (error as { status?: number })?.status
      return status !== 403 && status !== 404 && count < 2
    },
  })
}

function useInvalidateDuties() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: dutyKeys.all })
}

export function useCreateDuty() {
  const invalidate = useInvalidateDuties()
  return useMutation({
    mutationFn: (body: DutyWriteBody) => dutiesApi.create(body),
    onSuccess: () => {
      invalidate()
      toast.success('Duty added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateDuty() {
  const invalidate = useInvalidateDuties()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DutyWriteBody }) => dutiesApi.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success('Duty updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

const ACTION_DONE: Record<DutyAction, string> = {
  pause: 'Duty paused',
  resume: 'Duty resumed',
  retire: 'Duty retired',
}

export function useDutyAction() {
  const invalidate = useInvalidateDuties()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: DutyAction }) => dutiesApi.action(id, action),
    onSuccess: (_data, vars) => {
      invalidate()
      toast.success(ACTION_DONE[vars.action])
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteDuty() {
  const invalidate = useInvalidateDuties()
  return useMutation({
    mutationFn: (id: string) => dutiesApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success('Duty deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useLogDutyOccurrence() {
  const invalidate = useInvalidateDuties()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; dueDate?: string | null; completed?: boolean; note?: string | null }) =>
      dutiesApi.log(id, body),
    onSuccess: (_data, vars) => {
      invalidate()
      toast.success(vars.completed ? 'Occurrence logged as done' : 'Occurrence added to your to-dos')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
