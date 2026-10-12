'use client'

/**
 * One recurring duty on the Role & duties tab (PRF-13): timing, duration,
 * output, collaborator avatars, linked KR chip, connection chips (CON-1),
 * adherence (DUT-5), next due, and Pause / Resume / Retire / Log occurrence /
 * Edit / Delete actions as the API allows.
 */
import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Clock,
  FileOutput,
  Link2,
  Lock,
  Pause,
  Pencil,
  Play,
  Archive,
  Timer,
  Trash2,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { Button } from '@/components/ui/button'
import { UserAvatarStack } from '@/components/shared/UserAvatar'
import { ConnectionChips, ConnectionsPanel } from '@/components/shared/connections'
import { keyResultHref, objectiveHref } from '@/lib/package/links'
import { cn } from '@/lib/utils'
import { DUTY_STATUS_LABELS } from '@/types/package'
import { formatDuration, parseDutyDate } from '../services/schedule'
import type { AdherenceWindow } from '../services/adherence'
import type { DutyDTO } from '../types'

export type DutyCardAction = 'edit' | 'pause' | 'resume' | 'retire' | 'delete' | 'log'

export interface DutyCardProps {
  duty: DutyDTO
  onAction: (action: DutyCardAction, duty: DutyDTO) => void
  /** Disable the action controls while a mutation for this duty is running. */
  busy?: boolean
  /** Per-card slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  extra?: ReactNode
}

export function adherenceTone(rate: number | null): MiniBadgeTone {
  if (rate === null) return 'neutral'
  if (rate >= 80) return 'ok'
  if (rate >= 50) return 'warn'
  return 'danger'
}

function AdherenceBadge({ label, window }: { label: string; window: AdherenceWindow }) {
  const text = window.rate === null ? '—' : `${window.rate}%`
  const title =
    window.rate === null ? `${label}: nothing was due yet` : `${label}: ${window.done} of ${window.due} occurrences done`
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className="text-micro font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">{label}</span>
      <MiniBadge tone={adherenceTone(window.rate)} mono>
        {text}
      </MiniBadge>
    </span>
  )
}

function formatDue(key: string | null): string | null {
  const d = parseDutyDate(key)
  if (!d) return null
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function DutyCard({ duty, onAction, busy = false, extra }: DutyCardProps) {
  const isEvent = duty.cadence === 'EVENT'
  const people = [
    ...(duty.owner ? [{ id: duty.owner.id, name: duty.owner.name, avatar: duty.owner.avatar }] : []),
    ...duty.collaborators.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
  ]
  const nextDue = formatDue(duty.nextDue)
  const duration = formatDuration(duty.durationMin)
  const showLog = duty.canLog && (isEvent || !duty.todoHeadId)
  // CON-2: the duty's full connections panel, expanded on demand (loads only then).
  const [showConnections, setShowConnections] = useState(false)
  const connectionsId = useId()

  const items: ActionsMenuItem[] = [
    { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => onAction('edit', duty), hidden: !duty.canEdit },
    {
      key: 'log',
      label: 'Log occurrence',
      icon: CalendarPlus,
      onSelect: () => onAction('log', duty),
      hidden: !duty.canLog || showLog,
    },
    {
      key: 'pause',
      label: 'Pause',
      icon: Pause,
      onSelect: () => onAction('pause', duty),
      hidden: !duty.canEdit || duty.status !== 'ACTIVE',
    },
    {
      key: 'resume',
      label: 'Resume',
      icon: Play,
      onSelect: () => onAction('resume', duty),
      hidden: !duty.canEdit || duty.status !== 'PAUSED',
    },
    {
      key: 'retire',
      label: 'Retire',
      icon: Archive,
      onSelect: () => onAction('retire', duty),
      hidden: !duty.canEdit || duty.status === 'RETIRED',
      divider: true,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onSelect: () => onAction('delete', duty),
      hidden: !duty.canDelete,
    },
  ]
  const visibleItems = items.filter((i) => !i.hidden)

  return (
    <article
      className={cn(
        'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-3 sm:p-4',
        duty.status !== 'ACTIVE' && 'bg-[var(--ap-bg-sunken)]',
      )}
      aria-label={duty.title}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4
              className={cn(
                'text-body-sm font-semibold text-[var(--ap-fg)]',
                duty.status === 'RETIRED' && 'text-[var(--ap-fg-muted)] line-through',
              )}
            >
              {duty.title}
            </h4>
            {duty.externalRef && (
              <MiniBadge mono title="Workbook reference">
                {duty.externalRef}
              </MiniBadge>
            )}
            {duty.status !== 'ACTIVE' && (
              <MiniBadge tone={duty.status === 'PAUSED' ? 'warn' : 'neutral'}>{DUTY_STATUS_LABELS[duty.status]}</MiniBadge>
            )}
            {isEvent && duty.eventLabel && <MiniBadge tone="accent">{duty.eventLabel}</MiniBadge>}
            {!isEvent && !duty.autoTask && (
              <MiniBadge title="No to-dos are generated for this duty">No auto task</MiniBadge>
            )}
          </div>

          <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-caption text-[var(--ap-fg-muted)]">
            {duty.timingText && (
              <div className="inline-flex items-center gap-1">
                <dt className="sr-only">Timing</dt>
                <Clock className="size-3.5" aria-hidden />
                <dd>{duty.timingText}</dd>
              </div>
            )}
            {duration && (
              <div className="inline-flex items-center gap-1">
                <dt className="sr-only">Duration</dt>
                <Timer className="size-3.5" aria-hidden />
                <dd>{duration}</dd>
              </div>
            )}
            {duty.outputText && (
              <div className="inline-flex min-w-0 items-center gap-1">
                <dt className="sr-only">Output</dt>
                <FileOutput className="size-3.5 shrink-0" aria-hidden />
                <dd className="truncate">{duty.outputText}</dd>
              </div>
            )}
          </dl>
        </div>

        {extra || visibleItems.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {extra}
            {visibleItems.length > 0 && <ActionsMenu items={visibleItems} label={`Actions for ${duty.title}`} />}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {people.length > 0 && <UserAvatarStack users={people} size={22} max={5} />}
        {duty.keyResult &&
          (duty.keyResult.isRedacted ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 text-caption font-semibold text-[var(--ap-fg-muted)]">
              <Lock className="size-3" aria-hidden />
              {duty.keyResult.title}
            </span>
          ) : (
            <Link
              href={keyResultHref(duty.keyResult.id)}
              className="inline-flex h-6 max-w-[260px] items-center gap-1 rounded-full bg-[var(--ap-accent-soft)] px-2 text-caption font-semibold text-[var(--ap-accent-on-soft)] ap-focus-ring hover:brightness-95"
              title={duty.keyResult.title}
            >
              <Link2 className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{duty.keyResult.title}</span>
            </Link>
          ))}
        {!duty.keyResult &&
          duty.objective &&
          (duty.objective.isRedacted ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 text-caption font-semibold text-[var(--ap-fg-muted)]">
              <Lock className="size-3" aria-hidden />
              {duty.objective.title}
            </span>
          ) : (
            <Link
              href={objectiveHref(duty.objective.id)}
              className="inline-flex h-6 max-w-[260px] items-center gap-1 rounded-full bg-[var(--ap-accent-soft)] px-2 text-caption font-semibold text-[var(--ap-accent-on-soft)] ap-focus-ring hover:brightness-95"
              title={duty.objective.title}
            >
              <Link2 className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{duty.objective.title}</span>
            </Link>
          ))}
        <ConnectionChips entityType="DUTY" entityId={duty.id} compact hide={['alignsTo']} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--ap-border)] pt-2.5">
        <AdherenceBadge label="30 d" window={duty.adherence.d30} />
        <AdherenceBadge label="90 d" window={duty.adherence.d90} />
        <span className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-secondary)]">
          <CalendarClock className="size-3.5" aria-hidden />
          {nextDue ? (
            <>
              Next due <span className="font-semibold text-[var(--ap-fg)]">{nextDue}</span>
            </>
          ) : (
            <span className="text-[var(--ap-fg-muted)]">{isEvent ? 'When it happens' : 'Nothing scheduled'}</span>
          )}
        </span>
        {duty.overdue > 0 && <MiniBadge tone="danger">{duty.overdue} overdue</MiniBadge>}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showConnections}
            aria-controls={connectionsId}
            onClick={() => setShowConnections((v) => !v)}
          >
            <ChevronDown className={cn('transition-transform', showConnections && 'rotate-180')} aria-hidden />
            Connections
          </Button>
          {showLog && (
            <Button size="sm" variant="outline" onClick={() => onAction('log', duty)} disabled={busy}>
              <CalendarPlus aria-hidden />
              Log occurrence
            </Button>
          )}
          {duty.canEdit && duty.status === 'ACTIVE' && !isEvent && duty.todoHeadId && (
            <Button size="sm" variant="ghost" onClick={() => onAction('pause', duty)} disabled={busy}>
              <Pause aria-hidden />
              Pause
            </Button>
          )}
          {duty.canEdit && duty.status === 'PAUSED' && (
            <Button size="sm" variant="ghost" onClick={() => onAction('resume', duty)} disabled={busy}>
              <Play aria-hidden />
              Resume
            </Button>
          )}
        </div>
      </div>

      {showConnections && (
        <div id={connectionsId} className="mt-2.5">
          <ConnectionsPanel entityType="DUTY" entityId={duty.id} variant="rail" emptyText="Nothing is linked to this duty yet." />
        </div>
      )}
    </article>
  )
}
