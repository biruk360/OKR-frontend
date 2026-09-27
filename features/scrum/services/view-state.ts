/**
 * Pure view-state helpers for the Daily Scrum home (no Prisma, client-safe):
 * date-key math for the month/week/day views, deep-link parsing, and the
 * saved-view filter shape.
 */

export const SCRUM_HOME_VIEWS = ['month', 'week', 'day', 'streak', 'analytics'] as const
export type ScrumHomeView = (typeof SCRUM_HOME_VIEWS)[number]

export const SCRUM_STATE_FILTERS = ['late', 'proxy'] as const
export type ScrumStateFilter = (typeof SCRUM_STATE_FILTERS)[number]

export interface ScrumCalendarFilters {
  hasBlocker: boolean
  hasWin: boolean
  state: '' | ScrumStateFilter
}

export const DEFAULT_SCRUM_FILTERS: ScrumCalendarFilters = { hasBlocker: false, hasWin: false, state: '' }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function toDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDaysToKey(dateKey: string, days: number): string {
  return toKey(new Date(toDate(dateKey).getTime() + days * MS_PER_DAY))
}

/** ISO week (Monday–Sunday) containing the date. */
export function isoWeekBounds(dateKey: string): { from: string; to: string } {
  const day = toDate(dateKey).getUTCDay() // 0 = Sunday
  const offsetToMonday = (day + 6) % 7
  const from = addDaysToKey(dateKey, -offsetToMonday)
  return { from, to: addDaysToKey(from, 6) }
}

export function monthBounds(dateKey: string): { from: string; to: string } {
  const d = toDate(dateKey)
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { from: toKey(first), to: toKey(last) }
}

/** One fetch covers the month grid AND the ISO week (which can straddle a month boundary). */
export function calendarFetchRange(dateKey: string): { from: string; to: string } {
  const month = monthBounds(dateKey)
  const week = isoWeekBounds(dateKey)
  return {
    from: week.from < month.from ? week.from : month.from,
    to: week.to > month.to ? week.to : month.to,
  }
}

export function isInRange(dateKey: string, range: { from: string; to: string }): boolean {
  return dateKey >= range.from && dateKey <= range.to
}

/** Step the focused date by one unit of the active view (month views step months, week steps weeks, day steps days). */
export function stepDateKey(dateKey: string, view: ScrumHomeView, delta: number): string {
  if (view === 'week') return addDaysToKey(dateKey, 7 * delta)
  if (view === 'day') return addDaysToKey(dateKey, delta)
  const d = toDate(dateKey)
  const targetMonth = d.getUTCMonth() + delta
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
  return toKey(new Date(Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), lastDayOfTarget))))
}

/** Date key of a serialized scrumDate (`2026-07-14T00:00:00.000Z` or `2026-07-14`). */
export function scrumDateKeyOf(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : value instanceof Date ? toKey(value) : ''
}

export interface ScrumDeepLink {
  date?: string
  updateId?: string
  view?: ScrumHomeView
}

/** Parse `?date=`, `?update=` and `?view=` (notification + wins-page links). Invalid values are dropped. */
export function parseScrumDeepLink(params: { get(name: string): string | null } | null | undefined): ScrumDeepLink {
  if (!params) return {}
  const out: ScrumDeepLink = {}
  const date = params.get('date')
  if (isDateKey(date)) out.date = date
  const updateId = params.get('update')
  if (updateId && /^[A-Za-z0-9_-]{1,64}$/.test(updateId)) out.updateId = updateId
  const view = params.get('view')
  if (view && (SCRUM_HOME_VIEWS as readonly string[]).includes(view)) out.view = view as ScrumHomeView
  // An update link or a bare date both mean "show me that day".
  if (!out.view && (out.updateId || out.date)) out.view = 'day'
  return out
}

export interface ScrumSavedViewFilters extends ScrumCalendarFilters {
  view?: ScrumHomeView
}

/** Normalise a stored `filtersJson` (untrusted JSON) into the filter shape the home understands. */
export function normalizeSavedViewFilters(json: unknown): ScrumSavedViewFilters {
  const value = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const state = typeof value.state === 'string' && (SCRUM_STATE_FILTERS as readonly string[]).includes(value.state)
    ? (value.state as ScrumStateFilter)
    : ''
  const view = typeof value.view === 'string' && (SCRUM_HOME_VIEWS as readonly string[]).includes(value.view)
    ? (value.view as ScrumHomeView)
    : undefined
  return {
    hasBlocker: value.hasBlocker === true,
    hasWin: value.hasWin === true,
    state,
    ...(view ? { view } : {}),
  }
}

/** Local (device-only) draft key for the submit form. */
export function scrumDraftStorageKey(subjectUserId: string | undefined, dateKey: string): string {
  return `scrum-draft:${subjectUserId || 'me'}:${dateKey}`
}
