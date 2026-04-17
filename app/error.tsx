'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { reportClientError } from '@/lib/client-error-report'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()

  useEffect(() => {
    reportClientError({
      source: 'react-error-boundary.root',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: pathname,
    })
  }, [error, error.digest, error.message, error.stack, pathname])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-md text-center text-muted-foreground text-sm">{error.message}</p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  )
}
