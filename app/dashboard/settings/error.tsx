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
      source: 'react-error-boundary.settings',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: pathname,
    })
  }, [error, error.digest, error.message, error.stack, pathname])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-2xl font-bold text-foreground mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  )
}

