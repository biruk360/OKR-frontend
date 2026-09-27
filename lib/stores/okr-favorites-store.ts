import { create } from 'zustand'
import toast from 'react-hot-toast'

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
    const isFav = get().ids.has(objectiveId)
    // Optimistic update.
    const next = new Set(get().ids)
    if (isFav) next.delete(objectiveId)
    else next.add(objectiveId)
    set({ ids: next })
    try {
      // A 4xx/5xx resolves rather than throwing, so check `ok` — otherwise the
      // star stays flipped while the server never saved it.
      const res = isFav
        ? await fetch(
            `/api/favorites?entityType=OBJECTIVE&entityId=${encodeURIComponent(objectiveId)}`,
            { method: 'DELETE' },
          )
        : await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: 'OBJECTIVE', entityId: objectiveId }),
          })
      if (!res.ok) throw new Error(`favorite ${isFav ? 'remove' : 'add'} failed (${res.status})`)
    } catch {
      // Revert only this id (other toggles may have landed meanwhile) and tell the user.
      const reverted = new Set(get().ids)
      if (isFav) reverted.add(objectiveId)
      else reverted.delete(objectiveId)
      set({ ids: reverted })
      toast.error(isFav ? 'Could not remove from favorites' : 'Could not add to favorites')
    }
  },

  isFavorite: (id) => get().ids.has(id),
}))
