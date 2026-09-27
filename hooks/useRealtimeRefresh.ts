'use client'

/**
 * useRealtimeRefresh — subscribe to a Pusher channel and call `onRefresh`
 * (typically a React Query invalidation) when any of `events` arrives.
 *
 * The payload is treated as a SIGNAL, not as data: the caller refetches the
 * authoritative state instead of patching its cache from the event. That keeps
 * permission filtering, redaction and derived fields on the server.
 *
 * Behaviour:
 *   - Debounced: a burst of events (a drag that moves five cards, a bulk
 *     import) produces one refresh `debounceMs` after the last event, and never
 *     later than `maxWaitMs` after the first.
 *   - Own actions: when `ignoreActorId` is set, events whose payload carries
 *     `actorId === ignoreActorId` are skipped — the tab that made the change
 *     already updated optimistically and invalidated its own data. (Another tab
 *     of the same user is skipped too; it catches up on its next refetch.)
 *   - Deferral: `shouldDefer()` returning true (e.g. mid-drag) postpones the
 *     refresh until it returns false, so a refetch cannot yank a card out from
 *     under the pointer.
 *   - Reconnect: after the socket reconnects, Pusher re-subscribes; events
 *     sent while offline are lost, so one refresh runs then.
 *   - Degrades silently: with placeholder/missing credentials
 *     (`getPusherClient()` → null, see `isUsableCred` in lib/pusher.ts) the hook
 *     does nothing. If channel authorisation fails (403, or 503 when the server
 *     has no credentials) it unsubscribes once — no retry loop, no toast.
 *
 * Callers pass a stable channel name; private channels (`private-*`) must be
 * authorised in app/api/pusher/auth/route.ts.
 */

import { useEffect, useRef } from 'react'
import { getPusherClient } from '@/lib/pusher'

export interface UseRealtimeRefreshOptions {
  /** Channel to subscribe to. Null/undefined disables the hook. */
  channel: string | null | undefined
  /** Event names that trigger a refresh. */
  events: readonly string[]
  /** Called (debounced) after matching events. */
  onRefresh: () => void
  /** Quiet period before refreshing. Default 400 ms. */
  debounceMs?: number
  /** Upper bound on the delay during a continuous stream. Default 2000 ms. */
  maxWaitMs?: number
  /** Skip events whose payload `actorId` equals this id. */
  ignoreActorId?: string | null
  /** Return true to postpone a due refresh (re-checked every `debounceMs`). */
  shouldDefer?: () => boolean
  /** Default true. */
  enabled?: boolean
}

function actorOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const a = (payload as { actorId?: unknown }).actorId
  return typeof a === 'string' ? a : null
}

export function useRealtimeRefresh({
  channel,
  events,
  onRefresh,
  debounceMs = 400,
  maxWaitMs = 2000,
  ignoreActorId,
  shouldDefer,
  enabled = true,
}: UseRealtimeRefreshOptions): void {
  // Latest callbacks without re-subscribing on every render.
  const onRefreshRef = useRef(onRefresh)
  const shouldDeferRef = useRef(shouldDefer)
  const ignoreRef = useRef(ignoreActorId)
  useEffect(() => {
    onRefreshRef.current = onRefresh
    shouldDeferRef.current = shouldDefer
    ignoreRef.current = ignoreActorId
  })

  const eventsKey = events.join('\u0000')

  useEffect(() => {
    if (!enabled || !channel) return
    const client = getPusherClient()
    if (!client) return

    const eventNames = eventsKey ? eventsKey.split('\u0000') : []
    let timer: ReturnType<typeof setTimeout> | null = null
    let firstEventAt: number | null = null
    let subscribedOnce = false
    let disposed = false

    const fire = () => {
      timer = null
      if (disposed) return
      if (shouldDeferRef.current?.()) {
        timer = setTimeout(fire, debounceMs)
        return
      }
      firstEventAt = null
      try {
        onRefreshRef.current()
      } catch (err) {
        console.error('[useRealtimeRefresh] refresh failed:', err)
      }
    }

    const schedule = () => {
      const now = Date.now()
      if (firstEventAt === null) firstEventAt = now
      if (timer) clearTimeout(timer)
      const wait = Math.max(0, Math.min(debounceMs, firstEventAt + maxWaitMs - now))
      timer = setTimeout(fire, wait)
    }

    const onEvent = (payload: unknown) => {
      const self = ignoreRef.current
      if (self && actorOf(payload) === self) return
      schedule()
    }

    const onSubscribed = () => {
      // The first success is the initial subscribe; later ones follow a
      // reconnect, when anything sent in between was missed.
      if (subscribedOnce) schedule()
      subscribedOnce = true
    }

    const onSubscriptionError = (status: unknown) => {
      // 403 (not allowed) or 503 (server realtime off). Either way retrying
      // will not help; drop the subscription quietly and keep polling-free.
      console.warn(`[realtime] subscription to ${channel} refused`, status)
      try {
        client.unsubscribe(channel)
      } catch { /* already gone */ }
    }

    let ch: ReturnType<typeof client.subscribe>
    try {
      ch = client.subscribe(channel)
    } catch (err) {
      console.warn('[realtime] subscribe failed:', err)
      return
    }
    for (const name of eventNames) ch.bind(name, onEvent)
    ch.bind('pusher:subscription_succeeded', onSubscribed)
    ch.bind('pusher:subscription_error', onSubscriptionError)

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      for (const name of eventNames) ch.unbind(name, onEvent)
      ch.unbind('pusher:subscription_succeeded', onSubscribed)
      ch.unbind('pusher:subscription_error', onSubscriptionError)
      try {
        client.unsubscribe(channel)
      } catch { /* already gone */ }
    }
  }, [channel, eventsKey, debounceMs, maxWaitMs, enabled])
}

export default useRealtimeRefresh
