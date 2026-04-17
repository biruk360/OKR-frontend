'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type EntityType = 'objective' | 'key-result'

interface Actor {
  id: string
  name: string
  avatar: string | null
}

/**
 * Hydrated reference produced by lib/activity-log-hydrate. When a change diff
 * field's value is one of these, render it as a clickable link instead of the
 * raw cuid.
 */
interface Ref {
  __ref: true
  kind: 'user' | 'objective' | 'department' | 'timeframe'
  id: string
  label: string
  href: string
}

interface ActivityLogEntry {
  id: string
  action: string
  actor: Actor | null
  changes: Record<string, { from: unknown; to: unknown }> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface ViewEntry {
  id: string
  user: Actor | null
  viewCount: number
  firstViewAt: string
  lastViewAt: string
}

interface Props {
  entityType: EntityType
  entityId: string
}

const apiBase: Record<EntityType, string> = {
  objective: '/api/objectives',
  'key-result': '/api/keyresults',
}

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'created',
  UPDATED: 'updated',
  STATUS_CHANGED: 'changed status',
  PROGRESS_UPDATED: 'updated progress',
  CHECKIN: 'checked in',
  ARCHIVED: 'archived',
  UNARCHIVED: 'restored',
  DELETED: 'deleted',
  COMMENTED: 'commented',
  INITIATIVE_ADDED: 'added an initiative',
  INITIATIVE_UPDATED: 'updated an initiative',
  INITIATIVE_REMOVED: 'removed an initiative',
  VIEWED: 'viewed',
}

export function ActivityLogPanel({ entityType, entityId }: Props) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [views, setViews] = useState<ViewEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'activity' | 'viewers'>('activity')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Beacon the view, then fetch the log
    fetch(`${apiBase[entityType]}/${entityId}/views`, { method: 'POST' }).catch(() => {})
    fetch(`${apiBase[entityType]}/${entityId}/activity`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.success) {
          // Server now nests logs/views under `data.data` (standard envelope);
          // keep top-level fallback for any legacy routes.
          const payload = data.data ?? data
          setLogs(payload.logs || [])
          setViews(payload.views || [])
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entityType, entityId])

  return (
    <section className="rounded-md border border-neutral-200 bg-card">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-neutral-900">Activity</h3>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setTab('activity')}
              className={`rounded px-2 py-1 ${tab === 'activity' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              Changes ({logs.length})
            </button>
            <button
              onClick={() => setTab('viewers')}
              className={`rounded px-2 py-1 ${tab === 'viewers' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              Viewers ({views.length})
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-3">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : tab === 'activity' ? (
          logs.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-3 text-sm">
                  <Avatar name={log.actor?.name} avatar={log.actor?.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-800">
                      {log.actor ? (
                        <Link
                          href={`/dashboard/org/users/${log.actor.id}`}
                          className="font-medium text-neutral-900 hover:text-blue-600 hover:underline"
                        >
                          {log.actor.name}
                        </Link>
                      ) : (
                        <span className="font-medium">System</span>
                      )}{' '}
                      <span className="text-neutral-600">{ACTION_LABEL[log.action] || log.action.toLowerCase()}</span>
                    </p>
                    {log.changes && <ChangeList changes={log.changes} />}
                    <p className="mt-0.5 text-xs text-neutral-400">{relativeTime(log.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : views.length === 0 ? (
          <p className="text-sm text-neutral-500">No views recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {views.map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-sm">
                <Avatar name={v.user?.name} avatar={v.user?.avatar} />
                <div className="flex-1">
                  <p className="text-neutral-800">{v.user?.name || 'Unknown user'}</p>
                  <p className="text-xs text-neutral-500">
                    {v.viewCount} view{v.viewCount === 1 ? '' : 's'} · last seen {relativeTime(v.lastViewAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function Avatar({ name, avatar }: { name?: string | null; avatar?: string | null }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name || ''} className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
  }
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700">
      {initials}
    </div>
  )
}

function ChangeList({ changes }: { changes: Record<string, { from: unknown; to: unknown }> }) {
  const entries = Object.entries(changes)
  if (entries.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
      {entries.map(([field, { from, to }]) => (
        <li key={field}>
          <span className="font-medium text-neutral-700">{humanField(field)}</span>:{' '}
          <ValueCell value={from} tone="muted" />
          <span className="mx-1 text-neutral-400">→</span>
          <ValueCell value={to} tone="strong" />
        </li>
      ))}
    </ul>
  )
}

/** Reference fields like ownerId/parentObjectiveId end with "Id" — strip for display. */
function humanField(field: string): string {
  const stripped = field.replace(/Id$/, '')
  return stripped
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function isRef(v: unknown): v is Ref {
  return !!v && typeof v === 'object' && (v as any).__ref === true
}

/** Renders one side of a change. Hydrated refs become clickable links to the entity. */
function ValueCell({ value, tone }: { value: unknown; tone: 'muted' | 'strong' }) {
  const cls = tone === 'muted' ? 'text-neutral-500' : 'text-neutral-800'
  if (isRef(value)) {
    return (
      <Link href={value.href} className="font-medium text-blue-600 hover:underline">
        {value.label}
      </Link>
    )
  }
  return <span className={cls}>{formatVal(value)}</span>
}

function formatVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return String(Math.round(v * 100) / 100)
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try { return new Date(v).toLocaleDateString() } catch { return v }
    }
    return v.length > 60 ? v.slice(0, 60) + '…' : v
  }
  return JSON.stringify(v)
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
