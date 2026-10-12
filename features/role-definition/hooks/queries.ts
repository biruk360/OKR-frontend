'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { roleDefinitionApi, type RoleDefinitionApiError, type RoleDefinitionWriteBody } from '../services/api'

export const roleDefinitionKeys = {
  all: ['role-definitions'] as const,
  list: (userId: string, timeframeId?: string | null) =>
    ['role-definitions', 'list', userId, timeframeId || 'none'] as const,
  detail: (id: string) => ['role-definitions', 'detail', id] as const,
}

function noRetryOnClientError(failureCount: number, error: unknown) {
  const status = (error as RoleDefinitionApiError | undefined)?.status ?? 0
  return !(status >= 400 && status < 500) && failureCount < 3
}

/** GET /api/package/role-definitions?userId&timeframeId (current, pending draft, history, ROL-3/4, permissions). */
export function useRoleDefinitions(userId: string, timeframeId?: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: roleDefinitionKeys.list(userId, timeframeId),
    queryFn: () => roleDefinitionApi.list(userId, timeframeId),
    enabled: !!userId && (options.enabled ?? true),
    retry: noRetryOnClientError,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: roleDefinitionKeys.all })
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useCreateRoleDefinition() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: roleDefinitionApi.create,
    onSuccess: () => {
      invalidate()
      toast.success('Role definition saved as draft')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the role definition')),
  })
}

export function useUpdateRoleDefinition() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoleDefinitionWriteBody }) => roleDefinitionApi.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success('Role definition updated')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the role definition')),
  })
}

export function useApproveRoleDefinition() {
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updateDesignation }: { id: string; updateDesignation: boolean }) =>
      roleDefinitionApi.approve(id, { updateDesignation }),
    onSuccess: (result) => {
      invalidate()
      if (result.designationUpdated) {
        // Job title shows in user pickers and the directory.
        qc.invalidateQueries({ queryKey: ['users'] })
      }
      toast.success(result.designationUpdated ? 'Role definition approved and job title updated' : 'Role definition approved')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not approve the role definition')),
  })
}

export function useDeleteRoleDefinition() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => roleDefinitionApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success('Draft deleted')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the draft')),
  })
}
