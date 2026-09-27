'use client'

/** OKR Explorer — list row (compact view) and card (rich view). */

import { Building2, Calendar, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PeopleTooltip, PersonTooltip } from '@/components/shared/UserAvatar'
import StatusPill, { LevelBadge } from '@/components/shared/StatusPill'
import { Avatar, KindIcon, ProgressBar } from './OkrsAllPrimitives'
import { activateOnKey, formatDate, statusOf, type CurrentUser, type RefUser, type Row } from './okrs-all-utils'

function FavoriteButton({
  id, favoriteIds, toggleFavorite, className,
}: {
  id: string
  favoriteIds: Set<string>
  toggleFavorite: (id: string) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleFavorite(id) }}
      className={cn('text-muted-foreground hover:text-warning-500', className)}
      aria-label={favoriteIds.has(id) ? 'Unfavorite' : 'Favorite'}
    >
      <Star className={cn('h-3.5 w-3.5', favoriteIds.has(id) && 'fill-warning-400 text-warning-500')} />
    </button>
  )
}

export function CompactRow({
  row, idx, density, onOpen, currentUser, favoriteIds, toggleFavorite,
  selected, onToggleSelect,
}: {
  row: Row
  idx: number
  density: 'compact' | 'rich'
  onOpen: () => void
  currentUser: CurrentUser
  favoriteIds: Set<string>
  toggleFavorite: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = statusOf(row)
  const progress = typeof row.data.progress === 'number' ? row.data.progress : 0
  const owner: RefUser | null = row.data.owner ?? null
  const idCode = String(row.data.id ?? row.rowId).slice(-6).toUpperCase()
  const title: string = row.data.title ?? ''
  const period = row.data.period?.name
  const initTotal = (row.data.__initTotal ?? 0) as number
  const initClosed = (row.data.__initClosed ?? 0) as number

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${title}`}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 border-b transition-colors cursor-pointer hover:bg-[var(--ap-bg-hover,var(--ap-bg-sunken))] ap-focus-ring',
        selected && 'bg-[var(--ap-accent-soft)]',
      )}
      style={{ borderColor: 'var(--ap-border-soft, var(--ap-border))' }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${title}`}
        className="h-3.5 w-3.5 shrink-0"
      />
      <span className="text-micro tabular-nums text-muted-foreground w-7 text-right">{String(idx + 1).padStart(2, '0')}</span>
      <KindIcon row={row} />
      {row.kind === 'OBJ' && <LevelBadge level={row.data.level} />}
      <span className="text-micro tabular-nums text-muted-foreground shrink-0">{idCode}</span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium truncate" title={title}>{title}</p>
        {period && (
          <p className="text-caption text-muted-foreground truncate">{period}</p>
        )}
      </div>
      <div className="hidden md:block shrink-0">
        <StatusPill status={status} size="xs" />
      </div>
      <div className="hidden lg:block shrink-0">
        {initTotal > 0 && (
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums"
            style={{
              background: initTotal === initClosed ? 'var(--ap-ok-bg)' : 'var(--ap-bg-sunken)',
              color: initTotal === initClosed ? 'var(--ap-green)' : 'var(--ap-fg-muted)',
            }}
          >
            {initClosed}/{initTotal}
          </span>
        )}
      </div>
      <div className="shrink-0">
        <ProgressBar value={progress} status={status} width={140} />
      </div>
      <div className="shrink-0">
        <Avatar user={owner} size={22} detail="Owner" />
      </div>
      {row.kind === 'OBJ' && (
        <FavoriteButton id={row.data.id} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} className="shrink-0" />
      )}
    </div>
  )
}

function Divider() {
  return <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
}

export function RichCard({
  row, onOpen, favoriteIds, toggleFavorite, selected, onToggleSelect,
}: {
  row: Row
  onOpen: () => void
  favoriteIds: Set<string>
  toggleFavorite: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = statusOf(row)
  const progress = typeof row.data.progress === 'number' ? row.data.progress : 0
  const owner: RefUser | null = row.data.owner ?? null
  const collaborators: RefUser[] = row.data.collaborators ?? []
  const idCode = String(row.data.id ?? row.rowId).slice(-6).toUpperCase()
  const title: string = row.data.title ?? ''
  const description: string | undefined = row.data.description
  const period = row.data.period?.name
  const krCount = row.data.keyResultCount ?? row.data.krCount ?? 0
  const due = row.data.endDate ?? row.data.dueDate

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${title}`}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      className={cn(
        'group rounded-[var(--ap-radius-md)] border bg-card px-4 py-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px ap-focus-ring',
        selected && 'ring-2',
      )}
      style={{
        borderColor: selected ? 'var(--ap-accent)' : 'var(--ap-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${title}`}
          className="h-3.5 w-3.5"
        />
        <KindIcon row={row} />
        {row.kind === 'OBJ' && <LevelBadge level={row.data.level} />}
        {row.kind === 'KR' && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide"
            style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-orange)' }}>
            Key Result
          </span>
        )}
        {row.kind === 'INIT' && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide"
            style={{ background: 'var(--ap-ok-bg)', color: 'var(--ap-green)' }}>
            Initiative
          </span>
        )}
        <span className="text-micro tabular-nums text-muted-foreground">{idCode}</span>
        {period && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
            <Calendar className="size-2.5" />{period}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <StatusPill status={status} size="xs" />
          {row.kind === 'OBJ' && (
            <FavoriteButton id={row.data.id} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} />
          )}
        </div>
      </div>

      <p className="text-body font-semibold leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2" style={{ textWrap: 'pretty' } as any}>
          {description}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5 max-w-[180px]">
          <Avatar user={owner} size={20} tooltip={false} />
          <PersonTooltip person={owner ?? {}} detail="Owner" whenTruncated disabled={!owner}>
          <span className="truncate text-xs" style={{ color: 'var(--ap-fg-muted)' }}>
            {owner?.name ?? owner?.email ?? 'Unassigned'}
          </span>
          </PersonTooltip>
        </div>
        {collaborators.length > 0 && (
          <>
            <Divider />
            <div className="flex items-center -space-x-1.5">
              {collaborators.slice(0, 4).map(u => (
                <span key={u.id} className="ring-2 ring-card rounded-full">
                  <Avatar user={u} size={18} detail="Collaborator" />
                </span>
              ))}
              {collaborators.length > 4 && (
                <PeopleTooltip people={collaborators.slice(4)} heading={`${collaborators.length - 4} more collaborators`}>
                <span className="ring-2 ring-card inline-flex items-center justify-center rounded-full text-[9px] font-semibold"
                  role="img"
                  aria-label={`${collaborators.length - 4} more: ${collaborators.slice(4).map((c) => c.name ?? c.email).join(', ')}`}
                  style={{ width: 18, height: 18, background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
                  +{collaborators.length - 4}
                </span>
                </PeopleTooltip>
              )}
            </div>
          </>
        )}
        {row.data.team && (
          <>
            <Divider />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="size-3" />
              <span className="truncate max-w-[120px]">{row.data.team.name}</span>
            </span>
          </>
        )}
        {row.kind === 'OBJ' && krCount > 0 && (
          <>
            <Divider />
            <span className="text-caption tabular-nums text-muted-foreground">{krCount} KR{krCount !== 1 ? 's' : ''}</span>
          </>
        )}
        {due && (
          <>
            <Divider />
            <span className="text-caption text-muted-foreground tabular-nums">Due {formatDate(due)}</span>
          </>
        )}
        <div className="ml-auto">
          <ProgressBar value={progress} status={status} width={160} />
        </div>
      </div>
    </div>
  )
}
