'use client'

/**
 * RoleDefinitionSidebarCard — compact role definition for the profile sidebar
 * (PRF-4): seat title, reports to, purpose, first three accountabilities and
 * "View all" → Role & duties tab.
 *
 * Pass the server-built `summary` (getRoleDefinitionProfileSummary) to render
 * without a request; omit it and the card fetches through the list API.
 * Renders nothing when the viewer may not see the role area.
 */
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { profileTabHref } from '@/types/package'
import { useRoleDefinitions } from '../hooks/queries'
import { countVacantSeats, topAccountabilities } from '../services/rules'
import type { RoleDefinitionListResponse, RoleDefinitionProfileSummary } from '../types'
import { RoleDefinitionStatusBadge } from './RoleDefinitionBits'

export interface RoleDefinitionSidebarCardProps {
  userId: string
  timeframeId?: string | null
  /** Server-built summary; `null` = nothing to show; `undefined` = fetch. */
  summary?: RoleDefinitionProfileSummary | null
  className?: string
}

/** Client-side equivalent of getRoleDefinitionProfileSummary. */
export function summarizeRoleDefinitions(data: RoleDefinitionListResponse): RoleDefinitionProfileSummary | null {
  const current = data.current
  if (!current) return null
  return {
    id: current.id,
    seatTitle: current.seatTitle,
    reportsTo: current.reportsTo
      ? { id: current.reportsTo.id, name: current.reportsTo.name }
      : current.reportsToText
        ? { id: null, name: current.reportsToText }
        : null,
    purpose: current.purpose,
    topAccountabilities: topAccountabilities(current.items, 3),
    accountabilityCount: current.items.filter((item) => item.section === 'ACCOUNTABILITY').length,
    status: current.status,
    reportingLineMismatch: data.reportingLine.state === 'MISMATCH',
    vacantSeats: countVacantSeats(data.seats),
  }
}

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-4 shadow-card'

export function RoleDefinitionSidebarCard({ userId, timeframeId, summary, className }: RoleDefinitionSidebarCardProps) {
  const shouldFetch = summary === undefined
  const query = useRoleDefinitions(userId, timeframeId, { enabled: shouldFetch })

  if (shouldFetch && query.isLoading) {
    return (
      <div className={cn(cardClass, 'space-y-2', className)} aria-busy="true">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }
  // Forbidden or failed: the sidebar simply omits the card.
  if (shouldFetch && (query.isError || !query.data)) return null

  const resolved = shouldFetch ? summarizeRoleDefinitions(query.data!) : summary
  const href = profileTabHref(userId, 'role')

  if (!resolved) {
    if (!shouldFetch) return null
    return (
      <div className={cn(cardClass, className)}>
        <Eyebrow>Role</Eyebrow>
        <p className="mt-1 text-body-sm text-[var(--ap-fg-subtle)]">No role definition for this timeframe.</p>
      </div>
    )
  }

  const more = resolved.accountabilityCount - resolved.topAccountabilities.length

  return (
    <section className={cn(cardClass, className)} aria-label="Role definition">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Role</Eyebrow>
        {resolved.status !== 'APPROVED' && <RoleDefinitionStatusBadge status={resolved.status} />}
      </div>
      <h2 className="mt-1 text-body font-semibold leading-snug text-[var(--ap-fg)]">{resolved.seatTitle}</h2>
      {resolved.reportsTo && (
        <p className="mt-1 text-body-sm text-[var(--ap-fg-muted)]">
          Reports to{' '}
          {resolved.reportsTo.id ? (
            <Link
              href={profileTabHref(resolved.reportsTo.id)}
              className="font-medium text-[var(--ap-fg)] hover:underline ap-focus-ring rounded"
            >
              {resolved.reportsTo.name}
            </Link>
          ) : (
            <span className="font-medium text-[var(--ap-fg)]">{resolved.reportsTo.name}</span>
          )}
        </p>
      )}
      {resolved.reportingLineMismatch && (
        <p className="mt-1 flex items-center gap-1 text-caption font-medium text-[var(--ap-warn-fg)]">
          <AlertTriangle className="size-3" aria-hidden />
          Reporting line differs from org chart
        </p>
      )}
      <p className="mt-2 line-clamp-3 text-body-sm text-[var(--ap-fg)]">{resolved.purpose}</p>
      {resolved.topAccountabilities.length > 0 && (
        <ul className="mt-2 space-y-1">
          {resolved.topAccountabilities.map((text, index) => (
            <li key={index} className="flex gap-1.5 text-body-sm text-[var(--ap-fg-muted)]">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--ap-fg-subtle)]" />
              <span className="line-clamp-2">{text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-caption text-[var(--ap-fg-subtle)]">
          {more > 0 ? `+${more} more accountabilities` : ''}
          {resolved.vacantSeats > 0 ? `${more > 0 ? ' · ' : ''}${resolved.vacantSeats} vacant seat${resolved.vacantSeats === 1 ? '' : 's'}` : ''}
        </span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded text-caption font-semibold text-[var(--ap-accent)] hover:underline ap-focus-ring"
        >
          View all
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
