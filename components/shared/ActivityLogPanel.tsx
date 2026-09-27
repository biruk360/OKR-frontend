'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton'

type EntityType = 'objective' | 'key-result' | 'letter'

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
  /** When true, skip the outer border + "Activity" title — parent tab provides them. */
  embedded?: boolean
}

const apiBase: Record<EntityType, string> = {
  objective: '/api/objectives',
  'key-result': '/api/keyresults',
  letter: '/api/letters',
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
  LETTER_SUBMITTED: 'submitted for approval',
  LETTER_APPROVED: 'approved the letter',
  LETTER_REJECTED: 'returned the letter to draft',
  LETTER_SENT: 'marked the letter as sent',
  LETTER_PRINTED: 'printed the letter',
  LETTER_PDF_GENERATED: 'generated a PDF preview',
  LETTER_PDF_FAILED: 'PDF generation failed',
  LETTER_ENCLOSURE_ADDED: 'added an enclosure',
  LETTER_ENCLOSURE_REMOVED: 'removed an enclosure',
}

export function ActivityLogPanel({ entityType, entityId, embedded = false }: Props) {
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
    <section className={embedded ? '' : 'rounded-md border border-border bg-card'}>
      <header
        className={
          embedded
            ? 'flex items-center gap-1 pb-3'
            : 'flex items-center justify-between border-b border-border px-4 py-3'
        }
      >
        <div className="flex items-center gap-4">
          {!embedded && <h3 className="text-sm font-semibold text-foreground">Activity</h3>}
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              aria-pressed={tab === 'activity'}
              onClick={() => setTab('activity')}
              className={`rounded px-2 py-1 ${tab === 'activity' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Changes ({logs.length})
            </button>
            <button
              type="button"
              aria-pressed={tab === 'viewers'}
              onClick={() => setTab('viewers')}
              className={`rounded px-2 py-1 ${tab === 'viewers' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Viewers ({views.length})
            </button>
          </div>
        </div>
      </header>

      <div className={embedded ? '' : 'px-4 py-3'}>
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <SkeletonAvatar size={28} />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'activity' ? (
          logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-3 text-sm">
                  <Avatar name={log.actor?.name} avatar={log.actor?.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      {log.actor ? (
                        <Link
                          href={`/dashboard/org/users/${log.actor.id}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {log.actor.name}
                        </Link>
                      ) : (
                        <span className="font-medium">System</span>
                      )}{' '}
                      <span className="text-muted-foreground">{ACTION_LABEL[log.action] || log.action.toLowerCase()}</span>
                    </p>
                    {log.changes && <ChangeList changes={log.changes} />}
                    <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(log.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : views.length === 0 ? (
          <p className="text-sm text-muted-foreground">No views recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {views.map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-sm">
                <Avatar name={v.user?.name} avatar={v.user?.avatar} />
                <div className="flex-1">
                  <p className="text-foreground">{v.user?.name || 'Unknown user'}</p>
                  <p className="text-xs text-muted-foreground">
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
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
      {initials}
    </div>
  )
}

function ChangeList({ changes }: { changes: Record<string, { from: unknown; to: unknown }> }) {
  const entries = Object.entries(changes)
  if (entries.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {entries.map(([field, { from, to }]) => (
        <li key={field}>
          <span className="font-medium text-foreground">{humanField(field)}</span>:{' '}
          <ValueCell value={from} tone="muted" />
          <span className="mx-1 text-muted-foreground">→</span>
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
  const cls = tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'
  if (isRef(value)) {
    return (
      <Link href={value.href} className="font-medium text-primary hover:underline">
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
