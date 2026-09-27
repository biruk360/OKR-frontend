import { create } from 'zustand'
import toast from 'react-hot-toast'

interface UserPrefsState {
  todoViewMode: 'modal' | 'sidebar'
  /** Draw textures over label/cover colours so hue is never the only signal. */
  colorBlindMode: boolean
  loaded: boolean

  load: () => Promise<void>
  setTodoViewMode: (mode: 'modal' | 'sidebar') => Promise<void>
  setColorBlindMode: (on: boolean) => Promise<void>
}

/**
 * PATCH a preference after the optimistic update. Display preferences stay
 * applied for this session when the network is unavailable (the write is simply
 * unsaved), but a 4xx/5xx means the server rejected or failed the write, so the
 * optimistic value is rolled back. Either way the user is told it wasn't saved.
 */
async function persistPref(patch: Record<string, unknown>, rollback: () => void): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/user-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  } catch {
    toast.error('Preference applied, but could not be saved (offline?)')
    return
  }
  if (!res.ok) {
    rollback()
    toast.error('Could not save your preference')
  }
}

export const useUserPrefsStore = create<UserPrefsState>((set, get) => ({
  todoViewMode: 'modal',
  colorBlindMode: false,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const res = await fetch('/api/user-preferences')
      const data = await res.json()
      if (data.success && data.data) {
        set({
          ...(data.data.todoViewMode && { todoViewMode: data.data.todoViewMode }),
          colorBlindMode: Boolean(data.data.colorBlindMode),
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  setColorBlindMode: async (on) => {
    const previous = get().colorBlindMode
    set({ colorBlindMode: on })
    await persistPref({ colorBlindMode: on }, () => {
      // Only undo if nothing newer has been applied since.
      if (get().colorBlindMode === on) set({ colorBlindMode: previous })
    })
  },

  setTodoViewMode: async (mode) => {
    const previous = get().todoViewMode
    set({ todoViewMode: mode })
    await persistPref({ todoViewMode: mode }, () => {
      if (get().todoViewMode === mode) set({ todoViewMode: previous })
    })
  },
}))
