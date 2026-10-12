'use client'

/**
 * DependenciesProfileTab — the "Links & dependencies" profile tab (PRF-16, DEP-1).
 *
 * Two columns (stacked at phone width):
 *   - Inbound — clear first: dependencies this person NEEDS from others;
 *   - Outbound — others wait on you: dependencies this person PROVIDES.
 * Each column is sorted late → due soon → open → done, and every row shows the
 * counterparty avatars, needed-by date, linked items and status. Actions come
 * from the row's `permissions` (providers: status incl. Done; creator /
 * managers / Exec / Admin: everything; DEP-4 delivery task).
 *
 * Composition slots (features never import each other):
 *   - `graphSlot`         — the CON-4 graph (P3); when given, a List / Graph toggle appears;
 *   - `renderItemActions` — PKG-2 Agree / Dispute controls per row.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  GitPullRequestArrow,
  Link2,
  ListTodo,
  Lock,
  Network,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatarStack } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { todoHref } from '@/lib/connections/flags'
import { DEPENDENCY_MAP_PATH } from '@/lib/package/links'
import { DEPENDENCY_STATUS_LABELS, DEPENDENCY_TYPE_LABELS, type DependencyStatus } from '@/types/package'
import { useCreateDeliveryTask, usePersonDependencies, useSetDependencyStatus } from '../hooks/queries'
import { statusActionsFor } from '../services/rules'
import type { DependencyDetailRow, DependencyPerson, DependencyRow } from '../types'
import { DependencyFormModal, type DependencyFormDefaults } from './DependencyFormModal'
import { DependencyStatusBadge } from './DependencyStatusBadge'

export interface DependenciesProfileTabProps {
  userId: string
  timeframeId: string
  /** CON-4 graph for this person (P3). Shows a List / Graph toggle when provided. */
  graphSlot?: ReactNode
  /** Per-row slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  renderItemActions?: (row: DependencyDetailRow) => ReactNode
  className?: string
}

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

const STATUS_ICON: Partial<Record<DependencyStatus, typeof CheckCircle2>> = {
  DONE: CheckCircle2,
  OPEN: RotateCcw,
}

function formatDay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, 'd MMM yyyy')
}

function avatarsOf(people: DependencyPerson[]) {
  return people.map((p) => ({ id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar }))
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading dependencies">
      {[0, 1].map((i) => (
        <div key={i} className={cn(cardClass, 'space-y-3 p-4')}>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ))}
    </div>
  )
}

interface RowProps {
  row: DependencyRow
  direction: 'INBOUND' | 'OUTBOUND'
  onEdit: (row: DependencyDetailRow) => void
  renderItemActions?: (row: DependencyDetailRow) => ReactNode
}

function DependencyListRow({ row, direction, onEdit, renderItemActions }: RowProps) {
  const setStatus = useSetDependencyStatus()
  const deliveryTask = useCreateDeliveryTask()
  const busy = setStatus.isPending || deliveryTask.isPending
  const neededBy = formatDay(row.neededByDate)

  if (!row.detail) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-3">
        {row.ref && <MiniBadge mono>{row.ref}</MiniBadge>}
        <span className="min-w-0 flex-1 truncate text-body-sm">{row.title}</span>
        <DependencyStatusBadge status={row.status} late={row.late} dueSoon={row.dueSoon} />
      </li>
    )
  }

  // Inbound rows show who delivers; outbound rows show who is waiting.
  const counterparties = direction === 'INBOUND' ? row.providers : row.needers
  const counterpartyLabel = direction === 'INBOUND' ? 'Delivered by' : 'Waiting'
  const statusActions = statusActionsFor(row)
  const markDone = statusActions.includes('DONE') && row.open
  const actions: ActionsMenuItem[] = [
    ...statusActions
      .filter((s) => !(markDone && s === 'DONE'))
      .map((status) => ({
        key: `status-${status}`,
        label: status === 'OPEN' && !row.open ? 'Reopen' : `Mark ${DEPENDENCY_STATUS_LABELS[status].toLowerCase()}`,
        icon: STATUS_ICON[status],
        destructive: status === 'DROPPED',
        disabled: busy,
        onSelect: () => setStatus.mutate({ id: row.id, body: { status } }),
      })),
    {
      key: 'delivery-task',
      label: 'Create delivery task',
      icon: ListTodo,
      divider: true,
      hidden: !row.permissions.canCreateDeliveryTask || !row.open,
      disabled: busy,
      onSelect: () => deliveryTask.mutate(row.id),
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: Pencil,
      divider: !row.permissions.canCreateDeliveryTask,
      hidden: !row.permissions.canEdit,
      onSelect: () => onEdit(row),
    },
  ]
  const hasMenu = actions.some((a) => !a.hidden)

  return (
    <li
      className={cn(
        'space-y-2 px-4 py-3',
        row.late && 'border-l-2 border-l-[var(--ap-danger-fg)]',
        !row.open && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {row.ref && (
              <MiniBadge mono title={row.isPackageLink ? 'Package-specific link' : 'Company dependency'}>
                {row.ref}
              </MiniBadge>
            )}
            <MiniBadge>{DEPENDENCY_TYPE_LABELS[row.depType]}</MiniBadge>
            <DependencyStatusBadge status={row.status} late={row.late} dueSoon={row.dueSoon} />
          </div>
          <a
            href={row.href}
            className="mt-1 block text-body-sm font-medium text-[var(--ap-fg)] hover:underline ap-focus-ring"
          >
            {row.title}
          </a>
          {row.unblocksText && (
            <p className="mt-0.5 line-clamp-2 text-caption text-[var(--ap-fg-subtle)]">Unblocks: {row.unblocksText}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {markDone && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setStatus.mutate({ id: row.id, body: { status: 'DONE' } })}
            >
              <CheckCircle2 className="mr-1 size-3.5" aria-hidden />
              Done
            </Button>
          )}
          {hasMenu && <ActionsMenu items={actions} label={`Actions for ${row.ref ?? row.title}`} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-[var(--ap-fg-subtle)]">
        {counterparties.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span>{counterpartyLabel}</span>
            <UserAvatarStack users={avatarsOf(counterparties)} size={20} max={4} detail={() => counterpartyLabel} />
          </span>
        )}
        <span className={cn(row.late && 'font-medium text-[var(--ap-danger-fg)]', row.dueSoon && 'text-[var(--ap-warn-fg)]')}>
          {neededBy ? `Needed by ${neededBy}` : 'No needed-by date'}
        </span>
        {row.doneAt && <span>Done {formatDay(row.doneAt)}</span>}
        {row.deliveryTodoId && (
          <a href={todoHref(row.deliveryTodoId)} className="inline-flex items-center gap-1 hover:underline ap-focus-ring">
            <ClipboardList className="size-3" aria-hidden />
            Delivery task
          </a>
        )}
      </div>

      {row.links.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Linked items">
          {row.links.map((link) => (
            <li key={`${link.entityType}:${link.entityId}`}>
              {link.redacted || !link.href ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-0.5 text-caption text-[var(--ap-fg-subtle)]">
                  <Lock className="size-3" aria-hidden />
                  Private item
                </span>
              ) : (
                <a
                  href={link.href}
                  className="inline-flex max-w-[260px] items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-0.5 text-caption text-[var(--ap-fg)] hover:underline ap-focus-ring"
                >
                  <Link2 className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{[link.ref, link.title].filter(Boolean).join(' · ')}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {renderItemActions && <div>{renderItemActions(row)}</div>}
    </li>
  )
}

interface ColumnProps {
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  icon: typeof ArrowDownToLine
  rows: DependencyRow[]
  direction: 'INBOUND' | 'OUTBOUND'
  badges: ReactNode
  onEdit: (row: DependencyDetailRow) => void
  renderItemActions?: (row: DependencyDetailRow) => ReactNode
}

function DependencyColumn({
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon: Icon,
  rows,
  direction,
  badges,
  onEdit,
  renderItemActions,
}: ColumnProps) {
  return (
    <section className={cn(cardClass, 'min-w-0 overflow-hidden')} aria-label={title}>
      <SectionHeading title={title} right={<span className="flex items-center gap-1">{badges}</span>} />
      <p className="flex items-center gap-1.5 px-4 pt-2 text-caption text-[var(--ap-fg-subtle)]">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {description}
      </p>
      {rows.length === 0 ? (
        <EmptyState bare icon={Icon} title={emptyTitle} description={emptyDescription} className="py-8" />
      ) : (
        <ul className="divide-y divide-[var(--ap-border)]">
          {rows.map((row) => (
            <DependencyListRow
              key={row.id}
              row={row}
              direction={direction}
              onEdit={onEdit}
              renderItemActions={renderItemActions}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; row: DependencyDetailRow }

export function DependenciesProfileTab({ userId, timeframeId, graphSlot, renderItemActions, className }: DependenciesProfileTabProps) {
  const [showClosed, setShowClosed] = useState(true)
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const query = usePersonDependencies({ userId, timeframeId: timeframeId || null, includeClosed: showClosed })

  const createDefaults = useMemo<DependencyFormDefaults>(
    () => ({ timeframeId: timeframeId || null, neederIds: [userId] }),
    [timeframeId, userId],
  )

  if (query.isLoading) return <LoadingState />

  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status
    return (
      <EmptyState
        className={className}
        icon={GitPullRequestArrow}
        title={status === 403 ? 'Dependencies are private' : 'Could not load dependencies'}
        description={
          status === 403
            ? 'You do not have access to this person’s dependencies.'
            : 'Something went wrong. Try again in a moment.'
        }
        action={status === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  const data = query.data
  if (!data) return null
  const { counts } = data

  const editorNode = (
    <DependencyFormModal
      open={editor.mode !== 'closed'}
      onClose={() => setEditor({ mode: 'closed' })}
      dependency={editor.mode === 'edit' ? editor.row : null}
      defaults={createDefaults}
    />
  )

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-caption text-[var(--ap-fg-subtle)]">
          {counts.inboundLate > 0 && <MiniBadge tone="danger">{counts.inboundLate} inbound late</MiniBadge>}
          <MiniBadge>{counts.inboundOpen} waiting on others</MiniBadge>
          {counts.outboundDueSoon > 0 && <MiniBadge tone="warn">{counts.outboundDueSoon} due within 7 days</MiniBadge>}
          {counts.outboundLate > 0 && <MiniBadge tone="danger">{counts.outboundLate} outbound late</MiniBadge>}
          <MiniBadge>{counts.outboundOpen} others waiting</MiniBadge>
        </div>
        <label className="inline-flex items-center gap-1.5 text-caption text-[var(--ap-fg-subtle)]">
          <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(v === true)} />
          Show done &amp; dropped
        </label>
        {graphSlot && (
          <div className="inline-flex rounded-lg border border-[var(--ap-border)] p-0.5" role="group" aria-label="View">
            {(['list', 'graph'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption ap-focus-ring',
                  view === mode ? 'bg-[var(--ap-bg-sunken)] font-semibold text-[var(--ap-fg)]' : 'text-[var(--ap-fg-subtle)]',
                )}
              >
                {mode === 'graph' && <Network className="size-3.5" aria-hidden />}
                {mode === 'list' ? 'List' : 'Graph'}
              </button>
            ))}
          </div>
        )}
        {data.permissions.canCreate && (
          <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="mr-1 size-3.5" aria-hidden />
            New dependency
          </Button>
        )}
      </div>

      {data.restricted && (
        <p className="rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-4 py-2.5 text-body-sm text-[var(--ap-fg-subtle)]">
          Showing only the dependencies you are part of. The full company list is on the Dependency Map.
        </p>
      )}

      {graphSlot && view === 'graph' ? (
        <div className={cn(cardClass, 'min-h-[420px] overflow-hidden')}>{graphSlot}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <DependencyColumn
            title="Inbound — clear first"
            description="What this person needs from others before they can deliver."
            emptyTitle="Nothing to clear"
            emptyDescription="No one owes this person a dependency in this timeframe."
            icon={ArrowDownToLine}
            rows={data.inbound}
            direction="INBOUND"
            badges={
              <>
                {counts.inboundLate > 0 && <MiniBadge tone="danger" mono>{counts.inboundLate} late</MiniBadge>}
                <MiniBadge mono>{data.inbound.length}</MiniBadge>
              </>
            }
            onEdit={(row) => setEditor({ mode: 'edit', row })}
            renderItemActions={renderItemActions}
          />
          <DependencyColumn
            title="Outbound — others wait on you"
            description="Commitments this person delivers to others."
            emptyTitle="No one is waiting"
            emptyDescription="This person has no commitments others depend on in this timeframe."
            icon={ArrowUpFromLine}
            rows={data.outbound}
            direction="OUTBOUND"
            badges={
              <>
                {counts.outboundDueSoon > 0 && <MiniBadge tone="warn" mono>{counts.outboundDueSoon} soon</MiniBadge>}
                <MiniBadge mono>{data.outbound.length}</MiniBadge>
              </>
            }
            onEdit={(row) => setEditor({ mode: 'edit', row })}
            renderItemActions={renderItemActions}
          />
        </div>
      )}

      <p className="flex items-center gap-1 text-caption text-[var(--ap-fg-subtle)]">
        <ExternalLink className="size-3" aria-hidden />
        <a href={DEPENDENCY_MAP_PATH} className="hover:underline ap-focus-ring">
          Open the company Dependency Map
        </a>
      </p>

      {editorNode}
    </div>
  )
}
