'use client'

/**
 * Route-level loading and error states for the Projects module and the client
 * portal (`app/dashboard/projects/**`, `app/projects/**`, `app/portal/**`).
 *
 * Route files import this file directly rather than the feature barrel: the
 * barrel re-exports every project component, and a loading/error boundary must
 * stay tiny (the portal routes follow the same rule so no internal UI ships to
 * client users).
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { reportClientError } from '@/lib/client-error-report'
import { isStaleChunkRejection, reloadOnceForStaleChunks } from '@/lib/stale-chunk-reload'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'

export interface ProjectRouteErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  /** Tag for the client error report, e.g. `projects.workspace`. */
  source: string
  /** Client-portal boundaries hide the raw message (it may name internal records). */
  showMessage?: boolean
  className?: string
}

export function ProjectRouteError({ error, reset, source, showMessage = true, className }: ProjectRouteErrorProps) {
  const pathname = usePathname()

  // The Gantt, mindmap and charts are lazy chunks; after a deploy an open tab can
  // ask for hashes that no longer exist. Only a document reload recovers.
  useEffect(() => {
    if (isStaleChunkRejection(error)) reloadOnceForStaleChunks()
  }, [error])

  useEffect(() => {
    reportClientError({
      source: `react-error-boundary.${source}`,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: pathname,
    })
  }, [error, error.digest, error.message, error.stack, pathname, source])

  const detail = showMessage && error.message ? error.message : 'Please try again. If it keeps happening, reload the page.'

  return (
    <div role="alert" className={cn('flex min-h-[400px] items-center justify-center px-4 py-8', className)}>
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={error.digest ? `${detail} (Reference: ${error.digest})` : detail}
        action={{ label: 'Try again', onClick: reset }}
      />
    </div>
  )
}

/** Projects list: header, filter bar and project rows. */
export function ProjectListSkeleton() {
  return (
    <div className="space-y-4 p-5" role="status" aria-label="Loading projects">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  )
}

/** Project workspace: tool rail, header and a Gantt-shaped schedule. */
export function ProjectWorkspaceSkeleton({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn('flex gap-3 p-3', fullScreen && 'min-h-screen bg-surface-app')}
      role="status"
      aria-label="Loading project"
    >
      <Skeleton className="hidden h-[70vh] w-12 shrink-0 md:block" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-6 w-20 rounded-pill" />
          <Skeleton className="ml-auto h-8 w-40" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-20 shrink-0" />)}
        </div>
        <div className="rounded-card border border-border bg-surface-card p-2">
          <Skeleton className="mb-2 h-8 w-full" />
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
            <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-6" />)}</div>
            <div className="space-y-2">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-6" style={{ marginLeft: `${(i * 7) % 40}%`, width: `${30 + ((i * 13) % 35)}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Portfolio / template pages: header + stat cards + one wide panel. */
export function ProjectDashboardSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="space-y-4 p-5" role="status" aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonCard />
    </div>
  )
}

/** Client portal: a centred column of cards (matches the portal page width). */
export function PortalSkeleton() {
  return (
    <main className="min-h-screen bg-surface-app px-4 py-6" role="status" aria-label="Loading">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-8 w-24" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  )
}
