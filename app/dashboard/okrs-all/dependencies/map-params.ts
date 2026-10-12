/**
 * Dependency Map (DEP-6) URL state — pure, unit-tested in map-params.test.ts.
 *
 * The page keeps every filter in the query string so a filtered map can be
 * shared and the CSV export matches what is on screen. Filter keys are the
 * same as GET /api/dependencies (timeframeId, status, type, providerId,
 * neederId, due, linkedType, linkedId, q, scope, mine); the page adds:
 *   view=table|graph        — table (default) or the CON-4 company graph
 *   dependency=<id>         — open one dependency (lib/package/links dependencyMapHref)
 *   focus=<id>              — same, for lib/connections/flags dependencyHref links
 *   linkedLabel=<text>      — display title of the linked KR filter
 */
import type { DependencyDueWindow, DependencyListFilters } from '@/features/dependencies'
import {
  isDependencyLinkEntityType,
  isDependencyStatus,
  isDependencyType,
  type DependencyStatus,
  type DependencyType,
} from '@/types/package'

export type DependencyMapView = 'table' | 'graph'

export interface DependencyMapState {
  filters: DependencyListFilters
  view: DependencyMapView
  /** Dependency to open (from `?dependency=` or `?focus=`). */
  focusId: string | null
  linkedLabel: string | null
}

export type SearchParamsInput =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>

function reader(input: SearchParamsInput): (key: string) => string | undefined {
  if (typeof (input as URLSearchParams).get === 'function') {
    const sp = input as { get(name: string): string | null }
    return (key) => sp.get(key)?.trim() || undefined
  }
  const record = input as Record<string, string | string[] | undefined>
  return (key) => {
    const value = record[key]
    const first = Array.isArray(value) ? value[0] : value
    return first?.trim() || undefined
  }
}

function list<T extends string>(raw: string | undefined, guard: (v: unknown) => v is T): T[] | undefined {
  if (!raw) return undefined
  const values = Array.from(new Set(raw.split(',').map((v) => v.trim().toUpperCase()))).filter(guard)
  return values.length ? values : undefined
}

// Mirrors DEPENDENCY_DUE_WINDOWS (type-checked) without loading the client barrel in unit tests.
const DUE_WINDOWS = ['late', 'due_soon', 'next_30', 'no_date'] as const satisfies readonly DependencyDueWindow[]

function isDueWindow(value: unknown): value is DependencyDueWindow {
  return typeof value === 'string' && (DUE_WINDOWS as readonly string[]).includes(value)
}

/** Reads the page state from the query string, dropping anything invalid. */
export function parseDependencyMapState(input: SearchParamsInput): DependencyMapState {
  const get = reader(input)
  const filters: DependencyListFilters = {}

  const timeframeId = get('timeframeId')
  if (timeframeId && timeframeId !== 'all') filters.timeframeId = timeframeId
  const status = list<DependencyStatus>(get('status'), isDependencyStatus)
  if (status) filters.status = status
  const type = list<DependencyType>(get('type'), isDependencyType)
  if (type) filters.type = type
  const providerId = get('providerId')
  if (providerId) filters.providerId = providerId
  const neederId = get('neederId')
  if (neederId) filters.neederId = neederId
  const due = get('due')
  if (isDueWindow(due)) filters.due = due
  const linkedType = get('linkedType')?.toUpperCase()
  const linkedId = get('linkedId')
  if (linkedId && isDependencyLinkEntityType(linkedType)) {
    filters.linkedType = linkedType
    filters.linkedId = linkedId
  }
  const q = get('q')
  if (q) filters.q = q.slice(0, 200)
  const scope = get('scope')
  if (scope === 'company' || scope === 'package') filters.scope = scope
  const mine = get('mine')
  if (mine === '1' || mine === 'true') filters.mine = true

  return {
    filters,
    view: get('view') === 'graph' ? 'graph' : 'table',
    focusId: get('dependency') ?? get('focus') ?? null,
    linkedLabel: filters.linkedId ? (get('linkedLabel') ?? null) : null,
  }
}

/** Query string (with leading `?`, or '') for a page state. */
export function dependencyMapQuery(state: DependencyMapState): string {
  const out = new URLSearchParams()
  const f = state.filters
  if (f.timeframeId) out.set('timeframeId', f.timeframeId)
  if (f.status?.length) out.set('status', f.status.join(','))
  if (f.type?.length) out.set('type', f.type.join(','))
  if (f.providerId) out.set('providerId', f.providerId)
  if (f.neederId) out.set('neederId', f.neederId)
  if (f.due) out.set('due', f.due)
  if (f.linkedType && f.linkedId) {
    out.set('linkedType', f.linkedType)
    out.set('linkedId', f.linkedId)
    if (state.linkedLabel) out.set('linkedLabel', state.linkedLabel)
  }
  if (f.q) out.set('q', f.q)
  if (f.scope) out.set('scope', f.scope)
  if (f.mine) out.set('mine', '1')
  if (state.view === 'graph') out.set('view', 'graph')
  if (state.focusId) out.set('dependency', state.focusId)
  const query = out.toString()
  return query ? `?${query}` : ''
}

/** Number of active filters (for the "Clear filters" affordance). */
export function activeFilterCount(filters: DependencyListFilters): number {
  return [
    filters.timeframeId,
    filters.status?.length,
    filters.type?.length,
    filters.providerId,
    filters.neederId,
    filters.due,
    filters.linkedId,
    filters.q,
    filters.scope,
    filters.mine,
  ].filter(Boolean).length
}
