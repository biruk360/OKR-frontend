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
      if (data.success) {
        const items: NotificationItem[] = data.notifications || []
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
