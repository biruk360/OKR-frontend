/**
 * Sorting + CSV export for the Filters results list. Pure functions — the
 * workspace keeps the sort in the URL (`sort`, `dir`) like the other filters.
 */
import type { FilteredResult, FiltersTab } from './types'

export type ResultsSortKey = 'plan' | 'progress' | 'confidence' | 'due' | 'updated' | 'title'
export type SortDirection = 'asc' | 'desc'

export interface ResultsSort {
  key: ResultsSortKey
  dir: SortDirection
}

export const DEFAULT_RESULTS_SORT: ResultsSort = { key: 'plan', dir: 'asc' }

export const RESULTS_SORT_OPTIONS: { value: ResultsSortKey; label: string }[] = [
  { value: 'plan', label: 'Plan (default)' },
  { value: 'progress', label: 'Progress' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'due', label: 'Due / end date' },
  { value: 'updated', label: 'Last updated' },
  { value: 'title', label: 'Title' },
]

const SORT_KEYS = new Set<string>(RESULTS_SORT_OPTIONS.map((o) => o.value))

/** Key results carry no due date of their own, so that option is hidden there. */
export function sortOptionsForTab(tab: FiltersTab) {
  return tab === 'key-results' ? RESULTS_SORT_OPTIONS.filter((o) => o.value !== 'due') : RESULTS_SORT_OPTIONS
}

/** The natural first direction for a key (most useful end first). */
export function defaultDirection(key: ResultsSortKey): SortDirection {
  return key === 'updated' ? 'desc' : 'asc'
}

export function parseResultsSort(sort: string | null | undefined, dir: string | null | undefined): ResultsSort {
  if (!sort || !SORT_KEYS.has(sort)) return DEFAULT_RESULTS_SORT
  const key = sort as ResultsSortKey
  return { key, dir: dir === 'asc' || dir === 'desc' ? dir : defaultDirection(key) }
}

/** Worst first when ascending: Off track → At risk → On track. */
const CONFIDENCE_RANK: Record<string, number> = { OFF_TRACK: 0, AT_RISK: 1, ON_TRACK: 2 }

function sortValue(result: FilteredResult, key: ResultsSortKey): number | string | null {
  switch (key) {
    case 'progress':
      return typeof result.progress === 'number' ? result.progress : null
    case 'confidence':
      return result.confidence && result.confidence in CONFIDENCE_RANK ? CONFIDENCE_RANK[result.confidence] : null
    case 'due': {
      const t = result.dueDate ? Date.parse(result.dueDate) : NaN
      return Number.isNaN(t) ? null : t
    }
    case 'updated': {
      const t = result.updatedAt ? Date.parse(result.updatedAt) : NaN
      return Number.isNaN(t) ? null : t
    }
    case 'title':
      return result.title?.toLocaleLowerCase() ?? null
    default:
      return null
  }
}

/**
 * Stable sort. Items without a value (no due date, no confidence yet) always
 * go last, whichever direction is chosen. `plan` keeps the API order.
 */
export function sortResults(results: FilteredResult[], sort: ResultsSort): FilteredResult[] {
  if (sort.key === 'plan') return results
  const sign = sort.dir === 'desc' ? -1 : 1
  return results
    .map((result, index) => ({ result, index, value: sortValue(result, sort.key) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index
      if (a.value === null) return 1
      if (b.value === null) return -1
      const cmp = typeof a.value === 'string' && typeof b.value === 'string'
        ? a.value.localeCompare(b.value)
        : (a.value as number) - (b.value as number)
      return cmp !== 0 ? cmp * sign : a.index - b.index
    })
    .map((entry) => entry.result)
}

const CONFIDENCE_LABEL: Record<string, string> = { ON_TRACK: 'On track', AT_RISK: 'At risk', OFF_TRACK: 'Off track' }

/** Header + rows for a CSV of the currently visible results. */
export function resultsCsvTable(results: FilteredResult[], tab: FiltersTab): { header: string[]; rows: (string | number | null)[][] } {
  if (tab === 'key-results') {
    return {
      header: ['Key result', 'Objective', 'Plan', 'Owner', 'Progress %', 'Confidence', 'Start', 'Current', 'Target', 'Unit', 'Last updated'],
      rows: results.map((r) => [
        r.title, r.objectiveTitle ?? '', r.planName, r.ownerName ?? '', r.progress ?? null,
        CONFIDENCE_LABEL[r.confidence ?? ''] ?? '', r.startValue ?? null, r.currentValue ?? null, r.targetValue ?? null,
        r.unit ?? '', r.updatedAt ?? '',
      ]),
    }
  }
  if (tab === 'objectives') {
    return {
      header: ['Objective', 'Plan', 'Level', 'Owner', 'Progress %', 'Confidence', 'Key results', 'End date', 'Last updated'],
      rows: results.map((r) => [
        r.title, r.planName, r.level ?? '', r.ownerName ?? '', r.progress ?? null,
        CONFIDENCE_LABEL[r.confidence ?? ''] ?? '', r.krCount ?? null, r.dueDate ?? '', r.updatedAt ?? '',
      ]),
    }
  }
  return {
    header: ['Initiative', 'Plan', 'Owner', 'Status', 'Progress %', 'Due date', 'Last updated'],
    rows: results.map((r) => [r.title, r.planName, r.ownerName ?? '', r.workStatus ?? '', r.progress ?? null, r.dueDate ?? '', r.updatedAt ?? '']),
  }
}
