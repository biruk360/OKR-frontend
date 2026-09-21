'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { Inbox } from 'lucide-react'
import { notificationIcon, notificationTypeLabel } from '@/components/shared/notification-icon'
import { useNotificationStore } from '@/lib/stores/notification-store'
import { cn } from '@/lib/utils'

/**
 * The sprint board's Inbox view.
 *
 * This tab used to render "Inbox is coming soon" — a selectable nav destination
 * that went nowhere. It promised "unread mentions, reviews, and assignments",
 * which is what the notification feed already holds; it only lacked a read API.
 * Now that GET /api/notifications exists it shows the real feed, and shares the
 * store with the header bell so marking something read updates both.
 */
export default function SprintInboxView({ dark }: { dark?: boolean }) {
  const router = useRouter()
  const notifications = useNotificationStore((s) => s.notifications)
  const loaded = useNotificationStore((s) => s.loaded)
  const fetchNotifications = useNotificationStore((s) => s.fetch)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const unreadCount = useNotificationStore((s) => s.unreadCount)

  useEffect(() => { void fetchNotifications(30) }, [fetchNotifications])

  const surface = {
    background: dark ? 'oklch(0.28 0.02 262 / 0.62)' : 'color-mix(in oklab, var(--ap-bg-raised) 72%, transparent)',
    borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'color-mix(in oklab, var(--ap-bg-raised) 80%, transparent)',
    boxShadow: 'var(--ap-shadow-sm)',
  }

  return (
    <div
      className={cn('rounded-[var(--ap-radius-card)] border backdrop-blur-md', dark && 'text-white')}
      style={surface}
    >
      <div className="flex items-center justify-between px-5 py-3.5">
        <div>
          <p className="text-[13px] font-semibold">Inbox</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'Nothing unread'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="rounded-[var(--ap-radius-sm)] px-2.5 py-1 text-[12px] font-medium text-[var(--ap-accent)] hover:bg-[color:var(--ap-bg-hover)]"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/dashboard/notifications')}
            className="rounded-[var(--ap-radius-sm)] px-2.5 py-1 text-[12px] font-medium text-[var(--ap-fg-secondary)] hover:bg-[color:var(--ap-bg-hover)]"
          >
            View all
          </button>
        </div>
      </div>

      {!loaded ? (
        <p className="px-5 pb-8 pt-4 text-center text-[12px] text-muted-foreground">Loading…</p>
      ) : notifications.length === 0 ? (
        <div className="px-5 pb-10 pt-4 text-center">
          <Inbox className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-[13px] font-semibold">You&apos;re all caught up</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Mentions, reviews and assignments will land here.
          </p>
        </div>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto border-t" style={{ borderColor: surface.borderColor }}>
          {notifications.map((n) => {
            const { Icon, bg, fg } = notificationIcon(n.type)
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.isRead) void markRead(n.id)
                    if (n.deepLink) router.push(n.deepLink)
                  }}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-[color:var(--ap-bg-hover)]"
                >
                  <span
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: bg }}
                  >
                    <Icon className="size-3.5" style={{ color: fg }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold">{n.title}</span>
                      {!n.isRead && (
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--ap-accent)' }} />
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-muted-foreground">{n.message}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {notificationTypeLabel(n.type)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
