'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Bell, ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { notificationIcon, notificationTypeLabel } from '@/components/shared/notification-icon'
import { cn } from '@/lib/utils'

export interface NotificationRow {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
  deepLink?: string | null
}

type Tab = 'all' | 'unread' | 'mentions'

export default function NotificationsClient({ notifications: initial }: { notifications: NotificationRow[] }) {
  const [tab, setTab] = useState<Tab>('all')

  // The server component supplies the first render; read state is then mutated
  // here so marking read does not need a full round trip through the page.
  const [notifications, setNotifications] = useState(initial)
  useEffect(() => { setNotifications(initial) }, [initial])

  const markRead = useCallback(async (id: string) => {
    setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, isRead: false } : n)))
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const snapshot = notifications
    setNotifications((rows) => rows.map((n) => ({ ...n, isRead: true })))
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(snapshot)
    }
  }, [notifications])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])
  const mentionsCount = useMemo(
    () => notifications.filter((n) => n.type.toUpperCase().includes('MENTION')).length,
    [notifications]
  )

  const filtered = useMemo(() => {
    if (tab === 'unread') return notifications.filter((n) => !n.isRead)
    if (tab === 'mentions') return notifications.filter((n) => n.type.toUpperCase().includes('MENTION'))
    return notifications
  }, [tab, notifications])

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'mentions', label: 'Mentions', count: mentionsCount },
  ]

  return (
    <div className="space-y-3">
      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <PageHeader
            className="mb-0"
            breadcrumb={<Eyebrow>Inbox</Eyebrow>}
            title="Notifications"
            description={unreadCount > 0 ? `${unreadCount} unread · ${notifications.length} total` : `${notifications.length} total`}
            actions={
              unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="rounded-[var(--ap-radius-sm)] border px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--ap-bg-hover)]"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  Mark all as read
                </button>
              ) : undefined
            }
          />
        </div>

        <div className="flex items-center gap-1 px-5 pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                tab === t.key
                  ? ''
                  : 'text-muted-foreground hover:bg-[color:var(--ap-bg-hover)]'
              )}
              style={tab === t.key ? { background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' } : undefined}
            >
              {t.label}
              <span className="ml-1.5 font-mono tabular-nums opacity-80">{t.count}</span>
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="All caught up"
          description="You're up to date"
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => {
            const { Icon, bg, fg } = notificationIcon(n.type)
            const inner = (
              <>
                <div
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: bg }}
                >
                  <Icon className="size-4" style={{ color: fg }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-body-sm font-semibold truncate">{n.title}</p>
                    {!n.isRead && (
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--ap-accent)' }} />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-caption uppercase tracking-wide text-muted-foreground">
                    {notificationTypeLabel(n.type)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-caption tabular-nums text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                  {n.deepLink && (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </div>
              </>
            )
            const className = cn(
              'flex items-start gap-3 rounded-[var(--ap-radius-md)] border bg-card px-4 py-3 transition hover:bg-[color:var(--ap-bg-hover)]',
              !n.isRead && 'shadow-sm',
              n.deepLink && 'cursor-pointer'
            )
            return (
              <li key={n.id} style={{ borderColor: 'var(--ap-border)' }} className="contents">
                {n.deepLink ? (
                  <Link
                    href={n.deepLink}
                    // Following the link is an acknowledgement — mark it read on
                    // the way out rather than leaving the badge stuck until the
                    // 30-day prune job flips it.
                    onClick={() => { if (!n.isRead) void markRead(n.id) }}
                    className={className}
                    style={{ borderColor: 'var(--ap-border)' }}
                  >
                    {inner}
                  </Link>
                ) : !n.isRead ? (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    aria-label={`Mark "${n.title}" as read`}
                    className={cn(className, 'w-full cursor-pointer text-left')}
                    style={{ borderColor: 'var(--ap-border)' }}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className={className} style={{ borderColor: 'var(--ap-border)' }}>{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
