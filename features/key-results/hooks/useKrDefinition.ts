'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { UpdateKrDefinitionInput } from '../components/checkpoints/checkpoint-types'
import { krCheckpointKeys, krCheckpointsApi } from './krCheckpointsApi'
import { useKrCheckpoints } from './useKrCheckpoints'

/**
 * KRX-4 definition for one KR plus whether the viewer may edit it. Reads the
 * checkpoints payload (one request per KR for strip + definition).
 */
export function useKrDefinition(keyResultId: string | null | undefined, opts: { enabled?: boolean } = {}) {
  const query = useKrCheckpoints(keyResultId, opts)
  return {
    ...query,
    definition: query.data?.definition ?? null,
    isRedacted: query.data?.isRedacted ?? false,
    isLocked: query.data?.isLocked ?? false,
    canEdit: query.data?.permissions.canEditDefinition ?? false,
  }
}

/** Save definition fields through PATCH /api/keyresults/[id]. */
export function useUpdateKrDefinition(keyResultId: string, opts: { onSaved?: () => void } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateKrDefinitionInput) => krCheckpointsApi.updateDefinition(keyResultId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: krCheckpointKeys.detail(keyResultId) })
      toast.success('Definition saved')
      opts.onSaved?.()
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
