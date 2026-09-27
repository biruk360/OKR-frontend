/**
 * Board filters — the sprint board's filter facets and how a card is matched.
 *
 * Pure helpers behind the board's filter row
 * (docs/trello_parity_sprint_board_REQUIREMENTS.md BRD-2/BRD-3; the assignee
 * facet is docs/card_comments_links_board_filter_REQUIREMENTS.md AFL-*).
 *
 * Facets and semantics:
 *   assignees  multi — card's assignee OR any member is selected (AFL-4);
 *              UNASSIGNED_FILTER_ID matches cards with nobody on them.
 *   labels     multi — card carries ANY selected label; NO_LABEL_FILTER_ID
 *              matches cards with no labels.
 *   due        multi — card falls in ANY selected bucket:
 *                overdue  not done and past its due instant (same rule as the
 *                         card's red date chip — lib/todos/due-tone)
 *                today    due date is today's calendar day (local)
 *                week     due date is in the current Monday–Sunday week
 *                none     no due date
 *   watching   toggle — the viewer watches the card.
 *   linked     all | linked | unlinked (OKR key-result link).
 *
 * OR within a facet, AND across facets. An empty facet matches every card.
 * Every date comparison takes an injected `now`, so the rules are testable.
 */

import { dueInstant } from '@/lib/todos/due-tone'
import {
  UNASSIGNED_FILTER_ID,
  cardMatchesPeople,
  readSavedAssignees,
  type BoardPeopleCard,
} from './board-people'

export { UNASSIGNED_FILTER_ID }

/** Selection id that matches cards with no labels. */
export const NO_LABEL_FILTER_ID = '__nolabel__'

export type DueFilter = 'overdue' | 'today' | 'week' | 'none'
export const DUE_FILTERS: readonly DueFilter[] = ['overdue', 'today', 'week', 'none']
export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Due this week',
  none: 'No due date',
}

export type LinkedFilter = 'all' | 'linked' | 'unlinked'
const LINKED_VALUES: readonly LinkedFilter[] = ['all', 'linked', 'unlinked']

export interface BoardFilterState {
  assignees: string[]
  labels: string[]
  due: DueFilter[]
  watching: boolean
  linked: LinkedFilter
}

/** A fresh "no filters" state (fresh arrays, so callers may keep it in state). */
export function emptyBoardFilters(): BoardFilterState {
  return { assignees: [], labels: [], due: [], watching: false, linked: 'all' }
}

export interface BoardLabelDef {
  id: string
  name: string
  color: string
  pattern?: string | null
}

/** The slice of a board card the filters read. */
export interface BoardFilterCard extends BoardPeopleCard {
  status: string
  dueDate: string | Date | null
  endTime?: string | null
  keyResult?: unknown
  labels?: ReadonlyArray<{ labelDef: BoardLabelDef | null }> | null
  watchers?: ReadonlyArray<{ userId: string }> | null
}

type Columns<C> = ReadonlyArray<{ todos: ReadonlyArray<C> }>

// ─── Labels ────────────────────────────────────────────────────────────────

/** Distinct label ids on a card. */
export function cardLabelIds(card: Pick<BoardFilterCard, 'labels'>): string[] {
  const ids = new Set<string>()
  for (const l of card.labels ?? []) if (l?.labelDef?.id) ids.add(l.labelDef.id)
  return Array.from(ids)
}

/** OR within the facet; the no-label sentinel matches unlabelled cards. */
export function cardMatchesLabels(
  card: Pick<BoardFilterCard, 'labels'>,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true
  const ids = cardLabelIds(card)
  if (ids.length === 0) return selected.has(NO_LABEL_FILTER_ID)
  return ids.some((id) => selected.has(id))
}

export interface BoardLabel extends BoardLabelDef {
  /** Cards carrying the label across the whole board (not the filtered view). */
  cardCount: number
}

/** The labels in use on the board, de-duplicated, by name (case-insensitive). */
export function deriveBoardLabels(columns: Columns<Pick<BoardFilterCard, 'labels'>>): BoardLabel[] {
  const labels = new Map<string, BoardLabel>()
  for (const col of columns) {
    for (const card of col.todos) {
      for (const l of card.labels ?? []) {
        const def = l?.labelDef
        if (!def?.id) continue
        const existing = labels.get(def.id)
        if (existing) existing.cardCount++
        else labels.set(def.id, {
          id: def.id,
          name: def.name ?? '',
          color: def.color,
          pattern: def.pattern ?? null,
          cardCount: 1,
        })
      }
    }
  }
  return Array.from(labels.values()).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    return byName !== 0 ? byName : a.id.localeCompare(b.id)
  })
}

export function countUnlabelledCards(columns: Columns<Pick<BoardFilterCard, 'labels'>>): number {
  let n = 0
  for (const col of columns) for (const card of col.todos) if (cardLabelIds(card).length === 0) n++
  return n
}

/**
 * Drop selected label ids no longer on the board (same reasoning as AFL-7).
 * Keeps the no-label sentinel. Returns the SAME array when nothing changed.
 */
export function pruneLabelSelection(selected: string[], labels: ReadonlyArray<{ id: string }>): string[] {
  const known = new Set(labels.map((l) => l.id))
  const next = selected.filter((id) => id === NO_LABEL_FILTER_ID || known.has(id))
  return next.length === selected.length ? selected : next
}

// ─── Due ───────────────────────────────────────────────────────────────────

function startOfLocalDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Monday 00:00 (local) of the week containing `now`, and the next Monday. */
export function currentWeekRange(now: Date): { start: Date; end: Date } {
  const start = startOfLocalDay(now)
  const sinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - sinceMonday)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function isDone(status: string): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED'
}

/** Every due bucket a card falls in. A card may be in several (e.g. today + week). */
export function cardDueBuckets(
  card: Pick<BoardFilterCard, 'status' | 'dueDate' | 'endTime'>,
  now: Date,
): Set<DueFilter> {
  const out = new Set<DueFilter>()
  if (!card.dueDate) {
    out.add('none')
    return out
  }
  const due = new Date(card.dueDate)
  if (Number.isNaN(due.getTime())) {
    out.add('none')
    return out
  }
  if (!isDone(card.status) && dueInstant(due, card.endTime) < now) out.add('overdue')
  const day = startOfLocalDay(due).getTime()
  if (day === startOfLocalDay(now).getTime()) out.add('today')
  const week = currentWeekRange(now)
  if (day >= week.start.getTime() && day < week.end.getTime()) out.add('week')
  return out
}

export function cardMatchesDue(
  card: Pick<BoardFilterCard, 'status' | 'dueDate' | 'endTime'>,
  selected: ReadonlySet<DueFilter>,
  now: Date,
): boolean {
  if (selected.size === 0) return true
  const buckets = cardDueBuckets(card, now)
  for (const b of Array.from(buckets)) if (selected.has(b)) return true
  return false
}

/** Cards per due bucket over the whole board — the options' counts. */
export function countDueBuckets(
  columns: Columns<Pick<BoardFilterCard, 'status' | 'dueDate' | 'endTime'>>,
  now: Date,
): Record<DueFilter, number> {
  const counts: Record<DueFilter, number> = { overdue: 0, today: 0, week: 0, none: 0 }
  for (const col of columns) {
    for (const card of col.todos) {
      for (const b of Array.from(cardDueBuckets(card, now))) counts[b]++
    }
  }
  return counts
}

// ─── Watching / linked ─────────────────────────────────────────────────────

export function isWatchingCard(card: Pick<BoardFilterCard, 'watchers'>, userId: string | null | undefined): boolean {
  if (!userId) return false
  return !!card.watchers?.some((w) => w?.userId === userId)
}

export function cardMatchesLinked(card: Pick<BoardFilterCard, 'keyResult'>, linked: LinkedFilter): boolean {
  if (linked === 'linked') return !!card.keyResult
  if (linked === 'unlinked') return !card.keyResult
  return true
}

// ─── Combined ──────────────────────────────────────────────────────────────

/** BRD-2 badge — each facet with anything selected counts once. */
export function countActiveFilters(state: BoardFilterState): number {
  return (
    (state.assignees.length > 0 ? 1 : 0) +
    (state.labels.length > 0 ? 1 : 0) +
    (state.due.length > 0 ? 1 : 0) +
    (state.watching ? 1 : 0) +
    (state.linked !== 'all' ? 1 : 0)
  )
}

/**
 * Build the card predicate once per filter change: OR within each facet, AND
 * across facets. Sets are built here rather than per card.
 */
export function compileBoardFilter(
  state: BoardFilterState,
  ctx: { currentUserId?: string | null; now: Date },
): (card: BoardFilterCard) => boolean {
  const people = new Set(state.assignees)
  const labels = new Set(state.labels)
  const due = new Set(state.due)
  const { currentUserId, now } = ctx
  return (card) =>
    cardMatchesPeople(card, people) &&
    cardMatchesLabels(card, labels) &&
    cardMatchesDue(card, due, now) &&
    (!state.watching || isWatchingCard(card, currentUserId)) &&
    cardMatchesLinked(card, state.linked)
}

// ─── Persistence (BRD-3) ───────────────────────────────────────────────────

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0)))
}

/**
 * Read a persisted filter object. Accepts every shape the board has written:
 * the original `{ assignee, linked }`, the AFL `{ assignees, linked }`, and
 * the current full shape. Unknown or malformed fields read as "no filter".
 */
export function readSavedBoardFilters(saved: unknown): BoardFilterState {
  if (!saved || typeof saved !== 'object') return emptyBoardFilters()
  const s = saved as { labels?: unknown; due?: unknown; watching?: unknown; linked?: unknown }
  const dueSet = new Set<string>(DUE_FILTERS)
  return {
    // AFL-6 — `assignees: string[]`, or the legacy `assignee: string`.
    assignees: readSavedAssignees(saved),
    labels: stringList(s.labels),
    due: stringList(s.due).filter((d): d is DueFilter => dueSet.has(d)),
    watching: s.watching === true,
    linked: LINKED_VALUES.includes(s.linked as LinkedFilter) ? (s.linked as LinkedFilter) : 'all',
  }
}

/** The object written to localStorage. Round-trips through readSavedBoardFilters. */
export function serializeBoardFilters(state: BoardFilterState): BoardFilterState {
  return {
    assignees: state.assignees,
    labels: state.labels,
    due: state.due,
    watching: state.watching,
    linked: state.linked,
  }
}
