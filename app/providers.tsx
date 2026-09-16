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
  isStaleChunkRejection,
  reloadOnceForStaleChunks,
} from '@/lib/stale-chunk-reload'

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  // Runs in production too. A deploy rebuilds every chunk hash, so a tab opened
  // before it requests files that no longer exist; gating this to development
  // meant production users hit "Loading chunk N failed" with no recovery but a
  // manual hard reload.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isStaleChunkRejection(e.reason)) return
      reloadOnceForStaleChunks()
    }

    const onError = (e: ErrorEvent) => {
      if (!isNextChunkScriptError(e)) return
      reloadOnceForStaleChunks()
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError, true)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError, true)
    }
  }, [])

  // A healthy render means the current build loaded, so re-arm the one-shot
  // guard for the next deploy.
  useEffect(() => {
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
