import { create } from 'zustand'
import type { NotificationRow } from '@/lib/notifications/row'

/**
 * Header bell + notifications page read state.
 *
 * `unreadCount` comes from the server rather than being counted off the loaded
 * page: the bell only holds the newest ~10 rows, so counting locally would show
 * "3" to someone with thirty unread.
 */
export type NotificationItem = NotificationRow

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  loaded: boolean

  fetch: (limit?: number) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  loaded: false,

  fetch: async (limit = 20) => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`)
      const data = await res.json()
      // Standard envelope `{ success, data }`; `data` is `{ items, unreadCount, nextCursor }`.
      if (data?.success && Array.isArray(data.data?.items)) {
        set({
          notifications: data.data.items as NotificationItem[],
          unreadCount: Number(data.data.unreadCount) || 0,
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  markRead: async (id) => {
    const snapshot = get().notifications
    const snapshotCount = get().unreadCount
    const target = snapshot.find((n) => n.id === id)
    if (!target || target.isRead) return

    set({
      notifications: snapshot.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      unreadCount: Math.max(0, snapshotCount - 1),
    })
    try {
      // A 404/403 resolves rather than throwing, so the optimistic update has to
      // be rolled back on !ok too — not only in the catch.
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      })
      if (!res.ok) throw new Error('mark read failed')
    } catch {
      set({ notifications: snapshot, unreadCount: snapshotCount })
    }
  },

  markAllRead: async () => {
    const snapshot = get().notifications
    const snapshotCount = get().unreadCount
    if (snapshotCount === 0 && snapshot.every((n) => n.isRead)) return

    set({ notifications: snapshot.map((n) => ({ ...n, isRead: true })), unreadCount: 0 })
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      if (!res.ok) throw new Error('mark all read failed')
    } catch {
      set({ notifications: snapshot, unreadCount: snapshotCount })
    }
  },
}))
