'use client'

import { useEffect, useRef } from 'react'

/**
 * Fire-and-forget view tracker. POSTs to the appropriate /views endpoint once
 * per mount (deduped per session by the caller's mount cycle; the server further
 * dedupes per (user, entity, day) via upsert).
 *
 * Pass exactly one of objectiveId / keyResultId.
 */
export function useViewTracker(opts: { objectiveId?: string; keyResultId?: string }) {
  const fired = useRef(false)
  const { objectiveId, keyResultId } = opts

  useEffect(() => {
    if (fired.current) return
    if (!objectiveId && !keyResultId) return
    fired.current = true

    const url = objectiveId
      ? `/api/objectives/${objectiveId}/views`
      : `/api/keyresults/${keyResultId}/views`

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Fire and forget — failures are best-effort, do not surface.
      keepalive: true,
    }).catch(() => {
      /* swallow */
    })
  }, [objectiveId, keyResultId])
}

export interface ViewerRow {
  id: string
  name: string
  avatar: string | null
  viewedAt: string
  viewCount: number
}
