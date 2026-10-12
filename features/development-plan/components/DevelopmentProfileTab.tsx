'use client'

/**
 * DevelopmentProfileTab — the profile's "Development" tab (PRF-15): the two
 * DEV-3 rule bars (items done, hours logged), then the item list with status,
 * due date, overdue / due-soon chip (DEV-4), linked KR and evidence (DEV-1), and the
 * CON-1 connection chips (dependencies, decisions, alignment) on every item row.
 * Actions appear only when the list API's `permissions` allow them.
 *
 * The profile shell can inject the package review controls (PKG-2) through
 * `renderItemActions` (features never import each other).
 */
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Target,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Progress } from '@/components/ui/progress'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { ConnectionChips, type ConnectionChipKind } from '@/components/shared/connections'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { cn } from '@/lib/utils'
import {
  DEVELOPMENT_KIND_LABELS,
  DEVELOPMENT_STATUS_LABELS,
  type DevelopmentStatus,
} from '@/types/package'
import { useDevelopmentItems, useUpdateDevelopmentItem } from '../hooks/queries'
import { formatHours } from '../services/rules'
import type { DevelopmentItemDTO, DevelopmentListResponse, DevelopmentRuleProgress } from '../types'
import { DevelopmentItemFormModal } from './DevelopmentItemFormModal'
import { DropDevelopmentItemDialog, LogDevelopmentHoursDialog, MarkDevelopmentDoneDialog } from './DevelopmentItemDialogs'

export interface DevelopmentProfileTabProps {
  userId: string
  timeframeId: string
  /** Per-item slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  renderItemActions?: (item: DevelopmentItemDTO) => ReactNode
  className?: string
}

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

const STATUS_TONE: Record<DevelopmentStatus, MiniBadgeTone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'accent',
  DONE: 'ok',
  DROPPED: 'neutral',
}

/** The row already links its KR, so the chips skip the duplicate "aligns to". */
const KR_SHOWN_HIDE: readonly ConnectionChipKind[] = ['alignsTo']

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; item: DevelopmentItemDTO }

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // Due dates are calendar dates stored at 00:00 UTC.
  return format(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), 'd MMM yyyy')
}

function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)} aria-busy="true" aria-label="Loading development plan">
      <div className={cn(cardClass, 'space-y-4 p-5')}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-2 w-full" />
      </div>
      <div className={cn(cardClass, 'space-y-3 p-5')}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    </div>
  )
}

function RuleBar({
  label,
  value,
  required,
  percent,
  met,
  unit,
}: {
  label: string
  value: string
  required: string
  percent: number
  met: boolean
  unit?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm font-medium text-[var(--ap-fg)]">{label}</span>
        <span className="text-body-sm tabular-nums text-[var(--ap-fg-muted)]">
          <span className={cn('font-semibold', met ? 'text-[var(--ap-ok-fg)]' : 'text-[var(--ap-fg)]')}>{value}</span>
          {' '}of {required}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <Progress
        className="mt-1.5"
        value={percent}
        fill={met ? 'var(--ap-ok)' : 'var(--ap-accent)'}
        aria-label={`${label}: ${value} of ${required}${unit ? ` ${unit}` : ''}`}
      />
    </div>
  )
}

function RuleCard({ rule, data }: { rule: DevelopmentRuleProgress; data: DevelopmentListResponse }) {
  const allMet = rule.itemsMet && rule.hoursMet
  return (
    <section className={cn(cardClass, 'p-5')} aria-label="Yearly development rule">
      <SectionHeading
        title="Yearly development rule"
        as="h3"
        right={
          <MiniBadge tone={allMet ? 'ok' : 'neutral'}>{allMet ? 'Met' : data.timeframeName ?? 'This timeframe'}</MiniBadge>
        }
      />
      <p className="mt-2 text-caption text-[var(--ap-fg-subtle)]">
        At least {rule.itemsRequired} certification or course and {formatHours(rule.hoursRequired)} training hours.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <RuleBar
          label="Certifications & courses done"
          value={String(rule.itemsDone)}
          required={String(rule.itemsRequired)}
          percent={rule.itemsPercent}
          met={rule.itemsMet}
        />
        <RuleBar
          label="Training hours logged"
          value={formatHours(rule.hoursLogged)}
          required={formatHours(rule.hoursRequired)}
          unit="h"
          percent={rule.hoursPercent}
          met={rule.hoursMet}
        />
      </div>
      {data.counts.overdue > 0 && (
        <p className="mt-3 text-caption font-medium text-[var(--ap-danger-fg)]">
          {data.counts.overdue} item{data.counts.overdue === 1 ? ' is' : 's are'} overdue.
        </p>
      )}
    </section>
  )
}

function ItemRow({
  item,
  actions,
  extra,
}: {
  item: DevelopmentItemDTO
  actions: ActionsMenuItem[]
  extra?: ReactNode
}) {
  const due = formatDate(item.dueDate)
  const completed = formatDate(item.completedAt)
  const dropped = item.status === 'DROPPED'
  const hasMenu = actions.some((a) => !a.hidden)
  const hoursText =
    item.targetHours != null
      ? `${formatHours(item.hoursLogged)} of ${formatHours(item.targetHours)} h`
      : item.hoursLogged > 0
        ? `${formatHours(item.hoursLogged)} h logged`
        : null

  return (
    <li className="flex items-start gap-3 py-3.5" aria-label={item.title}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <MiniBadge tone={STATUS_TONE[item.status]}>{DEVELOPMENT_STATUS_LABELS[item.status]}</MiniBadge>
          <span className="text-caption text-[var(--ap-fg-subtle)]">{DEVELOPMENT_KIND_LABELS[item.kind]}</span>
          {item.isMandatory && <MiniBadge tone="accent">Mandatory</MiniBadge>}
          {item.overdue && <MiniBadge tone="danger">Overdue</MiniBadge>}
          {!item.overdue && item.dueSoon && <MiniBadge tone="warn">Due soon</MiniBadge>}
          {item.externalRef && (
            <span className="font-mono text-caption text-[var(--ap-fg-subtle)]">{item.externalRef}</span>
          )}
        </div>
        <p
          className={cn(
            'mt-1 text-body font-medium text-[var(--ap-fg)]',
            dropped && 'text-[var(--ap-fg-subtle)] line-through',
          )}
        >
          {item.title}
        </p>
        <dl className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-[var(--ap-fg-muted)]">
          <div className="flex items-center gap-1">
            <dt className="sr-only">Target</dt>
            <dd>{item.targetText}</dd>
          </div>
          {hoursText && (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Hours</dt>
              <dd className="flex items-center gap-1 tabular-nums">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {hoursText}
              </dd>
            </div>
          )}
          {due && (
            <div className="flex items-center gap-1">
              <dt>Due</dt>
              <dd className={cn('font-medium', item.overdue ? 'text-[var(--ap-danger-fg)]' : 'text-[var(--ap-fg)]')}>{due}</dd>
            </div>
          )}
          {item.status === 'DONE' && completed && (
            <div className="flex items-center gap-1">
              <dt>Completed</dt>
              <dd className="font-medium text-[var(--ap-fg)]">{completed}</dd>
            </div>
          )}
          {item.keyResult && (
            <div className="flex min-w-0 items-center gap-1">
              <dt className="flex items-center">
                <Target className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Linked key result</span>
              </dt>
              <dd className="min-w-0 truncate">
                {item.keyResult.href ? (
                  <Link
                    href={item.keyResult.href}
                    className="rounded font-medium text-[var(--ap-accent)] hover:underline ap-focus-ring"
                  >
                    {item.keyResult.title}
                  </Link>
                ) : (
                  <span className="italic text-[var(--ap-fg-subtle)]">{item.keyResult.title}</span>
                )}
              </dd>
            </div>
          )}
        </dl>

        <ConnectionChips
          entityType="DEVELOPMENT"
          entityId={item.id}
          compact
          hide={item.keyResult ? KR_SHOWN_HIDE : undefined}
          max={6}
          className="mt-1.5"
        />

        {(item.evidence.note || item.evidence.url) && (
          <div className="mt-2 rounded-lg bg-[var(--ap-bg-sunken)] px-3 py-2 text-body-sm text-[var(--ap-fg)]">
            <span className="text-caption font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">Evidence</span>
            {item.evidence.note && <p className="mt-0.5 whitespace-pre-line">{item.evidence.note}</p>}
            {item.evidence.url && (
              <a
                href={item.evidence.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded text-[var(--ap-accent)] hover:underline ap-focus-ring"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{item.evidence.url}</span>
              </a>
            )}
          </div>
        )}
        {!item.evidence.note && !item.evidence.url && item.requiresEvidence && item.status !== 'DROPPED' && (
          <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">No evidence yet — needed before this is marked done.</p>
        )}
        {dropped && item.dropReason && (
          <p className="mt-1 text-caption text-[var(--ap-fg-muted)]">
            <span className="font-medium">Dropped:</span> {item.dropReason}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {extra}
        {hasMenu && <ActionsMenu items={actions} label={`Actions for ${item.title}`} />}
      </div>
    </li>
  )
}

export function DevelopmentProfileTab({ userId, timeframeId, renderItemActions, className }: DevelopmentProfileTabProps) {
  const query = useDevelopmentItems(userId, timeframeId)
  const updateMutation = useUpdateDevelopmentItem()
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [doneTarget, setDoneTarget] = useState<DevelopmentItemDTO | null>(null)
  const [dropTarget, setDropTarget] = useState<DevelopmentItemDTO | null>(null)
  const [hoursTarget, setHoursTarget] = useState<DevelopmentItemDTO | null>(null)
  const [showDropped, setShowDropped] = useState(false)

  const data = query.data
  const visibleItems = useMemo(
    () => (data ? data.items.filter((item) => showDropped || item.status !== 'DROPPED') : []),
    [data, showDropped],
  )

  if (query.isLoading) return <LoadingState className={className} />

  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status
    return (
      <EmptyState
        className={className}
        icon={GraduationCap}
        title={status === 403 ? 'Development plan is private' : 'Could not load the development plan'}
        description={
          status === 403
            ? 'Only the person, their managers, their department lead and HR can see the development plan.'
            : 'Something went wrong. Try again in a moment.'
        }
        action={status === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  if (!data) return null
  const { permissions } = data
  const effectiveTimeframeId = data.timeframeId || timeframeId

  const setStatus = (item: DevelopmentItemDTO, status: 'IN_PROGRESS' | 'NOT_STARTED', message: string) =>
    updateMutation.mutate({ id: item.id, body: { status }, successMessage: message })

  const actionsFor = (item: DevelopmentItemDTO): ActionsMenuItem[] => {
    const open = item.status === 'NOT_STARTED' || item.status === 'IN_PROGRESS'
    return [
      {
        key: 'hours',
        label: 'Log hours',
        icon: Clock,
        hidden: !permissions.canLogHours || item.status === 'DROPPED',
        onSelect: () => setHoursTarget(item),
      },
      {
        key: 'start',
        label: 'Start',
        icon: Play,
        hidden: !permissions.canChangeStatus || item.status !== 'NOT_STARTED',
        disabled: updateMutation.isPending,
        onSelect: () => setStatus(item, 'IN_PROGRESS', 'Item started'),
      },
      {
        key: 'done',
        label: 'Mark done…',
        icon: CheckCircle2,
        hidden: !permissions.canChangeStatus || !open,
        onSelect: () => setDoneTarget(item),
      },
      {
        key: 'edit',
        label: 'Edit',
        icon: Pencil,
        hidden: !permissions.canEdit,
        onSelect: () => setForm({ mode: 'edit', item }),
      },
      {
        key: 'reopen',
        label: item.status === 'DROPPED' ? 'Restore' : 'Reopen',
        icon: RotateCcw,
        divider: true,
        hidden: !permissions.canChangeStatus || open,
        disabled: updateMutation.isPending,
        onSelect: () =>
          setStatus(item, 'IN_PROGRESS', item.status === 'DROPPED' ? 'Item restored' : 'Item reopened'),
      },
      {
        key: 'drop',
        label: 'Drop…',
        icon: Ban,
        destructive: true,
        divider: true,
        hidden: !permissions.canChangeStatus || item.status === 'DROPPED',
        onSelect: () => setDropTarget(item),
      },
    ]
  }

  const dialogs = (
    <>
      <DevelopmentItemFormModal
        open={form.mode !== 'closed'}
        onClose={() => setForm({ mode: 'closed' })}
        ownerId={userId}
        timeframeId={effectiveTimeframeId}
        item={form.mode === 'edit' ? form.item : null}
      />
      <MarkDevelopmentDoneDialog item={doneTarget} onClose={() => setDoneTarget(null)} />
      <DropDevelopmentItemDialog item={dropTarget} onClose={() => setDropTarget(null)} />
      <LogDevelopmentHoursDialog item={hoursTarget} onClose={() => setHoursTarget(null)} />
    </>
  )

  return (
    <div className={cn('space-y-4', className)}>
      <RuleCard rule={data.rule} data={data} />

      <section className={cn(cardClass, 'p-5')} aria-labelledby="development-items-title">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="development-items-title" className="min-w-0 flex-1 text-section-title font-semibold text-[var(--ap-fg)]">
            Development items
            <span className="ml-2 text-body-sm font-normal tabular-nums text-[var(--ap-fg-subtle)]">
              {data.counts.done} done · {data.counts.open} open
            </span>
          </h3>
          {data.counts.dropped > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowDropped((v) => !v)} aria-pressed={showDropped}>
              {showDropped ? 'Hide dropped' : `Show dropped (${data.counts.dropped})`}
            </Button>
          )}
          {permissions.canCreate && (
            <Button size="sm" onClick={() => setForm({ mode: 'create' })}>
              <Plus aria-hidden />
              Add item
            </Button>
          )}
        </div>

        {data.readOnly && (
          <p className="mt-2 text-caption text-[var(--ap-fg-subtle)]">This timeframe has ended, so its development plan is read-only.</p>
        )}

        {visibleItems.length === 0 ? (
          <EmptyState
            bare
            icon={GraduationCap}
            title={data.items.length === 0 ? 'No development items yet' : 'Only dropped items'}
            description={
              data.items.length === 0
                ? permissions.canCreate
                  ? 'Plan the certifications, courses and training hours for this timeframe.'
                  : 'The person, their manager or HR adds development items.'
                : 'Every item in this timeframe was dropped.'
            }
            action={
              data.items.length === 0 && permissions.canCreate
                ? { label: 'Add item', onClick: () => setForm({ mode: 'create' }) }
                : undefined
            }
          />
        ) : (
          <ul className="mt-2 divide-y divide-[var(--ap-border)]">
            {visibleItems.map((item) => (
              <ItemRow key={item.id} item={item} actions={actionsFor(item)} extra={renderItemActions?.(item)} />
            ))}
          </ul>
        )}
      </section>

      {dialogs}
    </div>
  )
}
