'use client'

import { useQuery } from '@tanstack/react-query'
import type { LinkPreviewData } from '@/lib/link-preview/types'

export type { LinkPreviewData }

interface ApiResponse {
  success: boolean
  data?: LinkPreviewData
  error?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

async function fetchLinkPreview(url: string): Promise<LinkPreviewData> {
  const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`Failed to load link preview (${res.status})`)
  const json: ApiResponse = await res.json()
  if (!json.success || !json.data) throw new Error(json.error || 'Failed to load link preview')
  return json.data
}

export const linkPreviewQueryKey = (url: string) => ['link-preview', url] as const

/**
 * Page metadata for a link preview card (LPV-8). Cached for 24 h per URL, so
 * re-opening a card makes no request; failures are not retried (the card
 * shows its fallback row instead).
 */
export function useLinkPreview(url: string | null | undefined) {
  const query = useQuery({
    queryKey: linkPreviewQueryKey(url ?? ''),
    queryFn: () => fetchLinkPreview(url as string),
    enabled: Boolean(url),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })

  return {
    preview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
