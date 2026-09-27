'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { reportClientError } from '@/lib/client-error-report'
import { isStaleChunkRejection, reloadOnceForStaleChunks } from '@/lib/stale-chunk-reload'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()

  // Same stale-chunk recovery as app/dashboard/error.tsx: after a deploy only a
  // document reload fetches a chunk map that exists.
  useEffect(() => {
    if (isStaleChunkRejection(error)) reloadOnceForStaleChunks()
  }, [error])

  useEffect(() => {
    reportClientError({
      source: 'react-error-boundary.settings',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: pathname,
    })
  }, [error, error.digest, error.message, error.stack, pathname])

  return (
    <div role="alert" className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-section-title text-foreground mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}

