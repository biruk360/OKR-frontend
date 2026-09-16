import { create } from 'zustand'

interface UserPrefsState {
  todoViewMode: 'modal' | 'sidebar'
  /** Draw textures over label/cover colours so hue is never the only signal. */
  colorBlindMode: boolean
  loaded: boolean

  load: () => Promise<void>
  setTodoViewMode: (mode: 'modal' | 'sidebar') => Promise<void>
  setColorBlindMode: (on: boolean) => Promise<void>
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
    // Optimistic: the toggle is a display preference, so a failed write should
    // not block the user from seeing the change take effect this session.
    set({ colorBlindMode: on })
    try {
      await fetch('/api/user-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorBlindMode: on }),
      })
    } catch {}
  },

  setTodoViewMode: async (mode) => {
    set({ todoViewMode: mode })
    try {
      await fetch('/api/user-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoViewMode: mode }),
      })
    } catch {}
  },
}))
