/**
 * Decisions page URL state and log ordering. Pure, unit-tested in
 * decisions-params.test.ts.
 *
 *   view=open|decided|deferred|withdrawn|all   status tab of the log (default open)
 *   timeframeId=<id>|all   deciderId=<id>|me   requestedById=<id>|me   batch=<label>|__none__   q=<text>
 *   decision=<id>  (lib/package/links decisionHref)  or  focus=<id>  (lib/connections/flags decisionHref)
 *
 * timeframeId, deciderId, requestedById and q go to GET /api/decisions; the
 * status tab and batch are applied in the browser so the tabs can show counts
 * and the batch menu keeps every batch of the loaded log.
 */
import type { DecisionStatus } from '@/types/package'

export const DECISION_LOG_VIEWS = ['open', 'decided', 'deferred', 'withdrawn', 'all'] as const
export type DecisionLogView = (typeof DECISION_LOG_VIEWS)[number]

export const DECISION_LOG_VIEW_LABELS: Record<DecisionLogView, string> = {
  open: 'Open',
  decided: 'Decided',
  deferred: 'Deferred',
  withdrawn: 'Withdrawn',
  all: 'All',
}

const VIEW_STATUS: Record<Exclude<DecisionLogView, 'all'>, DecisionStatus> = {
  open: 'OPEN',
  decided: 'DECIDED',
  deferred: 'DEFERRED',
  withdrawn: 'WITHDRAWN',
}

/** Same value as NO_BATCH_FILTER in features/decisions (selects decisions without a batch). */
export const NO_BATCH = '__none__'

export interface DecisionsPageState {
  view: DecisionLogView
  timeframeId: string | null
  deciderId: string | null
  requestedById: string | null
  batch: string | null
  q: string | null
  /** Decision to open (`?decision=` or `?focus=`). */
  focusId: string | null
}

type Input = { get(name: string): string | null } | Record<string, string | string[] | undefined>

function reader(input: Input): (key: string) => string | null {
  if (typeof (input as { get?: unknown }).get === 'function') {
    const sp = input as { get(name: string): string | null }
    return (key) => sp.get(key)?.trim() || null
  }
  const record = input as Record<string, string | string[] | undefined>
  return (key) => {
    const value = record[key]
    const first = Array.isArray(value) ? value[0] : value
    return first?.trim() || null
  }
}

export function parseDecisionsPageState(input: Input): DecisionsPageState {
  const get = reader(input)
  const view = get('view')
  const timeframeId = get('timeframeId')
  return {
    view: (DECISION_LOG_VIEWS as readonly string[]).includes(view ?? '') ? (view as DecisionLogView) : 'open',
    timeframeId: timeframeId && timeframeId !== 'all' ? timeframeId : null,
    deciderId: get('deciderId'),
    requestedById: get('requestedById'),
    batch: get('batch'),
    q: get('q')?.slice(0, 200) ?? null,
    focusId: get('decision') ?? get('focus'),
  }
}

export function decisionsPageQuery(state: DecisionsPageState): string {
  const out = new URLSearchParams()
  if (state.view !== 'open') out.set('view', state.view)
  if (state.timeframeId) out.set('timeframeId', state.timeframeId)
  if (state.deciderId) out.set('deciderId', state.deciderId)
  if (state.requestedById) out.set('requestedById', state.requestedById)
  if (state.batch) out.set('batch', state.batch)
  if (state.q) out.set('q', state.q)
  if (state.focusId) out.set('decision', state.focusId)
  const query = out.toString()
  return query ? `?${query}` : ''
}

interface LogItem {
  status: DecisionStatus
  batch: string | null
  neededBy: string | null
  decidedAt: string | null
  updatedAt: string
}

export function matchesLogView(item: Pick<LogItem, 'status'>, view: DecisionLogView): boolean {
  return view === 'all' || item.status === VIEW_STATUS[view]
}

export function matchesBatch(item: Pick<LogItem, 'batch'>, batch: string | null): boolean {
  if (!batch) return true
  const own = item.batch?.trim() || null
  return batch === NO_BATCH ? own === null : own === batch
}

export function countByView(items: ReadonlyArray<Pick<LogItem, 'status'>>): Record<DecisionLogView, number> {
  const counts: Record<DecisionLogView, number> = { open: 0, decided: 0, deferred: 0, withdrawn: 0, all: items.length }
  for (const item of items) {
    for (const view of ['open', 'decided', 'deferred', 'withdrawn'] as const) {
      if (item.status === VIEW_STATUS[view]) counts[view] += 1
    }
  }
  return counts
}

/** Distinct batch labels in first-needed order, plus whether any item has no batch. */
export function batchOptions(items: ReadonlyArray<Pick<LogItem, 'batch' | 'neededBy'>>): { batches: string[]; hasUnbatched: boolean } {
  const earliest = new Map<string, number>()
  let hasUnbatched = false
  for (const item of items) {
    const batch = item.batch?.trim()
    if (!batch) {
      hasUnbatched = true
      continue
    }
    const t = item.neededBy ? new Date(item.neededBy).getTime() : Number.POSITIVE_INFINITY
    const prev = earliest.get(batch)
    if (prev === undefined || t < prev) earliest.set(batch, Number.isNaN(t) ? Number.POSITIVE_INFINITY : t)
  }
  const batches = Array.from(earliest.entries())
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([batch]) => batch)
  return { batches, hasUnbatched }
}

/**
 * Log order: open and deferred first by needed-by (`compareOpen`, the
 * decisions feature's compareByNeededBy), then closed ones, most recently
 * decided or changed first.
 */
export function orderDecisionLog<T extends LogItem>(items: readonly T[], compareOpen: (a: T, b: T) => number): T[] {
  const isOpen = (d: T) => d.status === 'OPEN' || d.status === 'DEFERRED'
  const open = items.filter(isOpen).sort(compareOpen)
  const closed = items
    .filter((d) => !isOpen(d))
    .sort((a, b) => (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt))
  return [...open, ...closed]
}
