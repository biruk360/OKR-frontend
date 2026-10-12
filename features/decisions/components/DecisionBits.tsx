'use client'

/**
 * Small shared pieces of the decisions UI: status badge, overdue chip,
 * person and link chips, and date formatting.
 */
import Link from 'next/link'
import { format } from 'date-fns'
import { AlertTriangle, Lock } from 'lucide-react'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { DECISION_STATUS_LABELS, type DecisionLinkEntityType, type DecisionStatus } from '@/types/package'
import type { DecisionLinkView, DecisionPerson, DecisionRelation } from '../types'

const STATUS_TONE: Record<DecisionStatus, MiniBadgeTone> = {
  OPEN: 'accent',
  DECIDED: 'ok',
  DEFERRED: 'warn',
  WITHDRAWN: 'neutral',
}

export function DecisionStatusBadge({ status, className }: { status: DecisionStatus; className?: string }) {
  return (
    <MiniBadge tone={STATUS_TONE[status]} className={className}>
      {DECISION_STATUS_LABELS[status]}
    </MiniBadge>
  )
}

/** DEC-1: OPEN and past neededBy. */
export function DecisionOverdueChip({ className }: { className?: string }) {
  return (
    <MiniBadge tone="danger" className={cn('gap-1', className)} title="Past the needed-by date and still open">
      <AlertTriangle className="size-3" aria-hidden />
      Overdue
    </MiniBadge>
  )
}

export function formatDecisionDate(value: string | null | undefined, pattern = 'd MMM yyyy'): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, pattern)
}

export function DecisionPersonInline({ person, size = 18 }: { person: DecisionPerson; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar user={{ id: person.id, name: person.name, avatar: person.avatar }} size={size} tooltip={false} />
      <span className="truncate text-body-sm text-[var(--ap-fg)]">{person.name}</span>
    </span>
  )
}

const LINK_TYPE_LABEL: Record<DecisionLinkEntityType, string> = {
  USER: 'Person',
  OBJECTIVE: 'Objective',
  KEY_RESULT: 'KR',
  TODO: 'Task',
  KPI: 'KPI',
  DUTY: 'Duty',
  DEVELOPMENT: 'Development',
  DEPENDENCY: 'Dependency',
}

export const RELATION_LABEL: Record<DecisionRelation, string> = {
  LINKED: 'Linked to this person',
  ITEM: 'Linked to their work',
  REQUESTER: 'Requested by them',
  DECIDER: 'They decide',
}

/** One linked item as a compact chip; redacted / missing targets get a neutral placeholder. */
export function DecisionLinkChip({ link }: { link: DecisionLinkView }) {
  const type = LINK_TYPE_LABEL[link.entityType]
  if (link.redacted) {
    return (
      <MiniBadge tone="neutral" className="gap-1" title="You do not have access to this item">
        <Lock className="size-3" aria-hidden />
        Private {type.toLowerCase()}
      </MiniBadge>
    )
  }
  if (link.missing || !link.title) {
    return (
      <MiniBadge tone="neutral" title="This item was removed">
        {type} (removed)
      </MiniBadge>
    )
  }
  const label = (
    <>
      <span className="text-[var(--ap-fg-subtle)]">{link.ref ?? type}</span>
      <span className="max-w-[16rem] truncate">{link.title}</span>
    </>
  )
  const className =
    'inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-0.5 text-caption text-[var(--ap-fg)]'
  return link.href ? (
    <Link href={link.href} className={cn(className, 'ap-focus-ring hover:bg-surface-hover')} title={link.title}>
      {label}
    </Link>
  ) : (
    <span className={className} title={link.title}>
      {label}
    </span>
  )
}

export function DecisionLinkChips({ links, max = 4, className }: { links: DecisionLinkView[]; max?: number; className?: string }) {
  if (links.length === 0) return null
  const shown = links.slice(0, max)
  const rest = links.length - shown.length
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((link) => (
        <DecisionLinkChip key={link.id || `${link.entityType}:${link.entityId}`} link={link} />
      ))}
      {rest > 0 && <MiniBadge tone="neutral">+{rest} more</MiniBadge>}
    </div>
  )
}

/** Text block (options, unblocks, decision) that keeps the author's line breaks. */
export function DecisionTextBlock({ label, text, className }: { label: string; text: string | null; className?: string }) {
  if (!text) return null
  return (
    <div className={className}>
      <p className="text-caption font-medium uppercase tracking-wide text-[var(--ap-fg-subtle)]">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-body-sm text-[var(--ap-fg)]">{text}</p>
    </div>
  )
}
