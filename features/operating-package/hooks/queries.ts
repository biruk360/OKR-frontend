'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  operatingPackageApi,
  type PackageApiError,
  type PackageCreateBody,
  type PackageReviewBody,
  type PackageUpdateBody,
} from '../services/api'

export const operatingPackageKeys = {
  all: ['operating-package'] as const,
  header: (userId: string, timeframeId: string) => ['operating-package', 'header', userId, timeframeId] as const,
  reviews: (packageId: string) => ['operating-package', 'reviews', packageId] as const,
}

function noRetryOnClientError(failureCount: number, error: unknown) {
  const status = (error as PackageApiError | undefined)?.status ?? 0
  return !(status >= 400 && status < 500) && failureCount < 3
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** GET /api/package/packages?userId&timeframeId — header, PKG-2 summary, permissions. */
export function useOperatingPackage(
  userId: string,
  timeframeId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: operatingPackageKeys.header(userId, timeframeId ?? ''),
    queryFn: () => operatingPackageApi.get(userId, timeframeId as string),
    enabled: !!userId && !!timeframeId && (options.enabled ?? true),
    retry: noRetryOnClientError,
  })
}

/**
 * GET /api/package/packages/[id]/reviews. Shared by every PackageReviewControls
 * on a page — TanStack Query dedupes them into one request per package.
 */
export function usePackageReviews(packageId: string | null | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: operatingPackageKeys.reviews(packageId ?? ''),
    queryFn: () => operatingPackageApi.reviews(packageId as string),
    enabled: !!packageId && (options.enabled ?? true),
    retry: noRetryOnClientError,
    staleTime: 30_000,
  })
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: operatingPackageKeys.all })
}

export function useCreatePackage() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (body: PackageCreateBody) => operatingPackageApi.create(body),
    onSuccess: () => {
      invalidate()
      toast.success('Operating package created')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not create the package')),
  })
}

export function useUpdatePackage() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PackageUpdateBody }) => operatingPackageApi.update(id, body),
    onSuccess: (_data, variables) => {
      invalidate()
      const status = variables.body.status
      toast.success(status === 'ARCHIVED' ? 'Package archived' : status === 'DRAFT' ? 'Package reopened as a draft' : 'Package updated')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the package')),
  })
}

export function useSubmitPackage() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => operatingPackageApi.submit(id),
    onSuccess: () => {
      invalidate()
      toast.success('Package sent for review')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send the package for review')),
  })
}

export function useApprovePackage() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => operatingPackageApi.approve(id),
    onSuccess: () => {
      invalidate()
      toast.success('Operating package approved')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not approve the package')),
  })
}

export function useReviewPackageItem() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ packageId, body }: { packageId: string; body: PackageReviewBody }) =>
      operatingPackageApi.review(packageId, body),
    onSuccess: (_data, variables) => {
      invalidate()
      toast.success(variables.body.verdict === 'DISPUTE' ? 'Dispute recorded — your manager will be notified' : 'Marked as agreed')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save your review')),
  })
}

export function useResolvePackageDispute() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ packageId, reviewId, resolution }: { packageId: string; reviewId: string; resolution: string }) =>
      operatingPackageApi.resolve(packageId, reviewId, resolution),
    onSuccess: () => {
      invalidate()
      toast.success('Dispute resolved')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not resolve the dispute')),
  })
}
