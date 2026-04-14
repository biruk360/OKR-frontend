import { create } from 'zustand'

/**
 * Favorited OKR objectives (star / watch). Backed by the `favorites` table
 * (portable across devices) with a one-time migration from the old
 * `okr.plans.favorites` localStorage key used by /dashboard/plans.
 */
interface OkrFavoritesState {
  ids: Set<string>
  loaded: boolean
  load: () => Promise<void>
  toggle: (objectiveId: string) => Promise<void>
  isFavorite: (objectiveId: string) => boolean
}

const LEGACY_KEY = 'okr.plans.favorites'
const MIGRATED_FLAG = 'okr.favorites.migrated'

export const useOkrFavoritesStore = create<OkrFavoritesState>((set, get) => ({
  ids: new Set<string>(),
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      // Pull server-side favorites first.
      const res = await fetch('/api/favorites?entityType=OBJECTIVE')
      const data = await res.json()
      const serverIds: string[] = data?.success && Array.isArray(data?.data?.ids) ? data.data.ids : []

      // One-time migration: if legacy localStorage has entries and we haven't
      // migrated yet, upload each missing id. Silent on failure.
      try {
        if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATED_FLAG)) {
          const rawLegacy = localStorage.getItem(LEGACY_KEY)
          if (rawLegacy) {
            const legacy: string[] = JSON.parse(rawLegacy) || []
            const toAdd = legacy.filter((id) => !serverIds.includes(id))
            await Promise.all(
              toAdd.map((id) =>
                fetch('/api/favorites', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entityType: 'OBJECTIVE', entityId: id }),
                }).catch(() => {}),
              ),
            )
            for (const id of toAdd) serverIds.push(id)
            localStorage.removeItem(LEGACY_KEY)
          }
          localStorage.setItem(MIGRATED_FLAG, '1')
        }
      } catch {}

      set({ ids: new Set(serverIds), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  toggle: async (objectiveId) => {
    const current = get().ids
    const isFav = current.has(objectiveId)
    // Optimistic update.
    const next = new Set(current)
    if (isFav) next.delete(objectiveId)
    else next.add(objectiveId)
    set({ ids: next })
    try {
      if (isFav) {
        await fetch(
          `/api/favorites?entityType=OBJECTIVE&entityId=${encodeURIComponent(objectiveId)}`,
          { method: 'DELETE' },
        )
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType: 'OBJECTIVE', entityId: objectiveId }),
        })
      }
    } catch {
      // Revert on failure.
      set({ ids: current })
    }
  },

  isFavorite: (id) => get().ids.has(id),
}))
