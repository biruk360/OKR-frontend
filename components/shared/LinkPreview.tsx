'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { useLinkPreview } from '@/hooks'
// Import the client-safe module directly — the `@/lib/link-preview` barrel is server-only.
import { extractPreviewUrls } from '@/lib/link-preview/extract'

/**
 * Link previews (LPV-1..3, LPV-7, LPV-9).
 *
 * `LinkPreviewList` finds up to 3 external URLs in a rich-text body and renders
 * a `LinkPreviewCard` for each. Everything is rendered from API data as text
 * nodes — nothing from a fetched page is ever injected as HTML.
 */

const CARD_BASE = cn(
  'group w-full max-w-[520px] overflow-hidden rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] no-underline',
  'transition-colors duration-[180ms] ease-apple hover:bg-[var(--ap-bg-hover)] motion-reduce:transition-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-accent)]',
)

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

/** 16px favicon; a broken or missing icon becomes a globe (LPV-3, LPV-7). */
function Favicon({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return <Globe aria-hidden className="h-4 w-4 shrink-0 text-[var(--ap-fg-faint)]" strokeWidth={1.75} />
  }
  return (
    // Arbitrary third-party hosts — next/image would need every host allow-listed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
    />
  )
}

function LinkPreviewSkeleton({ url }: { url: string }) {
  return (
    <div
      role="status"
      className="flex w-full max-w-[520px] overflow-hidden rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)]"
    >
      <span className="sr-only">Loading preview for {domainOf(url)}</span>
      <div className="min-w-0 flex-1 space-y-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-4 rounded-sm motion-reduce:animate-none" />
          <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-3.5 w-4/5 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-full motion-reduce:animate-none" />
        <Skeleton className="h-2.5 w-20 motion-reduce:animate-none" />
      </div>
      <Skeleton className="hidden w-[112px] shrink-0 rounded-none motion-reduce:animate-none sm:block" />
    </div>
  )
}

/** Compact single row used when metadata is unavailable — the URL itself stays visible (LPV-3). */
function LinkPreviewFallback({ url, favicon }: { url: string; favicon?: string | null }) {
  const domain = domainOf(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className={cn(CARD_BASE, 'flex items-center gap-2 px-3 py-2')}
    >
      <Favicon key={favicon ?? 'none'} src={favicon} />
      <span className="max-w-[40%] shrink-0 truncate text-xs font-semibold text-[var(--ap-fg-subtle)]">{domain}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--ap-fg-faint)]">{url}</span>
      <ExternalLink aria-hidden className="h-3 w-3 shrink-0 text-[var(--ap-fg-faint)]" strokeWidth={1.75} />
    </a>
  )
}

export function LinkPreviewCard({ url }: { url: string }) {
  const { preview, isLoading, isError } = useLinkPreview(url)
  const [thumbBroken, setThumbBroken] = useState(false)

  if (isLoading) return <LinkPreviewSkeleton url={url} />
  if (isError || !preview || !preview.ok || (!preview.title && !preview.description)) {
    return <LinkPreviewFallback url={url} favicon={preview?.favicon} />
  }

  const domain = preview.domain || domainOf(url)
  const siteName = preview.siteName || domain
  const showThumb = Boolean(preview.image) && !thumbBroken

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className={cn(CARD_BASE, 'flex flex-col sm:flex-row')}
    >
      <div className="min-w-0 flex-1 space-y-1 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Favicon key={preview.favicon ?? 'none'} src={preview.favicon} />
          <span className="truncate text-xs font-semibold text-[var(--ap-fg-subtle)]">{siteName}</span>
        </div>
        {preview.title && (
          <p className="line-clamp-2 break-words text-sm font-semibold leading-[1.35] text-[var(--ap-fg)]">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="line-clamp-2 break-words text-body-sm leading-[1.45] text-[var(--ap-fg-muted)]">
            {preview.description}
          </p>
        )}
        <div className="flex min-w-0 items-center gap-1 pt-0.5 text-xs text-[var(--ap-fg-faint)]">
          <ExternalLink aria-hidden className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{domain}</span>
        </div>
      </div>
      {showThumb && (
        <div className="order-first h-32 w-full shrink-0 bg-[var(--ap-bg-sunken)] sm:order-last sm:h-auto sm:min-h-[96px] sm:w-[112px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.image as string}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setThumbBroken(true)}
            className="h-full w-full object-cover"
          />
        </div>
      )}
    </a>
  )
}

export interface LinkPreviewListProps {
  /** Rich-text HTML (or legacy plain text) to scan for links. */
  html: string | null | undefined
  className?: string
}

/** Preview cards for up to 3 external links in `html`; renders nothing when there are none (LPV-1). */
export function LinkPreviewList({ html, className }: LinkPreviewListProps) {
  const urls = useMemo(
    () =>
      extractPreviewUrls(html ?? '', {
        origin: typeof window === 'undefined' ? undefined : window.location.origin,
      }),
    [html],
  )
  if (urls.length === 0) return null
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {urls.map((url) => (
        <LinkPreviewCard key={url} url={url} />
      ))}
    </div>
  )
}

export default LinkPreviewList
