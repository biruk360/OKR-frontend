'use client'

/**
 * AlignmentTrail (CON-5) — "Company O1 › KR1.3 › EDN-O1 › EDN-KR1.1", built from
 * `parentObjectiveId` + CONTRIBUTES_TO by climbing GET /api/connections one step
 * at a time (see `pickAlignmentParent` for which way each step goes).
 *
 *   - `variant="inline"` (default) — a compact crumb row for headers and quick views;
 *   - `variant="bar"`              — the detail-page bar, rendered by OkrBreadcrumb.
 *
 * A step the viewer may not see shows as "Private item" with no link (CON-8).
 * When the item aligns to nothing the trail renders nothing (unless `showWhenAlone`).
 */
import Link from 'next/link'
import { ChevronRight, KeyRound, Lock, Target } from 'lucide-react'
import OkrBreadcrumb, { type BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { connectionItemShortLabel, PRIVATE_ITEM_LABEL } from '@/components/shared/connections'
import { cn } from '@/lib/utils'
import type { ConnectionItem } from '@/lib/connections/types'
import type { OkrLinkEntityType } from '@/types/package'
import { useAlignmentChain } from '../hooks/useOkrLinks'
import { otherAlignments } from '../utils'

export interface AlignmentTrailProps {
  entityType: OkrLinkEntityType
  entityId: string
  variant?: 'inline' | 'bar'
  /** Label for the subject crumb (defaults to its title from the API). */
  subjectLabel?: string
  /** Workbook ref of the subject ("EDN-KR1.1"). */
  subjectRef?: string | null
  maxDepth?: number
  /** Render the lone subject crumb when nothing is above it. Default false. */
  showWhenAlone?: boolean
  /** Plain left click on a crumb (e.g. close a quick view). */
  onNavigate?: () => void
  /** Right-hand adornment for the bar variant. */
  right?: React.ReactNode
  className?: string
}

interface Crumb {
  key: string
  type: OkrLinkEntityType
  label: string
  code: string | null
  title: string
  href: string | null
  redacted: boolean
}

function crumbFromItem(item: ConnectionItem & { type: OkrLinkEntityType }): Crumb {
  if (item.redacted) {
    return { key: `${item.type}:${item.id}`, type: item.type, label: PRIVATE_ITEM_LABEL, code: null, title: PRIVATE_ITEM_LABEL, href: null, redacted: true }
  }
  return {
    key: `${item.type}:${item.id}`,
    type: item.type,
    label: connectionItemShortLabel(item, 28),
    code: item.ref,
    title: item.title,
    href: item.href,
    redacted: false,
  }
}

function plainClick(onNavigate?: () => void) {
  if (!onNavigate) return undefined
  return (e: React.MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onNavigate()
  }
}

function InlineCrumb({ crumb, current, onNavigate }: { crumb: Crumb; current: boolean; onNavigate?: () => void }) {
  const Icon = crumb.redacted ? Lock : crumb.type === 'KEY_RESULT' ? KeyRound : Target
  const inner = (
    <>
      <Icon className="size-3 shrink-0" style={{ color: crumb.redacted ? 'var(--ap-fg-subtle)' : 'var(--ap-accent)' }} aria-hidden />
      <span className={cn('truncate', crumb.redacted && 'italic')}>{crumb.label}</span>
    </>
  )
  const base = 'inline-flex min-w-0 max-w-[220px] items-center gap-1 rounded-[6px] px-1 py-0.5'
  if (current || !crumb.href) {
    return (
      <span
        className={base}
        title={crumb.title}
        aria-current={current ? 'page' : undefined}
        style={{ color: current ? 'var(--ap-fg)' : 'var(--ap-fg-muted)', fontWeight: current ? 600 : undefined }}
      >
        {inner}
      </span>
    )
  }
  return (
    <Link
      href={crumb.href}
      title={crumb.title}
      onClick={plainClick(onNavigate)}
      className={cn(base, 'transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]')}
      style={{ color: 'var(--ap-fg-muted)' }}
    >
      {inner}
    </Link>
  )
}

export function AlignmentTrail({
  entityType,
  entityId,
  variant = 'inline',
  subjectLabel,
  subjectRef,
  maxDepth = 6,
  showWhenAlone = false,
  onNavigate,
  right,
  className,
}: AlignmentTrailProps) {
  const { subject, ancestors, complete, isLoading } = useAlignmentChain({ type: entityType, id: entityId }, { maxDepth })

  if (isLoading) {
    return <Skeleton className={cn('h-5 w-64 max-w-full', className)} aria-label="Loading alignment" />
  }
  if (!subject) return null
  if (ancestors.length === 0 && complete && !showWhenAlone) return null

  const subjectCrumb: Crumb = {
    key: `${entityType}:${entityId}`,
    type: entityType,
    label: subject.subject.redacted ? PRIVATE_ITEM_LABEL : subjectRef || subjectLabel || subject.subject.title || 'This item',
    code: subjectRef ?? null,
    title: subject.subject.redacted ? PRIVATE_ITEM_LABEL : subject.subject.title ?? subjectLabel ?? '',
    href: null,
    redacted: subject.subject.redacted,
  }
  const crumbs = [...ancestors].reverse().map(crumbFromItem)
  const extra = otherAlignments(subject)

  if (variant === 'bar') {
    const nodes: BreadcrumbNode[] = [...crumbs, subjectCrumb].map((c) => ({
      id: c.key,
      title: c.redacted ? PRIVATE_ITEM_LABEL : c.title,
      kind: c.type === 'KEY_RESULT' ? 'KR' : 'OBJ',
      code: c.code ?? undefined,
      href: c.href ?? undefined,
    }))
    return (
      <OkrBreadcrumb
        nodes={nodes}
        className={className}
        right={
          <>
            {extra.length > 0 && (
              <MiniBadge tone="accent" title={`Also aligns to: ${extra.map((i) => connectionItemShortLabel(i)).join(', ')}`}>
                +{extra.length} more
              </MiniBadge>
            )}
            {right}
          </>
        }
      />
    )
  }

  return (
    <nav aria-label="Alignment trail" className={cn('flex min-w-0 flex-wrap items-center gap-0.5 text-xs', className)}>
      {!complete && (
        <>
          <Skeleton className="h-4 w-16" />
          <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
        </>
      )}
      {crumbs.map((crumb) => (
        <span key={crumb.key} className="inline-flex min-w-0 items-center gap-0.5">
          <InlineCrumb crumb={crumb} current={false} onNavigate={onNavigate} />
          <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
        </span>
      ))}
      <InlineCrumb crumb={subjectCrumb} current onNavigate={onNavigate} />
      {extra.length > 0 && (
        <MiniBadge
          tone="accent"
          className="ml-1"
          title={`Also aligns to: ${extra.map((i) => connectionItemShortLabel(i)).join(', ')}`}
        >
          +{extra.length}
        </MiniBadge>
      )}
    </nav>
  )
}

export default AlignmentTrail
