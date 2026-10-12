'use client'

/**
 * ConnectionsPanel (CON-2) — every link of one item, grouped as in CON-1, with
 * title, owner avatar, status and a deep link. Two looks:
 *   - `variant="rail"`    — the quick-view RailCard (uppercase micro header, compact rows);
 *   - `variant="section"` — a detail-page section card with per-group headings.
 * Redacted items render as "Private item" (CON-8). Data: GET /api/connections.
 *
 * Link management lives in `features/okr-links` (LinkManagerModal); pass
 * `onManageLinks` and the panel shows a "Manage links" action when the API says
 * the viewer may (`permissions.canManageLinks`).
 */
import type { ReactNode } from 'react'
import { Link2, RotateCw, Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { ConnectionEntityType, ConnectionsPayload } from '@/lib/connections/types'
import { buildConnectionGroups, type ConnectionGroupKey } from './connection-display'
import { ConnectionGroupRows } from './ConnectionRows'
import { ConnectionsFetchError, useConnections } from './useConnections'

export interface ConnectionsPanelProps {
  entityType: ConnectionEntityType
  entityId: string
  variant?: 'rail' | 'section'
  title?: string
  /** Pre-loaded payload (skips the request). */
  data?: ConnectionsPayload
  /** Only these groups (default: all non-empty ones). */
  groups?: readonly ConnectionGroupKey[]
  /** Called on "Manage links"; the button shows only when the viewer may manage links. */
  onManageLinks?: () => void
  /** Extra header action (rendered before "Manage links"). */
  action?: ReactNode
  /** Plain left click on a row link (e.g. close the quick view first). */
  onNavigate?: () => void
  /** Text when nothing is linked. */
  emptyText?: string
  className?: string
}

function HeaderButton({ onClick, children, label }: { onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] px-1.5 py-0.5 text-caption font-semibold transition-colors hover:bg-[var(--ap-bg-hover)]"
      style={{ color: 'var(--ap-accent)' }}
    >
      {children}
    </button>
  )
}

export function ConnectionsPanel({
  entityType,
  entityId,
  variant = 'section',
  title = 'Connections',
  data,
  groups: only,
  onManageLinks,
  action,
  onNavigate,
  emptyText = 'Nothing is linked to this item yet.',
  className,
}: ConnectionsPanelProps) {
  const query = useConnections(entityType, entityId, { enabled: !data })
  const payload = data ?? query.data
  const isRail = variant === 'rail'

  const allGroups = payload ? buildConnectionGroups(payload) : []
  const groups = only ? allGroups.filter((g) => only.includes(g.key)) : allGroups
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const canManage = !!onManageLinks && !!payload?.permissions.canManageLinks

  const header = (
    <div
      className={cn('flex items-center justify-between gap-2 border-b', isRail ? 'px-4 py-2' : 'px-4 py-2.5')}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <h3
        className={cn('font-semibold uppercase tracking-wide', isRail ? 'text-micro' : 'text-caption')}
        style={{ color: 'var(--ap-fg-subtle)' }}
      >
        {title}
        {payload && total > 0 && <span className="ml-1 tabular-nums">({total})</span>}
      </h3>
      <div className="flex items-center gap-1">
        {action}
        {canManage && (
          <HeaderButton onClick={onManageLinks!} label="Manage links">
            <Settings2 className="size-3" aria-hidden /> Manage links
          </HeaderButton>
        )}
      </div>
    </div>
  )

  let body: ReactNode
  if (!payload && query.isLoading) {
    body = (
      <div className="space-y-2 py-2" aria-busy="true" aria-label="Loading connections">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    )
  } else if (!payload) {
    const notVisible = query.error instanceof ConnectionsFetchError && query.error.status === 404
    body = (
      <div className="flex items-center justify-between gap-2 py-2.5 text-xs" style={{ color: 'var(--ap-fg-muted)' }}>
        <span>{notVisible ? 'Connections are not available for this item.' : 'Could not load connections.'}</span>
        {!notVisible && (
          <HeaderButton onClick={() => void query.refetch()} label="Retry loading connections">
            <RotateCw className="size-3" aria-hidden /> Retry
          </HeaderButton>
        )}
      </div>
    )
  } else if (groups.length === 0) {
    body = (
      <div className="flex items-center gap-2 py-2.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1">{emptyText}</span>
        {canManage && (
          <HeaderButton onClick={onManageLinks!} label="Add a link">
            Add link
          </HeaderButton>
        )}
      </div>
    )
  } else {
    body = (
      <div className={cn(isRail ? 'space-y-2' : 'space-y-3')}>
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <p
              className="pt-1.5 text-micro font-semibold uppercase tracking-wide"
              style={{ color: group.key === 'inbound' && group.items.some((d) => 'late' in d && d.late) ? 'var(--ap-danger-fg)' : 'var(--ap-fg-subtle)' }}
              title={group.hint}
            >
              {group.title} <span className="tabular-nums">· {group.items.length}</span>
            </p>
            <ConnectionGroupRows group={group} onNavigate={onNavigate} />
          </section>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-[var(--ap-radius-md)] border', className)}
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
    >
      {header}
      <div className={isRail ? 'px-4 py-1.5' : 'px-4 py-2'}>{body}</div>
    </div>
  )
}

export default ConnectionsPanel
