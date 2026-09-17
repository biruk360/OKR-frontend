import { create } from 'zustand'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  loaded: boolean

  fetch: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loaded: false,

  fetch: async () => {
    try {
      const res = await fetch('/api/notifications?limit=20')
      const data = await res.json()
      // Standard envelope `{ success, data }`. This read `data.notifications`, which the
      // envelope never carries — the same defect as todo-store had.
      // NOTE: `/api/notifications` (list) and `PATCH /api/notifications/:id` do not exist
      // yet; only `/api/notifications/preferences` does. This store has no consumers, so
      // nothing is currently broken by that — but wiring the header's notification
      // dropdown (docs/design_refresh_IMPLEMENTATION_STRATEGY.md §6.2) means building
      // those routes first. Do not mount this store until they exist.
      if (data.success && Array.isArray(data.data)) {
        const items: NotificationItem[] = data.data
        set({
          notifications: items,
          unreadCount: items.filter((n) => !n.isRead).length,
          loaded: true,
        })
      }
    } catch {
      set({ loaded: true })
    }
  },

  markRead: async (id) => {
    const snapshot = get().notifications
    const updated = snapshot.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    set({ notifications: updated, unreadCount: updated.filter((n) => !n.isRead).length })
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      })
    } catch {
      set({ notifications: snapshot, unreadCount: snapshot.filter((n) => !n.isRead).length })
    }
  },

  markAllRead: async () => {
    const snapshot = get().notifications
    set({
      notifications: snapshot.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' })
    } catch {
      set({ notifications: snapshot, unreadCount: snapshot.filter((n) => !n.isRead).length })
    }
  },
}))
