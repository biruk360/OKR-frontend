import { create } from 'zustand'

/**
 * Global "open initiative" store.
 *
 * Anywhere in the app can call `useInitiativeDetailStore.getState().open(id)`
 * (or the hook's `open(id)`) to pop the rich initiative modal/sidebar mounted
 * once at the dashboard layout level. Click handlers on initiative cards in
 * kanbans, lists, or hierarchy tables go through this store instead of
 * navigating away.
 */
interface InitiativeDetailState {
  openId: string | null
  /** Bumped after a successful save so subscribers can refresh derived data. */
  lastChangeAt: number | null
  open: (id: string) => void
  close: () => void
  /** Notify others that the open initiative was mutated (used by kanban/list to refetch). */
  markChanged: () => void
}

export const useInitiativeDetailStore = create<InitiativeDetailState>((set) => ({
  openId: null,
  lastChangeAt: null,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
  markChanged: () => set({ lastChangeAt: Date.now() }),
}))
