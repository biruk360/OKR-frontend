'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type {
  CreateKrCheckpointInput,
  KrCheckpointsPayload,
  UpdateKrCheckpointInput,
} from '../components/checkpoints/checkpoint-types'
import { krCheckpointKeys, krCheckpointsApi, type KrApiError } from './krCheckpointsApi'

/**
 * KR checkpoints + definition + permissions for one KR
 * (`GET /api/keyresults/[id]/checkpoints`). `useKrDefinition` reads the same
 * query, so a page that mounts both the strip and the definition fetches once.
 */
export function useKrCheckpoints(keyResultId: string | null | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery<KrCheckpointsPayload, KrApiError>({
    queryKey: krCheckpointKeys.detail(keyResultId ?? ''),
    queryFn: () => krCheckpointsApi.list(keyResultId as string),
    enabled: !!keyResultId && opts.enabled !== false,
    staleTime: 30_000,
    // 403/404 will not change on retry.
    retry: (count, error) => ![403, 404].includes(error?.status ?? 0) && count < 2,
  })
}

function useInvalidate(keyResultId: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: krCheckpointKeys.detail(keyResultId) })
}

export function useCreateKrCheckpoint(keyResultId: string) {
  const invalidate = useInvalidate(keyResultId)
  return useMutation({
    mutationFn: (body: CreateKrCheckpointInput) => krCheckpointsApi.create(keyResultId, body),
    onSuccess: () => {
      void invalidate()
      toast.success('Checkpoint added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateKrCheckpoint(keyResultId: string) {
  const invalidate = useInvalidate(keyResultId)
  return useMutation({
    mutationFn: ({ checkpointId, body }: { checkpointId: string; body: UpdateKrCheckpointInput }) =>
      krCheckpointsApi.update(keyResultId, checkpointId, body),
    onSuccess: () => {
      void invalidate()
      toast.success('Checkpoint updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteKrCheckpoint(keyResultId: string) {
  const invalidate = useInvalidate(keyResultId)
  return useMutation({
    mutationFn: (checkpointId: string) => krCheckpointsApi.remove(keyResultId, checkpointId),
    onSuccess: () => {
      void invalidate()
      toast.success('Checkpoint deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
