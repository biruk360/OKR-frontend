import { create } from 'zustand'

interface UserPrefsState {
  todoViewMode: 'modal' | 'sidebar'
  loaded: boolean

  load: () => Promise<void>
  setTodoViewMode: (mode: 'modal' | 'sidebar') => Promise<void>
}

export const useUserPrefsStore = create<UserPrefsState>((set, get) => ({
  todoViewMode: 'modal',
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const res = await fetch('/api/user-preferences')
      const data = await res.json()
      if (data.success && data.preferences?.todoViewMode) {
        set({ todoViewMode: data.preferences.todoViewMode, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
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
