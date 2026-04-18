'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import Link from 'next/link'
import { Activity, CheckSquare, Target, TrendingUp } from 'lucide-react'

export interface ActivityFeedItem {
  id: string
  actorName: string | null
  actorAvatar: string | null
  entityType: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO'
  entityTitle: string
  entityId: string
  action: string
  progress: number | null
  createdAt: string // ISO string
}

interface Props {
  items: ActivityFeedItem[]
  emptyMessage?: string
}

function actionLabel(action: string, entityType: string): string {
  if (action === 'CHECKIN') return 'checked in on'
  if (action === 'CREATE') return entityType === 'TODO' ? 'created initiative' : 'created'
  if (action === 'UPDATE') return 'updated'
  if (action === 'COMPLETE') return 'completed'
  if (action === 'ARCHIVE') return 'archived'
  if (action === 'STATUS_CHANGE') return 'updated status of'
  return action.toLowerCase().replace(/_/g, ' ')
}

function EntityIcon({ type }: { type: string }) {
  if (type === 'KEY_RESULT') return <TrendingUp className="size-3 text-primary" />
  if (type === 'TODO') return <CheckSquare className="size-3 text-violet-500" />
  return <Target className="size-3 text-blue-500" />
}

function entityHref(type: string, id: string): string {
  if (type === 'KEY_RESULT') return `/dashboard/key-results/${id}`
  if (type === 'TODO') return `/dashboard/todos?open=${id}`
  return `/dashboard/objectives/${id}`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const letters = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0].slice(0, 2)
  return (
    <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0">
      <span className="text-[10px] font-semibold text-primary-foreground uppercase">{letters}</span>
    </div>
  )
}

export default function TeamActivityFeed({ items, emptyMessage = 'No recent team activity.' }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card flex flex-col h-full">
        <header className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Team Activity</h3>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card flex flex-col">
      <header className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Team Activity</h3>
        </div>
      </header>

      <ul className="divide-y divide-border overflow-y-auto max-h-[420px]">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
            {/* Avatar */}
            <div className="mt-0.5 shrink-0">
              {item.actorAvatar ? (
                <img src={item.actorAvatar} alt={item.actorName ?? ''} className="size-7 rounded-full object-cover" />
              ) : (
                <Initials name={item.actorName ?? '?'} />
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                <span className="font-medium text-foreground">{item.actorName ?? 'Someone'}</span>
                {' '}
                <span className="text-muted-foreground">{actionLabel(item.action, item.entityType)}</span>
                {' '}
                <Link
                  href={entityHref(item.entityType, item.entityId)}
                  className="font-medium text-foreground hover:text-primary truncate inline-block max-w-[180px] align-bottom"
                  title={item.entityTitle}
                >
                  {item.entityTitle}
                </Link>
              </p>
              <div className="flex items-center gap-2 mt-1">
                <EntityIcon type={item.entityType} />
                <span className="text-[11px] text-muted-foreground capitalize">
                  {item.entityType.replace('_', ' ').toLowerCase()}
                </span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
                </span>
                {item.progress !== null && (
                  <>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <span className="text-[11px] font-semibold text-foreground">{Math.round(item.progress)}%</span>
                  </>
                )}
              </div>
            </div>

            {/* Progress pill */}
            {item.progress !== null && (
              <div className="shrink-0 mt-0.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    item.progress >= 70
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : item.progress >= 35
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {Math.round(item.progress)}%
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
