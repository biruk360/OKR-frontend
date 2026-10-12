/**
 * Pure helpers for the KR detail page's connection sections (P4):
 *   - CON-7 "Lands in" — every item that CONTRIBUTES_TO this KR (owner + progress),
 *   - CON-3 linked project milestones (`Milestone.keyResultId`),
 *   - which CON-2 groups the KR rail panel shows (the two above get their own sections).
 *
 * All input comes from `GET /api/connections` (lib/connections/types.ts); redacted
 * items (CON-8) are kept, sorted last, and counted separately so the UI can render
 * them as "Private item" without a title, owner or progress.
 */
import type { ConnectionItem, VisibleConnectionItem } from '@/lib/connections/types'
import type { ConnectionGroupKey } from '@/components/shared/connections'

const TYPE_ORDER: Record<string, number> = { OBJECTIVE: 0, KEY_RESULT: 1 }

function isVisible(item: ConnectionItem): item is VisibleConnectionItem {
  return !item.redacted
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' })
}

export interface LandsInSummary {
  /** Visible rows first (objectives, then KRs; by owner, then title), private rows last. */
  rows: ConnectionItem[]
  visibleCount: number
  privateCount: number
  /** Distinct owners among the visible rows. */
  ownerCount: number
  /** Mean progress (0–100) of the visible rows that report one; null when none do. */
  averageProgress: number | null
}

/** CON-7: order and summarise the items that land in (contribute to) a KR. */
export function summarizeLandsIn(items: readonly ConnectionItem[]): LandsInSummary {
  const visible = items.filter(isVisible)
  const hidden = items.filter((i) => !isVisible(i))
  const sorted = [...visible].sort(
    (a, b) =>
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
      compareText(a.owner?.name, b.owner?.name) ||
      compareText(a.title, b.title),
  )
  const owners = new Set(visible.map((i) => i.owner?.id).filter((id): id is string => !!id))
  const progresses = visible
    .map((i) => i.progress)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
  const averageProgress =
    progresses.length > 0 ? progresses.reduce((sum, p) => sum + p, 0) / progresses.length : null
  return {
    rows: [...sorted, ...hidden],
    visibleCount: visible.length,
    privateCount: hidden.length,
    ownerCount: owners.size,
    averageProgress,
  }
}

/** CON-3: milestones by due date (undated after dated), private ones last. */
export function sortMilestones(items: readonly ConnectionItem[]): ConnectionItem[] {
  const due = (i: VisibleConnectionItem) => {
    const t = i.dueDate ? new Date(i.dueDate).getTime() : Number.NaN
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
  }
  const visible = items.filter(isVisible).sort((a, b) => {
    const da = due(a)
    const db = due(b)
    if (da !== db) return da < db ? -1 : 1
    return compareText(a.title, b.title)
  })
  return [...visible, ...items.filter((i) => !isVisible(i))]
}

/** Clamp a 0–100 progress for a bar width. */
export function progressWidth(progress: number | null | undefined): number {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, progress))
}

/** Every CON-2 group, in panel order. */
export const ALL_CONNECTION_GROUPS: readonly ConnectionGroupKey[] = [
  'alignsTo',
  'supportedBy',
  'predecessors',
  'successors',
  'inbound',
  'outbound',
  'decisions',
  'kpis',
  'duties',
  'development',
  'milestones',
]

/**
 * Groups the KR detail rail panel shows. "Supported by" (CON-7 Lands in) and
 * project milestones (CON-3) have their own sections on the page, so the rail
 * leaves them out to avoid listing the same items twice.
 */
export const KR_RAIL_CONNECTION_GROUPS: readonly ConnectionGroupKey[] = ALL_CONNECTION_GROUPS.filter(
  (g) => g !== 'supportedBy' && g !== 'milestones',
)

/** Objective / KR level → is it a company item (CON-7 heading + empty state). */
export function isCompanyLevel(level: string | null | undefined): boolean {
  return level === 'COMPANY'
}
