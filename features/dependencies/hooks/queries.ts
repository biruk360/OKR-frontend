'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { DEPENDENCY_STATUS_LABELS } from '@/types/package'
import { dependenciesApi, type DependencyApiError, type PersonDependencyParams } from '../services/api'
import type { DependencyListFilters, DependencyStatusBody, DependencyWriteBody } from '../types'

export const dependencyKeys = {
  all: ['work-dependencies'] as const,
  list: (filters: DependencyListFilters) => ['work-dependencies', 'list', filters] as const,
  person: (params: PersonDependencyParams) =>
    ['work-dependencies', 'person', params.userId, params.timeframeId ?? 'all', params.includeClosed === false ? 'open' : 'all'] as const,
  detail: (id: string) => ['work-dependencies', 'detail', id] as const,
}

/** 403 / 404 will not change on retry. */
function retryUnlessDenied(failureCount: number, error: unknown) {
  const status = (error as DependencyApiError | null)?.status
  return status !== 403 && status !== 404 && failureCount < 2
}

export function useDependencies(filters: DependencyListFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dependencyKeys.list(filters),
    queryFn: () => dependenciesApi.list(filters),
    enabled: options.enabled ?? true,
    retry: retryUnlessDenied,
  })
}

export function usePersonDependencies(params: PersonDependencyParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dependencyKeys.person(params),
    queryFn: () => dependenciesApi.person(params),
    enabled: (options.enabled ?? true) && Boolean(params.userId),
    retry: retryUnlessDenied,
  })
}

export function useDependency(id: string | null) {
  return useQuery({
    queryKey: dependencyKeys.detail(id ?? 'none'),
    queryFn: () => dependenciesApi.get(id as string),
    enabled: Boolean(id),
    retry: retryUnlessDenied,
  })
}

function useInvalidateDependencies() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: dependencyKeys.all })
}

export function useCreateDependency() {
  const invalidate = useInvalidateDependencies()
  return useMutation({
    mutationFn: (body: DependencyWriteBody) => dependenciesApi.create(body),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.deliveryTask ? 'Dependency and delivery task created' : 'Dependency created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateDependency() {
  const invalidate = useInvalidateDependencies()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DependencyWriteBody }) => dependenciesApi.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success('Dependency updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSetDependencyStatus() {
  const invalidate = useInvalidateDependencies()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DependencyStatusBody }) => dependenciesApi.setStatus(id, body),
    onSuccess: (result, variables) => {
      invalidate()
      if (!result.changed) return
      const label = DEPENDENCY_STATUS_LABELS[variables.body.status]
      toast.success(result.notifiedNeeders ? `Marked ${label.toLowerCase()} — needers notified` : `Marked ${label.toLowerCase()}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCreateDeliveryTask() {
  const invalidate = useInvalidateDependencies()
  return useMutation({
    mutationFn: (id: string) => dependenciesApi.createDeliveryTask(id),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.created ? 'Delivery task created' : 'Delivery task already exists')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
