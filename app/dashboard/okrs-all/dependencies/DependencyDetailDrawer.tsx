'use client'

/**
 * Dependency quick view for the Dependency Map (`?dependency=<id>` /
 * `?focus=<id>` deep links, table row click, graph node click).
 *
 * Full rows show parties, links, unblocks, note and the actions the API
 * allows (`row.permissions`); summary rows (§8 titles + status) show only
 * what the viewer may see.
 */
import { format } from 'date-fns'
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Gavel,
  Link2,
  ListTodo,
  Lock,
  Pencil,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import {
  DependencyStatusBadge,
  statusActionsFor,
  useCreateDeliveryTask,
  useDependency,
  useSetDependencyStatus,
  type DependencyDetailRow,
  type DependencyPerson,
} from '@/features/dependencies'
import { todoHref } from '@/lib/connections/flags'
import { decisionHref } from '@/lib/package/links'
import {
  DEPENDENCY_STATUS_LABELS,
  DEPENDENCY_TYPE_LABELS,
  profileTabHref,
  type DependencyStatus,
} from '@/types/package'

export interface DependencyDetailDrawerProps {
  dependencyId: string | null
  onClose: () => void
  onEdit: (row: DependencyDetailRow) => void
}

const STATUS_ICON: Partial<Record<DependencyStatus, LucideIcon>> = { DONE: CheckCircle2, OPEN: RotateCcw }

function formatDay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, 'd MMM yyyy')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-micro font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">{label}</p>
      <div className="text-body-sm text-[var(--ap-fg)]">{children}</div>
    </div>
  )
}

function PeopleList({ people, empty }: { people: DependencyPerson[]; empty: string }) {
  if (people.length === 0) return <p className="text-body-sm text-[var(--ap-fg-subtle)]">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {people.map((p) => (
        <li key={p.id}>
          <a
            href={profileTabHref(p.id, 'links')}
            className="inline-flex items-center gap-2 rounded-md text-body-sm hover:underline ap-focus-ring"
          >
            <UserAvatar user={{ id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar }} size={22} tooltip={false} />
            {p.name ?? 'Unknown person'}
          </a>
        </li>
      ))}
    </ul>
  )
}

function DetailBody({ row, onEdit }: { row: DependencyDetailRow; onEdit: (row: DependencyDetailRow) => void }) {
  const setStatus = useSetDependencyStatus()
  const deliveryTask = useCreateDeliveryTask()
  const busy = setStatus.isPending || deliveryTask.isPending
  const actions = statusActionsFor(row)

  return (
    <div className="space-y-5">
      <Field label="Needed by">
        <span className={row.late ? 'font-medium text-[var(--ap-danger-fg)]' : row.dueSoon ? 'text-[var(--ap-warn-fg)]' : undefined}>
          {formatDay(row.neededByDate) ?? 'No needed-by date'}
        </span>
        {row.doneAt && <span className="ml-2 text-[var(--ap-fg-subtle)]">· Done {formatDay(row.doneAt)}</span>}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Delivered by (providers)">
          <PeopleList people={row.providers} empty="No provider yet" />
        </Field>
        <Field label="Waiting (needers)">
          <PeopleList people={row.needers} empty="No needer yet" />
        </Field>
      </div>

      {row.unblocksText && (
        <Field label="Unblocks">
          <p className="whitespace-pre-line">{row.unblocksText}</p>
        </Field>
      )}

      {row.links.length > 0 && (
        <Field label="Linked items">
          <ul className="flex flex-wrap gap-1.5">
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
                    className="inline-flex max-w-[300px] items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-0.5 text-caption hover:underline ap-focus-ring"
                  >
                    <Link2 className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{[link.ref, link.title].filter(Boolean).join(' · ')}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {row.note && (
        <Field label="Note">
          <p className="whitespace-pre-line">{row.note}</p>
        </Field>
      )}

      {(row.deliveryTodoId || row.decisionId) && (
        <div className="flex flex-wrap gap-3 text-caption">
          {row.deliveryTodoId && (
            <a href={todoHref(row.deliveryTodoId)} className="inline-flex items-center gap-1 hover:underline ap-focus-ring">
              <ClipboardList className="size-3.5" aria-hidden />
              Delivery task
            </a>
          )}
          {row.decisionId && (
            <a href={decisionHref(row.decisionId)} className="inline-flex items-center gap-1 hover:underline ap-focus-ring">
              <Gavel className="size-3.5" aria-hidden />
              Linked decision
            </a>
          )}
        </div>
      )}

      <p className="text-caption text-[var(--ap-fg-subtle)]">
        {row.createdBy?.name ? `Raised by ${row.createdBy.name}` : 'Raised'} on {formatDay(row.createdAt)}
        {row.timeframe ? ` · ${row.timeframe.name}` : ''}
      </p>

      {(actions.length > 0 || row.permissions.canEdit || (row.permissions.canCreateDeliveryTask && row.open)) && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--ap-border)] pt-4">
          {actions.map((status) => {
            const Icon = STATUS_ICON[status]
            return (
              <Button
                key={status}
                size="sm"
                variant={status === 'DONE' ? 'default' : status === 'DROPPED' ? 'destructive' : 'outline'}
                disabled={busy}
                onClick={() => setStatus.mutate({ id: row.id, body: { status } })}
              >
                {Icon && <Icon className="mr-1 size-3.5" aria-hidden />}
                {status === 'OPEN' && !row.open ? 'Reopen' : `Mark ${DEPENDENCY_STATUS_LABELS[status].toLowerCase()}`}
              </Button>
            )
          })}
          {row.permissions.canCreateDeliveryTask && row.open && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => deliveryTask.mutate(row.id)}>
              <ListTodo className="mr-1 size-3.5" aria-hidden />
              Create delivery task
            </Button>
          )}
          {row.permissions.canEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(row)}>
              <Pencil className="mr-1 size-3.5" aria-hidden />
              Edit
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function DependencyDetailDrawer({ dependencyId, onClose, onEdit }: DependencyDetailDrawerProps) {
  const query = useDependency(dependencyId)
  const row = query.data
  const title = row ? [row.ref, row.title].filter(Boolean).join(' · ') : 'Dependency'

  return (
    <SideDrawer open={!!dependencyId} onClose={onClose} title={title} width="lg">
      <div className="space-y-5 px-4 pb-6">
        {query.isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading dependency">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {query.isError && (
          <EmptyState
            bare
            icon={Lock}
            title={(query.error as { status?: number } | null)?.status === 404 ? 'Dependency not found' : 'Could not open this dependency'}
            description={
              (query.error as { status?: number } | null)?.status === 404
                ? 'It may have been removed, or the link is wrong.'
                : 'You may not have access to it, or something went wrong.'
            }
          />
        )}

        {row && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.ref && <MiniBadge mono>{row.ref}</MiniBadge>}
              <MiniBadge>{DEPENDENCY_TYPE_LABELS[row.depType]}</MiniBadge>
              <DependencyStatusBadge status={row.status} late={row.late} dueSoon={row.dueSoon} />
              {row.detail && row.isPackageLink && <MiniBadge tone="accent">Package link</MiniBadge>}
            </div>
            <h3 className="text-body font-semibold leading-snug text-[var(--ap-fg)]">{row.title}</h3>
            {row.detail ? (
              <DetailBody row={row} onEdit={onEdit} />
            ) : (
              <div className="space-y-3">
                <Field label="Needed by">{formatDay(row.neededByDate) ?? 'No needed-by date'}</Field>
                <p className="rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-3 py-2 text-body-sm text-[var(--ap-fg-subtle)]">
                  You can see this dependency’s title and status. Parties, links and notes are visible to the people
                  involved, their managers, HR and leadership.
                </p>
              </div>
            )}
            <a
              href={row.href}
              className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-subtle)] hover:underline ap-focus-ring"
            >
              <ExternalLink className="size-3" aria-hidden />
              Link to this dependency
            </a>
          </>
        )}
      </div>
    </SideDrawer>
  )
}
