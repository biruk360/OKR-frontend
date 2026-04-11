'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
import { CrashReporter } from '@/components/CrashReporter'
import { reportClientError, serializeUnknownError } from '@/lib/client-error-report'
import {
  clearStaleChunkReloadGuard,
  isNextChunkScriptError,
  isStaleDevChunkRejection,
  reloadOnceForStaleDevChunks,
} from '@/lib/dev-stale-chunk-reload'

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isStaleDevChunkRejection(e.reason)) return
      reloadOnceForStaleDevChunks()
    }

    const onError = (e: ErrorEvent) => {
      if (!isNextChunkScriptError(e)) return
      reloadOnceForStaleDevChunks()
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError, true)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError, true)
    }
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const t = window.setTimeout(() => clearStaleChunkReloadGuard(), 3000)
    return () => window.clearTimeout(t)
  }, [])

  const [queryClient] = useState(() => {
    const queryCache = new QueryCache({
      onError(error, query) {
        const { message, stack } = serializeUnknownError(error)
        reportClientError({
          source: 'react-query',
          message,
          stack,
          extra: { queryKey: query.queryKey },
        })
      },
    })
    const mutationCache = new MutationCache({
      onError(error, _v, _c, mutation) {
        const { message, stack } = serializeUnknownError(error)
        reportClientError({
          source: 'react-query-mutation',
          message,
          stack,
          extra: { mutationKey: mutation.options.mutationKey },
        })
      },
    })
    return new QueryClient({
      queryCache,
      mutationCache,
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          retry: 1,
        },
      },
    })
  })

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <CrashReporter />
        </Suspense>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  )
}
