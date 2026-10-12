/**
 * Operating package (PKG-1…5) — pure rules. Client-safe, no Prisma.
 */
import {
  isPackageStatus,
  isReviewVerdict,
  type PackageReviewEntityType,
  type PackageStatus,
  type PackageWeights,
} from '@/types/package'
import type { PackageReviewSummary } from '../types'

// ---------------------------------------------------------------------------
// Lifecycle (PKG-1)
// ---------------------------------------------------------------------------

/** States a package may be approved from. Imported packages may skip IN_REVIEW. */
export const APPROVABLE_STATUSES: readonly PackageStatus[] = ['DRAFT', 'IN_REVIEW']

/** Manual status moves allowed through PATCH (submit / approve have their own routes). */
const PATCH_TRANSITIONS: Record<PackageStatus, readonly PackageStatus[]> = {
  DRAFT: ['ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'ARCHIVED'],
  APPROVED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

export function normalizePackageStatus(value: unknown): PackageStatus {
  return isPackageStatus(value) ? value : 'DRAFT'
}

export function canTransitionByPatch(from: PackageStatus, to: PackageStatus): boolean {
  return from === to || PATCH_TRANSITIONS[from].includes(to)
}

export function canSubmitFrom(status: PackageStatus): boolean {
  return status === 'DRAFT'
}

export function canApproveFrom(status: PackageStatus): boolean {
  return APPROVABLE_STATUSES.includes(status)
}

/** PKG-2: the employee reviews items only while the package is IN_REVIEW. */
export function canReviewIn(status: PackageStatus): boolean {
  return status === 'IN_REVIEW'
}

/**
 * Next package version label: "v1" → "v2", "v2.1" → "v3", "" → "v2".
 * Used when an APPROVED package is reopened for a new round.
 */
export function nextPackageVersion(current: string | null | undefined): string {
  const match = /(\d+)/.exec(current ?? '')
  const n = match ? Number.parseInt(match[1], 10) : 1
  return `v${Number.isFinite(n) ? n + 1 : 2}`
}

// ---------------------------------------------------------------------------
// Weights (PKG-4) and summary lines
// ---------------------------------------------------------------------------

/** Keys shown in the mix, in display order; unknown numeric keys follow. */
export const WEIGHT_DISPLAY_ORDER = ['kpis', 'values', 'okr', 'development'] as const

export const WEIGHT_LABELS: Record<string, string> = {
  kpis: 'KPIs',
  values: 'Values',
  okr: 'OKRs',
  development: 'Development',
}

/** Parse stored weightsJson into finite, non-negative numbers; null when nothing usable. */
export function parsePackageWeights(raw: unknown): PackageWeights | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: PackageWeights = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    if (Number.isFinite(n) && n >= 0) out[key] = n
  }
  return Object.keys(out).length > 0 ? out : null
}

export interface WeightSegment {
  key: string
  label: string
  value: number
  /** Share of the total, 0–100. */
  percent: number
}

/** Weights as ordered segments for the mix bar. */
export function weightSegments(weights: PackageWeights | null | undefined): WeightSegment[] {
  if (!weights) return []
  const keys = [
    ...WEIGHT_DISPLAY_ORDER.filter((k) => typeof weights[k] === 'number'),
    ...Object.keys(weights).filter(
      (k) => !(WEIGHT_DISPLAY_ORDER as readonly string[]).includes(k) && typeof weights[k] === 'number',
    ),
  ]
  const total = keys.reduce((sum, k) => sum + (weights[k] ?? 0), 0)
  return keys.map((key) => {
    const value = weights[key] ?? 0
    return {
      key,
      label: WEIGHT_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      value,
      percent: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }
  })
}

export function weightsTotal(weights: PackageWeights | null | undefined): number {
  if (!weights) return 0
  return Object.values(weights).reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
}

/**
 * summaryJson → display lines. Accepts an array of strings, an array of
 * `{ text }` / `{ label, value }` objects (importer shapes) or `{ lines: [...] }`.
 */
export function parseSummaryLines(raw: unknown): string[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { lines?: unknown }).lines)
      ? (raw as { lines: unknown[] }).lines
      : []
  const lines: string[] = []
  for (const entry of source) {
    if (typeof entry === 'string') {
      if (entry.trim()) lines.push(entry.trim())
    } else if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      if (typeof e.text === 'string' && e.text.trim()) lines.push(e.text.trim())
      else if (typeof e.label === 'string' && e.value != null) lines.push(`${e.label.trim()}: ${String(e.value)}`)
    }
  }
  return lines
}

// ---------------------------------------------------------------------------
// Review summary (PKG-2)
// ---------------------------------------------------------------------------

export function packageItemKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`
}

export interface ReviewRowForSummary {
  entityType: string
  entityId: string
  verdict: string
  reviewerId: string
  resolvedAt: Date | string | null
}

/**
 * "n of m reviewed · k disputes open".
 *  - `total` = items currently in the package.
 *  - `reviewed` / `agreed` / `disputed` count the employee's own verdicts on
 *    items still in the package.
 *  - `disputesOpen` counts every unresolved DISPUTE in the package, including
 *    one on an item deleted since — a manager must resolve it before approval.
 */
export function summarizeReviews(
  itemKeys: ReadonlySet<string>,
  reviews: readonly ReviewRowForSummary[],
  employeeId: string,
): PackageReviewSummary {
  const verdictByItem = new Map<string, string>()
  let disputesOpen = 0
  for (const review of reviews) {
    if (!isReviewVerdict(review.verdict)) continue
    if (review.verdict === 'DISPUTE' && !review.resolvedAt) disputesOpen += 1
    if (review.reviewerId !== employeeId) continue
    const key = packageItemKey(review.entityType, review.entityId)
    if (itemKeys.has(key)) verdictByItem.set(key, review.verdict)
  }
  let agreed = 0
  let disputed = 0
  verdictByItem.forEach((verdict) => {
    if (verdict === 'AGREE') agreed += 1
    else disputed += 1
  })
  return { reviewed: verdictByItem.size, total: itemKeys.size, agreed, disputed, disputesOpen }
}

export const EMPTY_REVIEW_SUMMARY: PackageReviewSummary = {
  reviewed: 0,
  total: 0,
  agreed: 0,
  disputed: 0,
  disputesOpen: 0,
}

/**
 * What an upsert does to the resolution fields. A new or changed DISPUTE
 * reopens (clears resolvedAt / resolution); AGREE withdraws a dispute, so a
 * previous resolution is cleared too. Editing the comment of an unresolved
 * dispute keeps it unresolved.
 */
export function reviewUpsertEffect(
  previous: { verdict: string; resolvedAt: Date | string | null } | null,
  nextVerdict: 'AGREE' | 'DISPUTE',
): { clearResolution: boolean; notifyDispute: boolean } {
  if (nextVerdict === 'AGREE') return { clearResolution: !!previous?.resolvedAt, notifyDispute: false }
  const reopening = !previous || previous.verdict !== 'DISPUTE' || !!previous.resolvedAt
  return { clearResolution: !!previous?.resolvedAt, notifyDispute: reopening }
}

/** Human label for a review entity type (notifications, lists). */
export const PACKAGE_REVIEW_ENTITY_LABELS: Record<PackageReviewEntityType, string> = {
  OBJECTIVE: 'Objective',
  KEY_RESULT: 'Key result',
  TODO: 'Milestone',
  KPI: 'KPI',
  DUTY: 'Recurring duty',
  DEVELOPMENT: 'Development item',
  ROLE_ITEM: 'Role definition item',
  DEPENDENCY: 'Dependency',
}
