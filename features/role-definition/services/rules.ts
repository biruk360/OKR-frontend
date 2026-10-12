/**
 * Role definition (ROL) — pure rules. Client-safe, unit-tested in rules.test.ts.
 *
 * - pickCurrentDefinition: which version the profile shows for a timeframe (ROL-1).
 * - checkReportingLine:    reportsToId vs the org chart (ROL-3). Never edits the org chart.
 * - resolveDirectReportSeats: planned seats vs actual direct reports (ROL-4).
 */
import { ROLE_ITEM_SECTIONS, type RoleItemSection } from '@/types/package'
import type {
  DirectReportSeat,
  ReportingLineCheck,
  RoleDefinitionItemDTO,
  RoleDefinitionPerson,
} from '../types'

// ---------------------------------------------------------------------------
// ROL-1: versions
// ---------------------------------------------------------------------------

interface VersionLike {
  id: string
  timeframeId: string | null
  status: string
  createdAt: string | Date
  approvedAt?: string | Date | null
}

function time(value: string | Date | null | undefined): number {
  if (!value) return 0
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Newest first: by createdAt, ties broken by id for a stable order. */
export function sortVersionsNewestFirst<T extends VersionLike>(versions: readonly T[]): T[] {
  return [...versions].sort((a, b) => time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? 1 : -1))
}

/**
 * The version the profile shows for `timeframeId`, and a DRAFT awaiting
 * approval (if any). Approved versions win over drafts so the profile keeps
 * showing the agreed role while a new version is prepared:
 *   1. the APPROVED version in the timeframe (pending = a newer draft there);
 *   2. else the APPROVED evergreen version (timeframeId = null), with the
 *      timeframe's draft (or a newer evergreen draft) as pending;
 *   3. else the latest DRAFT in the timeframe, then the latest evergreen DRAFT.
 * With no timeframe, falls back to the newest APPROVED version of any timeframe.
 */
export function pickCurrentDefinition<T extends VersionLike>(
  versions: readonly T[],
  timeframeId: string | null,
): { current: T | null; pendingDraft: T | null } {
  const sorted = sortVersionsNewestFirst(versions)
  const scoped = (tf: string | null) => sorted.filter((v) => v.timeframeId === tf)
  const approved = (list: T[]) => list.find((v) => v.status === 'APPROVED') ?? null
  const draft = (list: T[]) => list.find((v) => v.status === 'DRAFT') ?? null
  const newer = (d: T | null, a: T) => (d && time(d.createdAt) >= time(a.createdAt) ? d : null)

  const tfPool = timeframeId ? scoped(timeframeId) : []
  const evergreenPool = scoped(null)
  const tfApproved = approved(tfPool)
  const tfDraft = draft(tfPool)
  const evergreenApproved = approved(evergreenPool)
  const evergreenDraft = draft(evergreenPool)

  if (tfApproved) return { current: tfApproved, pendingDraft: newer(tfDraft, tfApproved) }
  if (evergreenApproved) {
    return { current: evergreenApproved, pendingDraft: tfDraft ?? newer(evergreenDraft, evergreenApproved) }
  }
  if (tfDraft) return { current: tfDraft, pendingDraft: null }
  if (evergreenDraft) return { current: evergreenDraft, pendingDraft: null }
  if (!timeframeId) {
    const anyApproved = approved(sorted)
    if (anyApproved) return { current: anyApproved, pendingDraft: null }
  }
  return { current: null, pendingDraft: null }
}

/** Ids of the APPROVED versions approving `targetId` supersedes (same user + timeframe). */
export function versionsToSupersede<T extends VersionLike & { userId: string }>(
  versions: readonly T[],
  target: { id: string; userId: string; timeframeId: string | null },
): string[] {
  return versions
    .filter(
      (v) =>
        v.id !== target.id &&
        v.userId === target.userId &&
        v.timeframeId === target.timeframeId &&
        v.status === 'APPROVED',
    )
    .map((v) => v.id)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Items grouped by section in the canonical order, each sorted by position. */
export function groupItemsBySection<T extends Pick<RoleDefinitionItemDTO, 'section' | 'position'>>(
  items: readonly T[],
): Array<{ section: RoleItemSection; items: T[] }> {
  const groups: Array<{ section: RoleItemSection; items: T[] }> = []
  for (const section of ROLE_ITEM_SECTIONS) {
    const inSection = items.filter((item) => item.section === section).sort((a, b) => a.position - b.position)
    if (inSection.length > 0) groups.push({ section, items: inSection })
  }
  return groups
}

/** Assign positions in list order (0, 1, 2 …) — the editor's order is the stored order. */
export function withPositions<T extends object>(items: readonly T[]): Array<T & { position: number }> {
  return items.map((item, index) => ({ ...item, position: index }))
}

/** First `n` accountability texts (PRF-4 sidebar). */
export function topAccountabilities(items: readonly Pick<RoleDefinitionItemDTO, 'section' | 'position' | 'label' | 'text'>[], n = 3): string[] {
  return items
    .filter((item) => item.section === 'ACCOUNTABILITY')
    .sort((a, b) => a.position - b.position)
    .slice(0, n)
    .map((item) => (item.label ? `${item.label}: ${item.text}` : item.text))
}

// ---------------------------------------------------------------------------
// ROL-3: reporting line
// ---------------------------------------------------------------------------

export function checkReportingLine(
  reportsToId: string | null | undefined,
  orgChartManagers: readonly RoleDefinitionPerson[],
): ReportingLineCheck {
  if (!reportsToId) return { state: 'UNKNOWN', orgChartManagers: [...orgChartManagers] }
  const matches = orgChartManagers.some((m) => m.id === reportsToId)
  return { state: matches ? 'MATCH' : 'MISMATCH', orgChartManagers: [...orgChartManagers] }
}

// ---------------------------------------------------------------------------
// ROL-4: direct-report seats
// ---------------------------------------------------------------------------

const TRAILING_PAREN = /\s*\(([^()]*)\)\s*$/

/** Split "Presales Lead (30 Nov 2026)" into the title and the trailing note. */
export function splitSeatText(raw: string): { title: string; note: string | null } {
  const text = raw.trim()
  const match = TRAILING_PAREN.exec(text)
  if (!match) return { title: text, note: null }
  const title = text.slice(0, match.index).trim()
  const note = match[1].trim()
  return { title: title || text, note: note || null }
}

/** Lower-case, drop parentheticals and punctuation, collapse whitespace. */
export function normalizeSeatTitle(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/\([^()]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const MIN_CONTAINS_LENGTH = 4

/** Do two titles name the same seat? Exact after normalising, or one contains the other as whole words. */
export function seatTitlesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeSeatTitle(a)
  const y = normalizeSeatTitle(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length < MIN_CONTAINS_LENGTH) return false
  return ` ${long} `.includes(` ${short} `)
}

export interface DirectReportCandidate extends RoleDefinitionPerson {
  /** Seat title of the report's own current role definition, when they have one. */
  seatTitle?: string | null
}

/**
 * ROL-4: each DIRECT_REPORT_SEAT item is filled by the first unused direct
 * report (ManagerRelationship, endedAt = null) whose seat title or designation
 * matches; otherwise it is Vacant. Exact matches are assigned before
 * containment matches, so "Sales Engineer" does not steal "Senior Sales Engineer".
 */
export function resolveDirectReportSeats(
  items: readonly Pick<RoleDefinitionItemDTO, 'id' | 'section' | 'label' | 'text' | 'position'>[],
  directReports: readonly DirectReportCandidate[],
): DirectReportSeat[] {
  const seatItems = items.filter((item) => item.section === 'DIRECT_REPORT_SEAT').sort((a, b) => a.position - b.position)
  const seats: DirectReportSeat[] = seatItems.map((item) => {
    const split = splitSeatText(item.label?.trim() || item.text)
    const noteFromText = item.label?.trim() ? splitSeatText(item.text).note ?? null : null
    return {
      itemId: item.id,
      title: split.title,
      plannedNote: split.note ?? noteFromText,
      text: item.text,
      filledBy: null,
    }
  })

  const used = new Set<string>()
  const titlesOf = (person: DirectReportCandidate) => [person.seatTitle, person.designation].filter(Boolean) as string[]

  const assign = (exact: boolean) => {
    for (const seat of seats) {
      if (seat.filledBy) continue
      const target = normalizeSeatTitle(seat.title)
      const person = directReports.find(
        (p) =>
          !used.has(p.id) &&
          titlesOf(p).some((title) => (exact ? normalizeSeatTitle(title) === target : seatTitlesMatch(title, seat.title))),
      )
      if (person) {
        used.add(person.id)
        const { seatTitle: _seatTitle, ...rest } = person
        seat.filledBy = rest
      }
    }
  }
  assign(true)
  assign(false)
  return seats
}

/** Number of planned seats nobody fills yet. */
export function countVacantSeats(seats: readonly DirectReportSeat[]): number {
  return seats.filter((seat) => !seat.filledBy).length
}
