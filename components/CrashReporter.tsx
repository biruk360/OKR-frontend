'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { reportClientError, serializeUnknownError } from '@/lib/client-error-report'
import { isStaleDevChunkRejection } from '@/lib/dev-stale-chunk-reload'

/**
 * Global browser listeners + route context for crash troubleshooting.
 */
export function CrashReporter() {
  const pathname = usePathname()

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message || 'ErrorEvent'
      reportClientError({
        source: 'window.error',
        message: msg,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        route: pathname,
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const { message, stack } = serializeUnknownError(event.reason)
      if (isStaleDevChunkRejection(event.reason)) {
        // Stale-chunk reload is handled in Providers; still log for diagnosis.
        reportClientError({
          source: 'unhandledrejection.chunk',
          message,
          stack,
          route: pathname,
        })
        return
      }
      reportClientError({
        source: 'unhandledrejection',
        message,
        stack,
        route: pathname,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [pathname])

  return null
}
