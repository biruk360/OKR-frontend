/**
 * Work dependencies — pure rules (no Prisma), unit-tested in rules.test.ts.
 *
 * Timing (DEP-2), direction and ordering (PRF-16) are NOT re-implemented here:
 * they come from lib/connections/flags.ts so the profile tab, the connection
 * chips and the package cron agree on "late" and "due soon".
 */
import { addDays, startOfDay } from 'date-fns'
import { dependencyTiming, sortDependencies } from '@/lib/connections/flags'
import {
  DEPENDENCY_CLOSED_STATUSES,
  DEPENDENCY_STATUS_LABELS,
  DEPENDENCY_TYPE_LABELS,
  type DependencyStatus,
} from '@/types/package'
import type {
  DependenciesProfileSummary,
  DependencyDueWindow,
  DependencyRow,
  DependencyRowPermissions,
  PersonDependenciesResponse,
} from '../types'

export { dependencyTiming, sortDependencies }

/** DEP-7: package-specific links carry an `X` workbook prefix (X03); company ones DEP14. */
export function isPackageLinkRef(ref: string | null | undefined): boolean {
  return !!ref && /^x\d/i.test(ref.trim())
}

export function isClosedStatus(status: string): boolean {
  return (DEPENDENCY_CLOSED_STATUSES as readonly string[]).includes(status)
}

export interface PartyLike {
  userId: string
  role: string
}

/** DEP-1: inbound = the person NEEDS it; outbound = the person PROVIDES it. Both can hold. */
export function personRoles(parties: readonly PartyLike[], userId: string): { inbound: boolean; outbound: boolean } {
  return {
    inbound: parties.some((p) => p.userId === userId && p.role === 'NEEDER'),
    outbound: parties.some((p) => p.userId === userId && p.role === 'PROVIDER'),
  }
}

/** Provider / needer ids in stored order (first provider = delivery-task assignee, DEP-4). */
export function splitParties(parties: readonly PartyLike[]): { providerIds: string[]; neederIds: string[] } {
  const providerIds: string[] = []
  const neederIds: string[] = []
  for (const p of parties) {
    if (p.role === 'PROVIDER' && !providerIds.includes(p.userId)) providerIds.push(p.userId)
    if (p.role === 'NEEDER' && !neederIds.includes(p.userId)) neederIds.push(p.userId)
  }
  return { providerIds, neederIds }
}

/** Due-window filter (DEP-6). `now` is injectable for tests. */
export function matchesDueWindow(
  dep: { status: string; neededByDate: Date | string | null },
  window: DependencyDueWindow,
  now: Date = new Date(),
): boolean {
  const timing = dependencyTiming(dep, now)
  switch (window) {
    case 'late':
      return timing.late
    case 'due_soon':
      return timing.dueSoon
    case 'next_30': {
      if (!timing.open || !dep.neededByDate) return false
      const due = new Date(dep.neededByDate).getTime()
      const today = startOfDay(now)
      return due >= today.getTime() && due < addDays(today, 30).getTime()
    }
    case 'no_date':
      return !dep.neededByDate
    default:
      return true
  }
}

export interface StatusTransition {
  changed: boolean
  /** New `doneAt` value (unchanged when the status did not move into / out of DONE). */
  doneAt: Date | null
  /** DEP-5: moved into DONE from any other status — needers are notified once. */
  becameDone: boolean
  reopened: boolean
}

/** doneAt is stamped on entering DONE and cleared when the dependency is reopened. */
export function statusTransition(
  before: { status: string; doneAt: Date | null },
  next: DependencyStatus,
  now: Date = new Date(),
): StatusTransition {
  if (before.status === next) {
    return { changed: false, doneAt: before.doneAt, becameDone: false, reopened: false }
  }
  if (next === 'DONE') return { changed: true, doneAt: now, becameDone: true, reopened: false }
  return {
    changed: true,
    doneAt: null,
    becameDone: false,
    reopened: isClosedStatus(before.status) && !isClosedStatus(next),
  }
}

/**
 * May the viewer move the dependency to `next`? Providers may set any working
 * status and DONE (§8 "mark own provided dependencies DONE"); dropping a
 * dependency is an editor decision.
 */
export function canSetStatus(
  perms: Pick<DependencyRowPermissions, 'canChangeStatus' | 'canDrop'>,
  next: DependencyStatus,
): boolean {
  if (!perms.canChangeStatus) return false
  if (next === 'DROPPED') return perms.canDrop
  return true
}

/** Status actions offered in the UI for a row, in display order. */
export function statusActionsFor(row: { status: DependencyStatus; permissions: DependencyRowPermissions }): DependencyStatus[] {
  const order: DependencyStatus[] = ['IN_PROGRESS', 'DONE', 'BLOCKED', 'OPEN', 'DROPPED']
  return order.filter((s) => s !== row.status && canSetStatus(row.permissions, s))
}

type SortableRow = Pick<DependencyRow, 'late' | 'dueSoon' | 'open' | 'neededByDate' | 'ref' | 'title'>

/** PRF-16 split for one person, each column sorted late → due soon → open → done. */
export function splitPersonRows<T extends SortableRow>(
  rows: ReadonlyArray<{ row: T; inbound: boolean; outbound: boolean }>,
): { inbound: T[]; outbound: T[] } {
  return {
    inbound: sortDependencies(rows.filter((r) => r.inbound).map((r) => r.row)),
    outbound: sortDependencies(rows.filter((r) => r.outbound).map((r) => r.row)),
  }
}

export function personCounts(
  inbound: readonly SortableRow[],
  outbound: readonly SortableRow[],
): PersonDependenciesResponse['counts'] {
  return {
    inboundLate: inbound.filter((d) => d.late).length,
    inboundOpen: inbound.filter((d) => d.open).length,
    outboundLate: outbound.filter((d) => d.late).length,
    outboundDueSoon: outbound.filter((d) => d.dueSoon).length,
    outboundOpen: outbound.filter((d) => d.open).length,
  }
}

/** Overview card summary (PRF-2): late/open inbound, due-soon/open outbound, first 3 open inbound. */
export function buildProfileSummary(
  inbound: readonly DependencyRow[],
  outbound: readonly DependencyRow[],
): DependenciesProfileSummary {
  const counts = personCounts(inbound, outbound)
  return {
    inboundLate: counts.inboundLate,
    inboundOpen: counts.inboundOpen,
    outboundDueSoon: counts.outboundDueSoon,
    outboundOpen: counts.outboundOpen,
    topInbound: sortDependencies(inbound.filter((d) => d.open))
      .slice(0, 3)
      .map((d) => ({
        id: d.id,
        ref: d.ref,
        title: d.title,
        status: d.status,
        neededByDate: d.neededByDate,
        late: d.late,
        dueSoon: d.dueSoon,
        href: d.href,
      })),
  }
}

// ---------------------------------------------------------------------------
// CSV (DEP-6 export)
// ---------------------------------------------------------------------------

export const DEPENDENCY_CSV_HEADERS = [
  'Ref',
  'Title',
  'Type',
  'Status',
  'Needed by',
  'Late',
  'Due soon',
  'Owner (delivers)',
  'Needed by (people)',
  'Unblocks',
  'Linked items',
  'Note',
  'Timeframe',
  'Done at',
] as const

/** RFC 4180 quoting, plus a leading-quote guard against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

function names(people: ReadonlyArray<{ name: string | null }>): string {
  return people.map((p) => p.name ?? 'Unknown').join('; ')
}

export function dependencyCsvRow(row: DependencyRow): string[] {
  const detail = row.detail
  return [
    row.ref ?? '',
    row.title,
    DEPENDENCY_TYPE_LABELS[row.depType] ?? row.depType,
    DEPENDENCY_STATUS_LABELS[row.status] ?? row.status,
    day(row.neededByDate),
    row.late ? 'Yes' : '',
    row.dueSoon ? 'Yes' : '',
    detail ? names(row.providers) : '',
    detail ? names(row.needers) : '',
    detail ? row.unblocksText ?? '' : '',
    detail
      ? row.links
          .map((l) => (l.redacted ? 'Private item' : [l.ref, l.title].filter(Boolean).join(' ')))
          .join('; ')
      : '',
    detail ? row.note ?? '' : '',
    row.timeframe?.name ?? '',
    detail ? day(row.doneAt) : '',
  ]
}

/** Whole CSV document (header + rows), CRLF line endings, UTF-8 BOM for Excel. */
export function buildDependencyCsv(rows: readonly DependencyRow[]): string {
  const lines = [DEPENDENCY_CSV_HEADERS as readonly string[], ...rows.map(dependencyCsvRow)]
  return `﻿${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`
}
