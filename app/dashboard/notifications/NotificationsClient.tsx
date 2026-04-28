'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Bell, AtSign, CheckCircle2, AlertTriangle, MessageSquare, ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
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

function iconFor(type: string) {
  const t = type.toUpperCase()
  if (t.includes('MENTION')) return { Icon: AtSign, bg: 'rgba(88,86,214,0.12)', fg: 'rgb(88,86,214)' }
  if (t.includes('COMMENT')) return { Icon: MessageSquare, bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent)' }
  if (t.includes('RISK') || t.includes('OFF')) return { Icon: AlertTriangle, bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)' }
  if (t.includes('COMPLETE') || t.includes('DONE')) return { Icon: CheckCircle2, bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)' }
  return { Icon: Bell, bg: 'rgba(120,120,128,0.15)', fg: 'var(--ap-fg-muted)' }
}

export default function NotificationsClient({ notifications }: { notifications: NotificationRow[] }) {
  const [tab, setTab] = useState<Tab>('all')

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
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inbox</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Notifications
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread · ${notifications.length} total` : `${notifications.length} total`}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              className="rounded-[10px] border px-3 py-1.5 text-[12px] font-medium hover:bg-[color:var(--ap-bg-hover)]"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 px-5 pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition',
                tab === t.key
                  ? 'text-white'
                  : 'text-muted-foreground hover:bg-[color:var(--ap-bg-hover)]'
              )}
              style={tab === t.key ? { background: 'var(--ap-accent)' } : undefined}
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
            const { Icon, bg, fg } = iconFor(n.type)
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
                    <p className="text-[13px] font-semibold truncate">{n.title}</p>
                    {!n.isRead && (
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--ap-accent)' }} />
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {n.type.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                  {n.deepLink && (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </div>
              </>
            )
            const className = cn(
              'flex items-start gap-3 rounded-[14px] border bg-card px-4 py-3 transition hover:bg-[color:var(--ap-bg-hover)]',
              !n.isRead && 'shadow-sm',
              n.deepLink && 'cursor-pointer'
            )
            return (
              <li key={n.id} style={{ borderColor: 'var(--ap-border)' }} className="contents">
                {n.deepLink ? (
                  <Link href={n.deepLink} className={className} style={{ borderColor: 'var(--ap-border)' }}>
                    {inner}
                  </Link>
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
